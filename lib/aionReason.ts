import type { CortexRecord } from "@/lib/types";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import type { AionAction, AionClientContext } from "@/lib/aion/types";
import type { SessionMessage } from "@/lib/sessionMemory";
import type { CortexApiResponse } from "@/lib/types";

export type AionReasonIntent =
  | "record"
  | "memory"
  | "question"
  | "command"
  | "analysis"
  | "planning"
  | "review"
  | "smalltalk"
  | "unknown";

export type AionReasonRoute = "local" | "brain" | "llm" | "fallback";

export type AionReasonResponse = {
  text: string;
  voiceReply: string;
  intent: AionReasonIntent;
  actionsExecuted: string[];
  nextSteps: string[];
  confidence: number;
  providerUsed: string;
  route: AionReasonRoute;
  timeMs: number;
  record?: CortexApiResponse | null;
  suggestion?: string | null;
  followUpQuestion?: string | null;
  tips?: string[] | null;
  searchQuery?: string;
  llmText?: string;
  llmRoute?: string;
  learningData?: {
    input: string;
    reply: string;
    type: any;
  };
  debug?: Record<string, unknown>;
};

export type ReasonOptions = {
  recentRecords?: CortexRecord[];
  brainContextFromClient?: Partial<AionBrainItem>[];
  profileContext?: string;
  currentView?: string;
  sessionMessages?: SessionMessage[];
  clientContext?: AionClientContext;
};

export function classifyIntent(_input: string): AionReasonIntent {
  return "unknown";
}

export async function reason(
  _input: string,
  _options?: ReasonOptions
): Promise<AionReasonResponse> {
  console.warn("[AION REASON] Core offline — reasoning unavailable locally");
  return {
    text: "O Aion Core está offline. Não foi possível processar sua solicitação. Tente novamente quando o Core estiver disponível.",
    voiceReply: "Aion Core offline.",
    intent: "unknown",
    actionsExecuted: [],
    nextSteps: [],
    confidence: 0,
    providerUsed: "none",
    route: "fallback",
    timeMs: 0,
    record: null,
    suggestion: null,
    followUpQuestion: null,
    tips: null,
    debug: { source: "offline-reason" },
  };
}
