import type { AIProvider } from "@/lib/ai/types";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

function extractContent(data: Record<string, unknown>): string | null {
  const content = data?.choices?.[0]?.message?.content;

  if (content === null || content === undefined) {
    console.warn(
      "[AION:OPENROUTER] message.content nulo/ausente. keys:",
      Object.keys(data?.choices?.[0]?.message || {}).join(", ")
    );
    return null;
  }

  if (typeof content === "string") {
    if (content.trim().length === 0) {
      console.warn("[AION:OPENROUTER] message.content string vazia");
      return null;
    }
    return content;
  }

  if (Array.isArray(content)) {
    const joined = content
      .filter((x: unknown) => typeof x === "string")
      .join("");
    if (joined.length > 0) return joined;
    console.warn("[AION:OPENROUTER] message.content array sem strings");
    return null;
  }

  if (typeof content === "object") {
    const str = JSON.stringify(content);
    if (str.length > 0) return str;
  }

  console.warn(
    "[AION:OPENROUTER] message.content tipo inesperado:",
    typeof content
  );
  return null;
}

export class OpenRouterProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey =
      apiKey ||
      process.env.OPENROUTER_API_KEY ||
      process.env.AI_API_KEY ||
      "";
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string
  ): Promise<string | null> {
    if (!this.apiKey) {
      console.warn("[AION] OPENROUTER_API_KEY ausente");
      return null;
    }

    const modelName = process.env.AI_MODEL || "google/gemini-2.5-flash:free";

    console.log("[AION] calling OpenRouter model:", modelName);

    const body: Record<string, unknown> = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
    };

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Cortex Aion",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorBody = await res
          .text()
          .catch(() => "não foi possível ler o corpo do erro");
        const status = res.status;
        const statusText = res.statusText;

        if (status === 401 || status === 403) {
          console.error(
            `[AION] OpenRouter erro de autenticação (${status} ${statusText}): chave inválida ou sem saldo`
          );
          return status === 401
            ? "openrouter_http_401"
            : "openrouter_http_403";
        }

        if (status === 400) {
          console.error(
            `[AION] OpenRouter requisição inválida (${status} ${statusText}): modelo "${modelName}" pode ser inválido`
          );
          console.error(`[AION] body do erro: ${errorBody}`);
          return "openrouter_http_400";
        }

        if (status === 429) {
          console.error(
            `[AION] OpenRouter rate limit atingido (${status} ${statusText})`
          );
          return "openrouter_rate_limit";
        }

        if (status >= 500) {
          console.error(
            `[AION] OpenRouter erro de servidor (${status} ${statusText})`
          );
          console.error(`[AION] body do erro: ${errorBody}`);
          return "openrouter_server_error";
        }

        console.error(
          `[AION] OpenRouter erro inesperado (${status} ${statusText}): ${errorBody}`
        );
        return null;
      }

      const data = (await res.json()) as Record<string, unknown>;
      console.log("[AION:OPENROUTER:RAW]", JSON.stringify(data, null, 2));

      if (data.error) {
        console.error(
          "[AION] OpenRouter erro no body:",
          JSON.stringify(data.error)
        );
        return "openrouter_server_error";
      }

      const content = extractContent(data);
      console.log("[AION:OPENROUTER:CONTENT]", content);

      if (!content) {
        console.warn(
          "[AION] OpenRouter: resposta 200 sem conteúdo textual. keys:",
          Object.keys(data).join(", ")
        );
        console.warn(
          "[AION] OpenRouter resposta completa:",
          JSON.stringify(data).slice(0, 2000)
        );
        return null;
      }

      console.log("[AION] OpenRouter resposta recebida OK");
      return content;
    } catch (err) {
      console.error("[AION] OpenRouter erro de rede:", err);
      return null;
    }
  }
}