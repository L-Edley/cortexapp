import type { AionBrainItem } from "./types";
import { retrieveRelevantBrainContext } from "./retrieval";
import { getBrainDB, isBrainAvailable, generateId } from "./brainStore";

export async function answerFromBrain(
  message: string,
  context?: AionBrainItem[]
): Promise<string | null> {
  const items = context ?? (await retrieveRelevantBrainContext(message));

  if (items.length === 0) return null;

  const activeItems = items.filter((i) => {
    if (!i.expiresAt) return true;
    return new Date(i.expiresAt).getTime() > Date.now();
  });

  if (activeItems.length === 0) return null;

  const avgConfidence =
    activeItems.reduce((s, i) => s + i.confidence, 0) / activeItems.length;

  if (avgConfidence < 0.65) return null;

  const best = activeItems[0];

  switch (best.type) {
    case "procedure":
      return `Aqui está o procedimento que aprendi:\n\n${best.content}`;
    case "decision":
      return `Com base na decisão anterior: ${best.content}`;
    case "project_context":
      return best.content;
    case "user_preference":
      return best.content;
    case "research":
      return `${best.content}\n\n(Esta informação pode estar desatualizada — salvei ela antes.)`;
    case "pattern":
      return best.content;
    default:
      return best.content;
  }
}

export async function saveKnowledge(
  item: AionBrainItem
): Promise<AionBrainItem | null> {
  if (!isBrainAvailable()) return null;
  const db = await getBrainDB();
  if (!db) return null;

  const now = new Date().toISOString();
  const entry: AionBrainItem = {
    ...item,
    id: item.id || generateId(),
    createdAt: item.createdAt || now,
    updatedAt: now,
  };

  try {
    await db.table("knowledge").put(entry);
    return entry;
  } catch {
    return null;
  }
}

export async function getKnowledge(): Promise<AionBrainItem[]> {
  if (!isBrainAvailable()) return [];
  const db = await getBrainDB();
  if (!db) return [];

  try {
    return (await db.table("knowledge").toArray()) as AionBrainItem[];
  } catch {
    return [];
  }
}

export async function deleteKnowledge(id: string): Promise<boolean> {
  if (!isBrainAvailable()) return false;
  const db = await getBrainDB();
  if (!db) return false;

  try {
    await db.table("knowledge").delete(id);
    return true;
  } catch {
    return false;
  }
}

export async function updateKnowledge(
  id: string,
  patch: Partial<AionBrainItem>
): Promise<AionBrainItem | null> {
  if (!isBrainAvailable()) return null;
  const db = await getBrainDB();
  if (!db) return null;

  try {
    const existing = (await db.table("knowledge").get(id)) as
      | AionBrainItem
      | undefined;
    if (!existing) return null;

    const updated: AionBrainItem = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };

    await db.table("knowledge").put(updated);
    return updated;
  } catch {
    return null;
  }
}
