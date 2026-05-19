export { generateEmbedding, generateBatchEmbeddings, loadEmbeddingModel, getModelStatus } from "./embed";
export { cosineSimilarity, dotProduct, normalizeVector } from "./similarity";
export { upsertVector, getVectorBySourceId, deleteVectorBySourceId, getAllVectors, clearVectorStore } from "./store";
export { buildVectorTextFromRecord, buildVectorTextFromBrainItem } from "./text";
export { indexRecord, indexBrainItem, semanticSearch, deleteFromSemanticIndex } from "./semanticIndex";
export { indexRecordInBackground, indexBrainItemInBackground, deleteVectorInBackground } from "./background";
export type { EmbeddingVector, VectorRecordType, VectorSourceType, VectorEntry, VectorSearchResult } from "./types";
