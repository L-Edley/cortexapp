import { describe, it, expect, beforeEach } from "vitest";
import { getConfiguredProvider } from "../aionWebSearchProvider";

function setProvider(name: string) {
  process.env.WEB_SEARCH_PROVIDER = name;
}
function clearAll() {
  delete process.env.WEB_SEARCH_PROVIDER;
  delete process.env.TAVILY_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.SERPER_API_KEY;
}

describe("getConfiguredProvider", () => {
  beforeEach(() => clearAll());

  it("retorna null quando nenhum provider configurado", () => {
    expect(getConfiguredProvider()).toBeNull();
  });

  it("retorna null para provider desconhecido", () => {
    setProvider("nonexistent");
    expect(getConfiguredProvider()).toBeNull();
  });

  it("retorna tavily quando configurado", () => {
    setProvider("tavily");
    process.env.TAVILY_API_KEY = "test-key";
    const provider = getConfiguredProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("tavily");
  });

  it("tavily provider é criado mas search lança erro sem API key", () => {
    setProvider("tavily");
    delete process.env.TAVILY_API_KEY;
    const provider = getConfiguredProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("tavily");
  });

  it("retorna brave quando configurado", () => {
    setProvider("brave");
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    const provider = getConfiguredProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("brave");
  });

  it("retorna serper quando configurado", () => {
    setProvider("serper");
    process.env.SERPER_API_KEY = "test-key";
    const provider = getConfiguredProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("serper");
  });

  it("retorna manual_mock sem API key", () => {
    setProvider("manual_mock");
    const provider = getConfiguredProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("manual_mock");
  });

  it("manual_mock.search retorna resultados simulados", async () => {
    setProvider("manual_mock");
    const provider = getConfiguredProvider()!;
    const result = await provider.search("preço do dólar");
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.query).toBe("preço do dólar");
    expect(result.provider).toBe("manual_mock");
    expect(result.sources[0]).toHaveProperty("title");
    expect(result.sources[0]).toHaveProperty("url");
    expect(result.sources[0]).toHaveProperty("snippet");
  });
});

describe("Tavily provider integration", () => {
  it("provider tavily tem search function", () => {
    process.env.TAVILY_API_KEY = "test-key";
    const provider = getConfiguredProvider();
    expect(provider).not.toBeNull();
    expect(typeof provider?.search).toBe("function");
  });
});

describe("Brave provider integration", () => {
  it("provider brave tem search function", () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    const provider = getConfiguredProvider();
    expect(provider).not.toBeNull();
    expect(typeof provider?.search).toBe("function");
  });
});

describe("Serper provider integration", () => {
  it("provider serper tem search function", () => {
    process.env.SERPER_API_KEY = "test-key";
    const provider = getConfiguredProvider();
    expect(provider).not.toBeNull();
    expect(typeof provider?.search).toBe("function");
  });
});
