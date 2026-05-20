// lib/aion/vector/server-safe.ts
export { cosineSimilarity, dotProduct, normalizeVector } from "./similarity";
export { buildVectorTextFromRecord, buildVectorTextFromBrainItem } from "./text";
export type {
  EmbeddingVector,
  VectorRecordType,
  VectorSourceType,
  VectorEntry,
  VectorSearchResult,
} from "./types";
