import { callWithFallback } from "@/lib/aionLLM";
import { saveKnowledge } from "@/lib/aion/brain/knowledge";
import { saveMemory } from "@/lib/aion/brain/memory";
import { saveCachedSearch, getCachedSearch } from "@/lib/aion/brain/searchCache";
import { classifyLearningNeed, type LearningNeed } from "./aionKnowledgeGap";
import { generateId } from "@/lib/aion/brain/brainStore";

const SENSITIVE_REGEX = /(senha|password|token|api_key|cpf|cart[aã]o|cvv|conta banc[aá]ria|secreto|confidencial|íntimo|intimo|sexual)/i;

export interface LearningEngineResult {
  reply: string;
  providerUsed: string;
  source: "cache" | "provider";
  learningSaved: boolean;
  learningType: LearningNeed;
}

/**
 * Filtro de segurança rigoroso para não salvar dados sensíveis.
 */
export function shouldSaveLearning(input: string, result: string): boolean {
  if (!result || result.length < 10) return false;
  const combined = `${input} ${result}`;
  if (SENSITIVE_REGEX.test(combined)) return false;
  return true;
}

export function classifyProviderLearning(input: string): LearningNeed {
  return classifyLearningNeed(input);
}

export async function askProviderForLearning(input: string, contextPrompt: string) {
  // Chamada ao provider via fallback existente (evitando acesso direto a chaves)
  // O sistema já lida com Groq -> OpenCode -> OpenRouter -> etc.
  return await callWithFallback(input, contextPrompt);
}

export async function learnFromProviderResponse(
  input: string,
  reply: string,
  needType: LearningNeed
): Promise<boolean> {
  if (!shouldSaveLearning(input, reply)) {
    return false;
  }

  const now = new Date();
  
  if (needType === "fresh_info") {
    // TTL curto de 4 horas
    const expires = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    return await saveCachedSearch(input, reply, ["fresh_info", "learning_engine"], expires);
  }

  if (needType === "trend") {
    // TTL de 15 dias para trends
    const expires = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await saveKnowledge({
      id: generateId(),
      type: "research",
      title: input.slice(0, 80),
      content: reply,
      tags: ["trend", "learning_engine"],
      source: "llm",
      confidence: 0.8,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expires,
    });
    return true;
  }

  if (needType === "strategic_analysis" || needType === "stable_knowledge") {
    await saveKnowledge({
      id: generateId(),
      type: needType === "strategic_analysis" ? "decision" : "research",
      title: input.slice(0, 80),
      content: reply,
      tags: needType === "strategic_analysis" ? ["strategy", "analysis", "learning_engine"] : ["learning_engine"],
      source: "llm",
      confidence: 0.85,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    return true;
  }

  if (needType === "project_decision") {
    await saveMemory({
      id: generateId(),
      type: "project_context",
      title: input.slice(0, 80),
      content: reply,
      tags: ["decision", "learning_engine"],
      source: "user", // Derivou de uma instrução explícita
      confidence: 0.95,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    return true;
  }

  return false;
}

export async function runLearningEngine(
  input: string,
  context?: string,
  options?: any
): Promise<LearningEngineResult | null> {
  const needType = classifyProviderLearning(input);
  
  // 1. Consultar cache primeiro para fresh_info e trends que podem estar quentes
  if (needType === "fresh_info" || needType === "trend" || needType === "stable_knowledge") {
    const cached = await getCachedSearch(input);
    if (cached) {
      return {
        reply: cached,
        providerUsed: "searchCache",
        source: "cache",
        learningSaved: false,
        learningType: needType,
      };
    }
  }

  // 2. Chamar provider se não houver cache
  const systemPrompt = `Você é o motor de pesquisa profunda do Cortex. Forneça respostas diretas, ricas e precisas. ${context || ""}`;
  const result = await askProviderForLearning(input, systemPrompt);

  if (!result || !result.text) {
    return null;
  }

  // 3. Salvar aprendizado (se for seguro e útil)
  const saved = await learnFromProviderResponse(input, result.text, needType);

  return {
    reply: result.text,
    providerUsed: result.providerUsed || "groq", // default fallback name
    source: "provider",
    learningSaved: saved,
    learningType: needType,
  };
}
