import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetOrderedProviders = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", () => ({
  getOrderedProviders: mockGetOrderedProviders,
}));

let aionLLMModule: typeof import("@/lib/aionLLM");

async function loadModule() {
  vi.resetModules();
  aionLLMModule = await import("@/lib/aionLLM");
  return aionLLMModule;
}

function mockFetch(response: unknown) {
  global.fetch = vi.fn().mockResolvedValue(response);
}

function mockFetchError() {
  global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));
}

function mockProvider(name: string, result: string | null) {
  const provider = { generateResponse: vi.fn().mockResolvedValue(result) };
  mockGetOrderedProviders.mockReturnValue([{ provider, name }]);
  return provider;
}

function mockProviderChain(
  entries: { name: string; result: string | null }[]
) {
  const providers = entries.map((e) => ({
    provider: { generateResponse: vi.fn().mockResolvedValue(e.result) },
    name: e.name,
  }));
  mockGetOrderedProviders.mockReturnValue(providers);
  return providers;
}

describe("isOllamaAvailable", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.ENABLE_OLLAMA;
    delete process.env.OLLAMA_BASE_URL;
    const mod = await loadModule();
    mod.clearOllamaCache();
  });

  it("retorna false se ENABLE_OLLAMA !== true", async () => {
    process.env.ENABLE_OLLAMA = "false";
    const { isOllamaAvailable } = await loadModule();
    expect(await isOllamaAvailable()).toBe(false);
  });

  it("retorna false se ENABLE_OLLAMA não definido", async () => {
    const { isOllamaAvailable } = await loadModule();
    expect(await isOllamaAvailable()).toBe(false);
  });

  it("retorna true se ENABLE_OLLAMA=true e health check OK", async () => {
    process.env.ENABLE_OLLAMA = "true";
    mockFetch({ ok: true });

    const { isOllamaAvailable } = await loadModule();
    expect(await isOllamaAvailable()).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("retorna false se health check falha (rejeitado)", async () => {
    process.env.ENABLE_OLLAMA = "true";
    mockFetchError();

    const { isOllamaAvailable } = await loadModule();
    expect(await isOllamaAvailable()).toBe(false);
  });

  it("retorna false se health check retorna !ok", async () => {
    process.env.ENABLE_OLLAMA = "true";
    mockFetch({ ok: false });

    const { isOllamaAvailable } = await loadModule();
    expect(await isOllamaAvailable()).toBe(false);
  });

  it("usa cache por 30s", async () => {
    process.env.ENABLE_OLLAMA = "true";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    global.fetch = fetchMock;

    const { isOllamaAvailable } = await loadModule();
    // First call hits API, second uses cache
    expect(await isOllamaAvailable()).toBe(true);
    expect(await isOllamaAvailable()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("callOllama", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.ENABLE_OLLAMA;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    await loadModule();
  });

  it("retorna null se fetch falha", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const { callOllama } = await loadModule();
    const result = await callOllama("test prompt", "test system");
    expect(result).toBeNull();
  });

  it("retorna null se resposta não é ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const { callOllama } = await loadModule();
    const result = await callOllama("test prompt", "test system");
    expect(result).toBeNull();
  });

  it("retorna conteúdo da mensagem se sucesso", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { content: "Resposta do Ollama" },
        }),
    });
    const { callOllama } = await loadModule();
    const result = await callOllama("test prompt", "test system");
    expect(result).toBe("Resposta do Ollama");
  });

  it("usa OLLAMA_BASE_URL e OLLAMA_MODEL configurados", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:12345";
    process.env.OLLAMA_MODEL = "llama2:latest";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: "ok" } }),
    });
    const { callOllama } = await loadModule();
    await callOllama("prompt", "system");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:12345/api/chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("llama2:latest"),
      })
    );
  });
});

