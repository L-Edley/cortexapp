import type { LearningNeed } from "./aionKnowledgeGap";

export interface LearningEngineResult {
  reply: string;
  providerUsed: string;
  source: "cache" | "provider";
  learningSaved: boolean;
  learningType: LearningNeed;
  input: string;
  debug?: Record<string, unknown>;
}

export function classifyProviderLearning(_input: string): LearningNeed {
  return "already_known";
}

export async function askProviderForLearning(_input: string, _contextPrompt: string): Promise<null> {
  return null;
}

export async function runLearningEngine(
  _input: string,
  _context?: string,
  _options?: any
): Promise<LearningEngineResult | null> {
  console.log("[LEARNING] Motor de aprendizado migrado para AION Core");
  return null;
}
