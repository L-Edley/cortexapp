import { saveKnowledge } from "@/lib/aion/brain/knowledge";
import { saveMemory } from "@/lib/aion/brain/memory";
import { saveCachedSearch, getCachedSearch } from "@/lib/aion/brain/searchCache";
import { type LearningNeed } from "./aionKnowledgeGap";
import { generateId } from "@/lib/aion/brain/brainStore";

const SENSITIVE_REGEX = /(senha|password|token|api_key|cpf|cart[aã]o|cvv|conta banc[aá]ria|secreto|confidencial|íntimo|intimo|sexual)/i;

export function shouldSaveLearning(input: string, result: string): boolean {
  if (!result || result.length < 10) return false;
  const combined = `${input} ${result}`;
  if (SENSITIVE_REGEX.test(combined)) return false;
  return true;
}

export async function checkLearningCache(input: string, needType: LearningNeed): Promise<string | null> {
  if (needType === "fresh_info" || needType === "trend" || needType === "stable_knowledge") {
    const cached = await getCachedSearch(input);
    return cached || null;
  }
  return null;
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
    const expires = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    return await saveCachedSearch(input, reply, ["fresh_info", "learning_engine"], expires);
  }

  if (needType === "trend") {
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
      source: "user",
      confidence: 0.95,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    return true;
  }

  return false;
}
