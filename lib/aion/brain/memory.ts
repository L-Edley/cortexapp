import type { BrainMemoryEntry } from "./types";
import { getBrainStore, generateId } from "./brainStore";

const TRIGGER_PATTERNS = [
  "preciso", "quero", "vou", "gostaria",
  "como", "onde", "quando", "por que",
  "criar", "registrar", "anotar",
];

function detectPattern(message: string): string | null {
  const lower = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return TRIGGER_PATTERNS.find((p) => lower.includes(p)) ?? null;
}

export class BrainMemoryTracker {
  async trackInteraction(message: string, _response: string): Promise<void> {
    const store = getBrainStore();
    const pattern = detectPattern(message);

    if (!pattern) return;

    const context = message.split(" ").slice(0, 5).join(" ");

    const existing = await store.memories.filter(
      (m) => m.pattern === pattern && m.context === context
    );

    if (existing.length > 0) {
      const entry = existing[0];
      entry.frequency += 1;
      entry.lastSeen = new Date().toISOString();
      await store.memories.put(entry);
    } else {
      const entry: BrainMemoryEntry = {
        id: generateId(),
        pattern,
        context,
        frequency: 1,
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await store.memories.add(entry);
    }
  }

  async getFrequentPatterns(threshold = 3): Promise<BrainMemoryEntry[]> {
    const store = getBrainStore();
    const all = await store.memories.toArray();
    return all
      .filter((m) => m.frequency >= threshold)
      .sort((a, b) => b.frequency - a.frequency);
  }
}

let _tracker: BrainMemoryTracker | null = null;

export function getBrainMemoryTracker(): BrainMemoryTracker {
  if (!_tracker) {
    _tracker = new BrainMemoryTracker();
  }
  return _tracker;
}
