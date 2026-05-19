import type { CortexApiResponse, CortexRecord } from "@/lib/types";
import type { AionBrainItem } from "./brain/types";
import type { AionContextDebug } from "@/lib/aionContext";

export type AionAction =
  | "none"
  | "web_search"
  | "create_record"
  | "ask_clarification"
  | "suggest_next_step"
  | "read_dashboard"
  | "save_memory";

export type AionVoiceMode = "off" | "confirmations" | "assistant";

export type RouteType = "local" | "brain" | "api" | "fallback";

export type AionFallbackReason =
  | "missing_api_key"
  | "http_error"
  | "rate_limit"
  | "invalid_json_after_repair"
  | "invalid_schema_after_normalize"
  | "empty_response"
  | "all_providers_failed"
  | "opencode_http_400"
  | "opencode_http_401"
  | "opencode_http_403"
  | "opencode_rate_limit"
  | "opencode_server_error"
  | "openrouter_http_400"
  | "openrouter_http_401"
  | "openrouter_http_403"
  | "openrouter_rate_limit"
  | "openrouter_server_error"
  | "groq_http_401"
  | "groq_rate_limit"
  | "groq_server_error"
  | "nvidia_http_401"
  | "nvidia_rate_limit"
  | "nvidia_server_error"
  | "unknown";

export type LearningCandidate = {
  shouldLearn: boolean;
  message: string;
  response: string;
  action?: string;
  confidence: number;
  providerUsed?: string;
};

export type AionSource = {
  title: string;
  url: string;
};

export type AionRequest = {
  message: string;
  currentView?: string;
  recentRecords?: CortexRecord[];
  voiceMode?: AionVoiceMode;
  brainContextFromClient?: Partial<AionBrainItem>[];
  profileContext?: string;
};

export type AionResponse = {
  reply: string;
  voiceReply: string;
  action: AionAction;
  record: CortexApiResponse | null;
  sources?: AionSource[];
  suggestion?: string;
  followUpQuestion?: string;
  tips?: string[];
  confidence: number;
  fallbackUsed: boolean;
  learningCandidate?: LearningCandidate;
  debug?: {
    route: RouteType;
    provider: string;
    providerUsed: string;
    model: string;
    fallbackUsed: boolean;
    fallbackReason?: AionFallbackReason;
    ollamaAvailable?: boolean;
    contextDebug?: AionContextDebug;
    brainItemsUsed?: AionBrainItem[];
    brainItemsCount?: number;
    learnedNewItem?: boolean;
  };
};

export type AionDecision = {
  reply: string;
  voiceReply: string;
  action: AionAction;
  searchQuery?: string | null;
  record?: CortexApiResponse | null;
  suggestion?: string | null;
  followUpQuestion?: string | null;
  tips?: string[] | null;
  confidence: number;
};
