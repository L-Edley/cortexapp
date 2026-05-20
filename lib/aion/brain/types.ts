export type AionBrainItemType =
  | "user_preference"
  | "project_context"
  | "research"
  | "decision"
  | "pattern"
  | "procedure";

export type AionBrainSource = "user" | "llm" | "web" | "system" | "system_seed";

export type AionBrainItem = {
  id: string;
  type: AionBrainItemType;
  title: string;
  content: string;
  tags: string[];
  source: AionBrainSource;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
};

export type AionBrainScoredItem = AionBrainItem & {
  relevanceScore: number;
};

export type AionSearchCacheItem = {
  id: string;
  query: string;
  response: string;
  tags: string[];
  createdAt: string;
  expiresAt: string;
};

export type ConversationEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};