describe("callWithFallback", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.ENABLE_OLLAMA;
    delete process.env.OLLAMA_PRIORITY;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    const mod = await loadModule();
    mod.clearOllamaCache();
  });

  it("não tenta Ollama quando ENABLE_OLLAMA=false", async () => {
    process.env.ENABLE_OLLAMA = "false";
    process.env.OLLAMA_PRIORITY = "before-cloud";
    global.fetch = vi.fn();

    mockProvider("opencode", '{"reply":"test","voiceReply":"test","action":"none","confidence":1}');

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    expect(result.providerUsed).toBe("opencode");
    expect(result.ollamaAvailable).toBe(false);
    expect(result.route).toBe("provider_chain");
  });

  it("tenta Ollama antes dos providers se OLLAMA_PRIORITY=before-cloud", async () => {
    process.env.ENABLE_OLLAMA = "true";
    process.env.OLLAMA_PRIORITY = "before-cloud";
    process.env.OLLAMA_MODEL = "mistral:7b";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: "Resposta local" } }),
    });

    mockProvider("groq", null);

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    expect(result.providerUsed).toBe("ollama");
    expect(result.route).toBe("ollama_before");
    expect(result.model).toBe("mistral:7b");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("tenta providers se Ollama before-cloud falha", async () => {
    process.env.ENABLE_OLLAMA = "true";
    process.env.OLLAMA_PRIORITY = "before-cloud";

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });

    mockProvider("gemini", '{"reply":"ok","voiceReply":"ok","action":"none","confidence":1}');

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    expect(result.providerUsed).toBe("gemini");
    expect(result.route).toBe("provider_chain");
  });

  it("tenta Ollama depois dos providers se OLLAMA_PRIORITY=after-cloud", async () => {
    process.env.ENABLE_OLLAMA = "true";
    process.env.OLLAMA_PRIORITY = "after-cloud";
    process.env.OLLAMA_MODEL = "mistral:7b";

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: { content: "fallback ollama" } }) });

    mockProviderChain([
      { name: "groq", result: "groq_server_error" },
      { name: "opencode", result: "opencode_server_error" },
    ]);

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    expect(result.providerUsed).toBe("ollama");
    expect(result.route).toBe("ollama_after");
    expect(result.text).toBe("fallback ollama");
  });

  it("falha do Ollama não quebra cadeia Groq/OpenCode", async () => {
    process.env.ENABLE_OLLAMA = "true";
    process.env.OLLAMA_PRIORITY = "before-cloud";

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });

    mockProviderChain([
      { name: "groq", result: "groq_server_error" },
      { name: "opencode", result: '{"reply":"opencode funcionou","voiceReply":"opencode","action":"none","confidence":1}' },
    ]);

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    expect(result.providerUsed).toBe("opencode");
    expect(result.route).toBe("provider_chain");
    expect(result.text).toContain("opencode funcionou");
  });

  it("Groq continua disponível na cadeia", async () => {
    process.env.ENABLE_OLLAMA = "false";
    process.env.AI_PROVIDER = "groq";

    mockProvider("groq", '{"reply":"groq ok","voiceReply":"groq","action":"none","confidence":1}');

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    expect(result.providerUsed).toBe("groq");
    expect(result.route).toBe("provider_chain");
    expect(result.text).toContain("groq ok");
  });

  it("OpenCode continua disponível na cadeia", async () => {
    process.env.ENABLE_OLLAMA = "false";
    process.env.AI_PROVIDER = "opencode";

    mockProvider("opencode", '{"reply":"opencode ok","voiceReply":"opencode","action":"none","confidence":1}');

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    expect(result.providerUsed).toBe("opencode");
    expect(result.route).toBe("provider_chain");
    expect(result.text).toContain("opencode ok");
  });

  it("fallback local se todos falharem", async () => {
    process.env.ENABLE_OLLAMA = "false";

    mockProviderChain([
      { name: "groq", result: null },
      { name: "opencode", result: null },
    ]);

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    expect(result.text).toBeNull();
    expect(result.providerUsed).toBe("none");
    expect(result.fallbackUsed).toBe(true);
    expect(result.route).toBe("none");
  });

  it("nenhuma API key exposta no resultado", async () => {
    process.env.ENABLE_OLLAMA = "false";

    mockProvider("opencode", '{"reply":"ok","voiceReply":"ok","action":"none","confidence":1}');

    const { callWithFallback } = await loadModule();
    const result = await callWithFallback("prompt", "system");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("gsk_");
  });
});
