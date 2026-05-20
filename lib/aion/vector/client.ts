// lib/aion/vector/client.ts
export * from "./server-safe";
export {
  generateEmbedding,
  generateBatchEmbeddings,
  loadEmbeddingModel,
  getModelStatus,
} from "./embed";
export {
  indexRecord,
  indexBrainItem,
  semanticSearch,
  deleteFromSemanticIndex,
} from "./semanticIndex";
export {
  upsertVector,
  getVectorBySourceId,
  deleteVectorBySourceId,
  getAllVectors,
  clearVectorStore,
} from "./store";
export {
  indexRecordInBackground,
  indexBrainItemInBackground,
  deleteVectorInBackground,
} from "./background";
