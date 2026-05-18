import type { AionBrainItem } from "./types";
import { retrieveRelevantBrainContext } from "./retrieval";

export type BrainAnswer = {
  answer: string | null;
  confidence: number;
  items: AionBrainItem[];
};

export async function answerFromBrain(
  message: string,
  context?: AionBrainItem[]
): Promise<BrainAnswer> {
  const items = context ?? (await retrieveRelevantBrainContext(message));

  if (items.length === 0) {
    return { answer: null, confidence: 0, items: [] };
  }

  const totalConfidence = items.reduce((s, i) => s + i.confidence, 0);
  const avgConfidence = totalConfidence / items.length;

  if (avgConfidence >= 0.7 && items.length >= 1) {
    const bestItem = items[0];
    return {
      answer: bestItem.content,
      confidence: avgConfidence,
      items,
    };
  }

  return { answer: null, confidence: avgConfidence, items };
}

export async function hasBrainKnowledge(message: string): Promise<boolean> {
  const { answer, confidence } = await answerFromBrain(message);
  return answer !== null && confidence >= 0.7;
}
