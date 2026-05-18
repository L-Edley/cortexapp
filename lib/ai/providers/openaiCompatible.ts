import type { AIProvider } from "@/lib/ai/types";

function extractContent(data: Record<string, unknown>): string | null {
  const content = data?.choices?.[0]?.message?.content;

  if (content === null || content === undefined) return null;

  if (typeof content === "string") {
    if (content.trim().length === 0) return null;
    return content;
  }

  if (Array.isArray(content)) {
    const joined = content.filter((x: unknown) => typeof x === "string").join("");
    return joined.length > 0 ? joined : null;
  }

  if (typeof content === "object") {
    const str = JSON.stringify(content);
    return str.length > 0 ? str : null;
  }

  return null;
}

interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  providerName: string;
}

export class OpenAICompatibleProvider implements AIProvider {
  private config: OpenAICompatibleConfig;
  private apiKey: string;
  private model: string;

  constructor(config: OpenAICompatibleConfig) {
    this.config = config;
    this.apiKey = process.env[config.apiKeyEnv] || process.env.AI_API_KEY || "";
    this.model = process.env[config.modelEnv] || process.env.AI_MODEL || config.defaultModel;
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string
  ): Promise<string | null> {
    const { baseUrl, providerName } = this.config;

    if (!this.apiKey) {
      console.warn(`[AION] ${providerName.toUpperCase()}_API_KEY ausente`);
      return null;
    }

    const apiUrl = `${baseUrl}/chat/completions`;
    console.log(`[AION] calling ${providerName} model:`, this.model);

    const pfx = providerName.toLowerCase();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        const status = res.status;

        if (status === 401 || status === 403) {
          console.error(`[AION] ${providerName} erro de autenticação (${status})`);
          return `${pfx}_http_401`;
        }

        if (status === 429) {
          console.error(`[AION] ${providerName} rate limit (${status})`);
          return `${pfx}_rate_limit`;
        }

        if (status >= 500) {
          console.error(`[AION] ${providerName} erro de servidor (${status}): ${errorBody}`);
          return `${pfx}_server_error`;
        }

        console.error(`[AION] ${providerName} erro ${status}: ${errorBody}`);
        return null;
      }

      const data = (await res.json()) as Record<string, unknown>;

      if (data.error) {
        console.error(`[AION] ${providerName} erro no body:`, JSON.stringify(data.error));
        return `${pfx}_server_error`;
      }

      const content = extractContent(data);

      if (!content) {
        console.warn(`[AION] ${providerName}: resposta 200 sem conteúdo. keys:`, Object.keys(data).join(", "));
        return null;
      }

      console.log(`[AION] ${providerName} resposta recebida OK`);
      return content;
    } catch (err) {
      console.error(`[AION] ${providerName} erro de rede:`, err);
      return null;
    }
  }
}

export const GROQ_CONFIG: OpenAICompatibleConfig = {
  baseUrl: "https://api.groq.com/openai/v1",
  apiKeyEnv: "GROQ_API_KEY",
  modelEnv: "GROQ_MODEL",
  defaultModel: "llama-3.1-8b-instant",
  providerName: "groq",
};

export const NVIDIA_CONFIG: OpenAICompatibleConfig = {
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKeyEnv: "NVIDIA_API_KEY",
  modelEnv: "NVIDIA_MODEL",
  defaultModel: "meta/llama-3.1-8b-instruct",
  providerName: "nvidia",
};