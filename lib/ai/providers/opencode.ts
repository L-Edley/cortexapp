import type { AIProvider } from "@/lib/ai/types";

const API_URL = "https://opencode.ai/zen/v1/chat/completions";

function extractContent(data: Record<string, unknown>): string | null {
  if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
    const choice = data.choices[0] as Record<string, unknown>;
    if (choice.message) {
      const msg = choice.message as Record<string, unknown>;
      const c = msg.content;
      if (typeof c === "string" && c.trim().length > 0) return c;
      if (Array.isArray(c)) {
        const joined = c.filter((x) => typeof x === "string").join("");
        if (joined.length > 0) return joined;
      }
      if (c !== null && c !== undefined && typeof c === "object") {
        const str = JSON.stringify(c);
        if (str.length > 0) return str;
      }
    }
  }

  if (typeof data.output_text === "string" && data.output_text.trim().length > 0) {
    return data.output_text;
  }

  if (typeof data.content === "string" && data.content.trim().length > 0) {
    return data.content;
  }

  return null;
}

export class OpenCodeProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey?: string, _endpoint?: string) {
    this.apiKey =
      apiKey ||
      process.env.OPENCODE_API_KEY ||
      process.env.AI_API_KEY ||
      "";
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string
  ): Promise<string | null> {
    if (!this.apiKey) {
      console.warn("[AION] OPENCODE_API_KEY ausente");
      return null;
    }

    const modelName = process.env.AI_MODEL || "deepseek-v4-flash-free";

    console.log("[AION] calling OpenCode model:", modelName);
    console.log("[AION] OpenCode endpoint:", API_URL);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        const errorBody = await res
          .text()
          .catch(() => "não foi possível ler o corpo do erro");
        const status = res.status;
        const statusText = res.statusText;

        if (status === 401 || status === 403) {
          console.error(
            `[AION] OpenCode erro de autenticação (${status} ${statusText}): chave inválida`
          );
          return status === 401 ? "opencode_http_401" : "opencode_http_403";
        }

        if (status === 400) {
          console.error(
            `[AION] OpenCode requisição inválida (${status} ${statusText}): modelo "${modelName}" pode ser inválido`
          );
          console.error(`[AION] body do erro: ${errorBody}`);
          return "opencode_http_400";
        }

        if (status === 429) {
          console.error(
            `[AION] OpenCode rate limit atingido (${status} ${statusText})`
          );
          return "opencode_rate_limit";
        }

        if (status >= 500) {
          console.error(
            `[AION] OpenCode erro de servidor (${status} ${statusText})`
          );
          console.error(`[AION] body do erro: ${errorBody}`);
          return "opencode_server_error";
        }

        console.error(
          `[AION] OpenCode erro inesperado (${status} ${statusText})`
        );
        console.error(`[AION] body do erro: ${errorBody}`);
        return null;
      }

      const data = (await res.json()) as Record<string, unknown>;
      console.log("[AION:OPENCODE:RAW]", JSON.stringify(data, null, 2));

      if (data.error) {
        console.error(
          "[AION] OpenCode erro no body:",
          JSON.stringify(data.error)
        );
        return "opencode_server_error";
      }

      const content = extractContent(data);

      if (content === null) {
        console.warn(
          "[AION] OpenCode: resposta 200 sem conteúdo textual. keys:",
          Object.keys(data).join(", ")
        );
        console.warn(
          "[AION] OpenCode resposta completa:",
          JSON.stringify(data).slice(0, 2000)
        );
        return null;
      }

      console.log("[AION] OpenCode resposta recebida OK");
      return content;
    } catch (err) {
      console.error("[AION] OpenCode erro de rede:", err);
      return null;
    }
  }
}
