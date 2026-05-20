import type { VectorEntry, VectorRecordType, VectorSearchResult } from "./types";
import type { CortexRecord } from "@/lib/types";
import type { SyncRecord } from "@/lib/aion/sync/types";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import { cosineSimilarity } from "./similarity";
import { buildVectorTextFromRecord, buildVectorTextFromBrainItem } from "./text";
import { upsertVector, getAllVectors, deleteVectorBySourceId } from "./store";
import { generateId } from "../brain/brainStore";

function mapCortexTypeToVectorType(type: string): VectorRecordType {
  switch (type) {
    case "expense":
      return "finance";
    case "project_note":
      return "project";
    case "daily_review":
      return "daily";
    case "focus_request":
      return "note";
    default:
      return type as VectorRecordType;
  }
}

let _embedModule: any;
async function getEmbed() {
  if (!_embedModule) {
    _embedModule = await import("./embed");
  }
  return _embedModule;
}

export async function indexRecord(
  record: CortexRecord | SyncRecord
): Promise<void> {
  const text = buildVectorTextFromRecord(record);
  const { generateEmbedding } = await getEmbed();
  const embedding = await generateEmbedding(text);

  if (embedding.length === 0) return;

  const type =
    "type" in record
      ? mapCortexTypeToVectorType(record.type as string)
      : ("note" as VectorRecordType);

  const entry: VectorEntry = {
    id: generateId(),
    type,
    embedding,
    text,
    tags: [],
    sourceType: "record",
    sourceId: record.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await upsertVector(entry);
}

export async function indexBrainItem(item: AionBrainItem): Promise<void> {
  const text = buildVectorTextFromBrainItem(item);
  const { generateEmbedding } = await getEmbed();
  const embedding = await generateEmbedding(text);

  if (embedding.length === 0) return;

  const entry: VectorEntry = {
    id: generateId(),
    type: "note",
    embedding,
    text,
    tags: item.tags,
    sourceType: "brain_item",
    sourceId: item.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await upsertVector(entry);
}

export async function semanticSearch(
  query: string,
  options?: {
    type?: VectorRecordType;
    topK?: number;
    threshold?: number;
  }
): Promise<VectorSearchResult[]> {
  const { generateEmbedding } = await getEmbed();
  const queryEmbedding = await generateEmbedding(query);

  if (queryEmbedding.length === 0) return [];

  const allVectors = await getAllVectors();
  if (allVectors.length === 0) return [];

  const filtered = options?.type
    ? allVectors.filter((v) => v.type === options.type)
    : allVectors;

  const threshold = options?.threshold ?? 0.35;
  const topK = options?.topK ?? 5;

  const scored = filtered
    .map((v) => {
      const score = cosineSimilarity(queryEmbedding, v.embedding);
      return { ...v, score };
    })
    .filter((v) => v.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

export async function deleteFromSemanticIndex(
  sourceId: string
): Promise<void> {
  await deleteVectorBySourceId(sourceId);
}
