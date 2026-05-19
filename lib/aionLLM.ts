import { getOrderedProviders } from "@/lib/ai";

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
  route: "ollama_before" | "ollama_after" | "provider_chain" | "none";
}

export async function callWithFallback(
  prompt: string,
  systemPrompt: string
): Promise<LLMRouterResult> {
  const ollamaAvailable = await isOllamaAvailable();
  const priority = (process.env.OLLAMA_PRIORITY || "after-cloud") as
    | "before-cloud"
    | "after-cloud";
  const ollamaModel = process.env.OLLAMA_MODEL || "mistral:7b-q4_k_m";

  const ERROR_PREFIXES = ["opencode_", "openrouter_", "groq_", "nvidia_"];

  if (priority === "before-cloud" && ollamaAvailable) {
    const text = await callOllama(prompt, systemPrompt);
    if (text) {
      console.log("[AION] Ollama before-cloud respondeu");
      return {
        text,
        providerUsed: "ollama",
        model: ollamaModel,
        fallbackUsed: false,
        ollamaAvailable: true,
        route: "ollama_before",
      };
    }
    console.warn("[AION] Ollama before-cloud falhou, seguindo para cloud");
  }

  const providers = getOrderedProviders();
  for (const entry of providers) {
    try {
      const text = await entry.provider.generateResponse(prompt, systemPrompt);
      if (text) {
        const isError = ERROR_PREFIXES.some((p) => text.startsWith(p));
        if (!isError) {
          return {
            text,
            providerUsed: entry.name,
            model: process.env.AI_MODEL || "(não definido)",
            fallbackUsed: false,
            ollamaAvailable,
            route: "provider_chain",
          };
        }
        console.warn(
          `[AION] provider ${entry.name} retornou erro: ${text}`
        );
      }
    } catch (err) {
      console.warn(`[AION] provider ${entry.name} exception:`, err);
    }
  }

  if (priority === "after-cloud" && ollamaAvailable) {
    const text = await callOllama(prompt, systemPrompt);
    if (text) {
      console.log("[AION] Ollama after-cloud respondeu");
      return {
        text,
        providerUsed: "ollama",
        model: ollamaModel,
        fallbackUsed: false,
        ollamaAvailable: true,
        route: "ollama_after",
      };
    }
  }

  console.warn("[AION] todos os LLM providers falharam");
  return {
    text: null,
    providerUsed: "none",
    model: process.env.AI_MODEL || "(não definido)",
    fallbackUsed: true,
    ollamaAvailable,
    route: "none",
  };
}
