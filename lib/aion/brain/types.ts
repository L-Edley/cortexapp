export type AionBrainItemType =
  | "user_preference"
  | "project_context"
  | "research"
  | "decision"
  | "pattern"
  | "procedure";

export type AionBrainSource = "user" | "llm" | "web" | "system";

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

export type BrainDebugInfo = {
  route: "local" | "brain" | "api" | "fallback";
  providerUsed: string;
  brainItemsUsed: number;
  learnedNewItem: boolean;
};

export type BrainMemoryEntry = {
  id: string;
  pattern: string;
  context: string;
  frequency: number;
  lastSeen: string;
  createdAt: string;
};

export type SearchCacheEntry = {
  id: string;
  query: string;
  results: { title: string; url: string; snippet?: string }[];
  cachedAt: string;
};

export type ConversationEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};
