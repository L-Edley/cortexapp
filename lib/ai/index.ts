import type { AIProvider } from "./types";
import { GeminiProvider } from "./providers/gemini";
import { OpenRouterProvider } from "./providers/openrouter";
import { OpenCodeProvider } from "./providers/opencode";
import {
  OpenAICompatibleProvider,
  GROQ_CONFIG,
  NVIDIA_CONFIG,
} from "./providers/openaiCompatible";

export type { AIProvider } from "./types";

export type ProviderEntry = {
  provider: AIProvider;
  name: string;
};

function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.AI_API_KEY);
}

function hasNvidiaKey(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY || process.env.AI_API_KEY);
}

function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY);
}

function hasGeminiKey(): boolean {
  return Boolean(process.env.AI_API_KEY || process.env.GEMINI_API_KEY);
}

function hasOpenCodeKey(): boolean {
  return Boolean(process.env.OPENCODE_API_KEY || process.env.AI_API_KEY);
}

export function getAIProvider(): AIProvider | null {
  const result = buildCurrentProvider();
  return result?.provider ?? null;
}

function buildCurrentProvider(): ProviderEntry | null {
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const model = process.env.AI_MODEL || "(não definido)";

  switch (provider) {
    case "opencode":
    case "opencode_zen": {
      const key = process.env.OPENCODE_API_KEY || process.env.AI_API_KEY || "";
      console.log("[AION] provider: opencode");
      console.log("[AION] model:", model);
      console.log("[AION] hasOpenCodeKey:", hasOpenCodeKey());
      if (!key) {
        console.warn("[AION] OPENCODE_API_KEY ausente");
        return null;
      }
      return { provider: new OpenCodeProvider(key), name: "opencode" };
    }
    case "openrouter": {
      const key = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || "";
      console.log("[AION] provider: openrouter");
      console.log("[AION] model:", model);
      console.log("[AION] hasOpenRouterKey:", hasOpenRouterKey());
      if (!key) {
        console.warn("[AION] OPENROUTER_API_KEY ausente");
        return null;
      }
      return { provider: new OpenRouterProvider(key), name: "openrouter" };
    }
    case "gemini": {
      const key = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
      console.log("[AION] provider: gemini");
      console.log("[AION] model:", model);
      console.log("[AION] hasGeminiKey:", Boolean(key));
      if (!key) {
        console.warn("[AION] GEMINI_API_KEY ausente");
        return null;
      }
      return { provider: new GeminiProvider(), name: "gemini" };
    }
    case "groq": {
      console.log("[AION] provider: groq");
      console.log("[AION] model:", model);
      console.log("[AION] hasGroqKey:", hasGroqKey());
      if (!hasGroqKey()) {
        console.warn("[AION] GROQ_API_KEY ausente");
        return null;
      }
      return { provider: new OpenAICompatibleProvider(GROQ_CONFIG), name: "groq" };
    }
    case "nvidia": {
      console.log("[AION] provider: nvidia");
      console.log("[AION] model:", model);
      console.log("[AION] hasNvidiaKey:", hasNvidiaKey());
      if (!hasNvidiaKey()) {
        console.warn("[AION] NVIDIA_API_KEY ausente");
        return null;
      }
      return { provider: new OpenAICompatibleProvider(NVIDIA_CONFIG), name: "nvidia" };
    }
    case "mock":
      console.log("[AION] provider: mock — usando fallback local");
      return null;
    default:
      console.warn(
        `[AION] provider desconhecido: "${provider}". Use opencode, openrouter, gemini, groq, nvidia, ou mock.`
      );
      return null;
  }
}

export function getOrderedProviders(): ProviderEntry[] {
  const current = process.env.AI_PROVIDER || "gemini";
  const providers: ProviderEntry[] = [];

  const seen = new Set<string>();

  function add(name: string): void {
    if (seen.has(name)) return;
    seen.add(name);

    switch (name) {
      case "groq":
        if (hasGroqKey()) providers.push({ provider: new OpenAICompatibleProvider(GROQ_CONFIG), name: "groq" });
        break;
      case "nvidia":
        if (hasNvidiaKey()) providers.push({ provider: new OpenAICompatibleProvider(NVIDIA_CONFIG), name: "nvidia" });
        break;
      case "openrouter":
        if (hasOpenRouterKey()) providers.push({ provider: new OpenRouterProvider(process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || ""), name: "openrouter" });
        break;
      case "gemini":
        if (hasGeminiKey()) providers.push({ provider: new GeminiProvider(), name: "gemini" });
        break;
      case "opencode":
        if (hasOpenCodeKey()) providers.push({ provider: new OpenCodeProvider(process.env.OPENCODE_API_KEY || process.env.AI_API_KEY || ""), name: "opencode" });
        break;
    }
  }

  add(current);

  if (current === "groq") {
    add("nvidia");
  } else if (current === "nvidia") {
    add("groq");
  }

  add("openrouter");
  add("gemini");
  add("opencode");

  return providers;
}
