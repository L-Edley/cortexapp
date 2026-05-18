import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider } from "@/lib/ai/types";

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey =
      process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
    const baseUrl = process.env.AI_BASE_URL || "";
    this.genAI = baseUrl
      ? new GoogleGenerativeAI(apiKey, { baseUrl })
      : new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string
  ): Promise<string | null> {
    const modelName = process.env.AI_MODEL || "gemini-2.5-flash";

    console.log("[AION] calling Gemini model:", modelName);

    try {
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (!text) {
        console.warn("[AION] Gemini: resposta vazia");
        return null;
      }

      console.log("[AION] Gemini resposta recebida OK");
      return text;
    } catch (err) {
      console.error("[AION] Gemini API error:", err);
      return null;
    }
  }
}
