import type { AionBrainItem } from "./types";
import { getBrainDB, isBrainAvailable, generateId } from "./brainStore";

export async function saveMemory(
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
    await db.table("memories").put(entry);
    return entry;
  } catch {
    return null;
  }
}

export async function getMemories(): Promise<AionBrainItem[]> {
  if (!isBrainAvailable()) return [];
  const db = await getBrainDB();
  if (!db) return [];

  try {
    return (await db.table("memories").toArray()) as AionBrainItem[];
  } catch {
    return [];
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  if (!isBrainAvailable()) return false;
  const db = await getBrainDB();
  if (!db) return false;

  try {
    await db.table("memories").delete(id);
    return true;
  } catch {
    return false;
  }
}

export async function updateMemory(
  id: string,
  patch: Partial<AionBrainItem>
): Promise<AionBrainItem | null> {
  if (!isBrainAvailable()) return null;
  const db = await getBrainDB();
  if (!db) return null;

  try {
    const existing = (await db.table("memories").get(id)) as
      | AionBrainItem
      | undefined;
    if (!existing) return null;

    const updated: AionBrainItem = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };

    await db.table("memories").put(updated);
    return updated;
  } catch {
    return null;
  }
}
