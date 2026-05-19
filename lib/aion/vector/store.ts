import type { VectorEntry } from "./types";
import { getBrainDB } from "../brain/brainStore";

export async function upsertVector(entry: VectorEntry): Promise<void> {
  const db = await getBrainDB();
  if (!db) return;
  try {
    await db.table("vectors").put(entry);
  } catch (err) {
    console.warn("[VECTOR STORE] Falha ao salvar vetor:", err);
  }
}

export async function getVectorBySourceId(
  sourceId: string
): Promise<VectorEntry | null> {
  const db = await getBrainDB();
  if (!db) return null;
  try {
    const entry = (await db
      .table("vectors")
      .where("sourceId")
      .equals(sourceId)
      .first()) as VectorEntry | undefined;
    return entry ?? null;
  } catch (err) {
    console.warn("[VECTOR STORE] Falha ao buscar vetor:", err);
    return null;
  }
}

export async function deleteVectorBySourceId(
  sourceId: string
): Promise<void> {
  const db = await getBrainDB();
  if (!db) return;
  try {
    const entry = (await db
      .table("vectors")
      .where("sourceId")
      .equals(sourceId)
      .first()) as VectorEntry | undefined;
    if (entry) {
      await db.table("vectors").delete(entry.id);
    }
  } catch (err) {
    console.warn("[VECTOR STORE] Falha ao remover vetor:", err);
  }
}

export async function getAllVectors(): Promise<VectorEntry[]> {
  const db = await getBrainDB();
  if (!db) return [];
  try {
    return (await db.table("vectors").toArray()) as VectorEntry[];
  } catch (err) {
    console.warn("[VECTOR STORE] Falha ao listar vetores:", err);
    return [];
  }
}

export async function clearVectorStore(): Promise<void> {
  const db = await getBrainDB();
  if (!db) return;
  try {
    await db.table("vectors").clear();
  } catch (err) {
    console.warn("[VECTOR STORE] Falha ao limpar vetores:", err);
  }
}
