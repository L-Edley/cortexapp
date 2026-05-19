export type EmbeddingVector = number[];

export type VectorRecordType =
  | "task"
  | "finance"
  | "habit"
  | "idea"
  | "daily"
  | "project"
  | "note"
  | "knowledge"
  | "profile";

export type VectorSourceType =
  | "record"
  | "brain_item"
  | "obsidian_note"
  | "profile";

export type VectorEntry = {
  id: string;
  type: VectorRecordType;
  embedding: EmbeddingVector;
  text: string;
  tags: string[];
  sourceType: VectorSourceType;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
};

export type VectorSearchResult = VectorEntry & {
  score: number;
};
