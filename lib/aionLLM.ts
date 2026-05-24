let ollamaCache: { available: boolean; timestamp: number } | null = null;
const OLLAMA_CACHE_TTL = 30_000;
const OLLAMA_TIMEOUT = 3_000;

export async function isOllamaAvailable(): Promise<boolean> {
  if (process.env.ENABLE_OLLAMA !== "true") return false;

  if (ollamaCache && Date.now() - ollamaCache.timestamp < OLLAMA_CACHE_TTL) {
    return ollamaCache.available;
  }

  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(id);
    ollamaCache = { available: res.ok, timestamp: Date.now() };
    return res.ok;
  } catch {
    ollamaCache = { available: false, timestamp: Date.now() };
    return false;
  }
}

export function clearOllamaCache(): void {
  ollamaCache = null;
}

export async function callOllama(
  prompt: string,
  systemPrompt: string
): Promise<string | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "mistral:7b-q4_k_m";

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      console.warn(`[AION] Ollama HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      message?: { content?: string };
    };
    return data?.message?.content ?? null;
  } catch (err) {
    console.warn("[AION] Ollama call failed:", err);
    return null;
  }
}

export interface LLMRouterResult {
  text: string | null;
  providerUsed: string;
  model: string;
  fallbackUsed: boolean;
  ollamaAvailable: boolean;
  route: "ollama" | "none";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
      promise.finally(() => clearTimeout(timer));
    }),
  ]);
}

export async function callWithFallback(
  prompt: string,
  systemPrompt: string
): Promise<LLMRouterResult> {
  const ollamaAvailable = await isOllamaAvailable();
  const ollamaModel = process.env.OLLAMA_MODEL || "mistral:7b-q4_k_m";

  if (ollamaAvailable) {
    try {
      const text = await withTimeout(callOllama(prompt, systemPrompt), 5000);
      if (text) {
        console.log("[AION] Ollama respondeu");
        return {
          text,
          providerUsed: "ollama",
          model: ollamaModel,
          fallbackUsed: false,
          ollamaAvailable: true,
          route: "ollama",
        };
      }
    } catch (err) {
      console.warn("[AION] Ollama falhou ou deu timeout:", err);
    }
  }

  console.warn("[AION] Ollama indisponível — providers cloud foram migrados para AION Core");
  return {
    text: null,
    providerUsed: "none",
    model: "(não disponível — usar AION Core)",
    fallbackUsed: true,
    ollamaAvailable,
    route: "none",
  };
}
