import type { AionReasonResponse, ReasonOptions } from "@/lib/aionReason";

let _source: "core" | "local" = "local";
let _coreAvailable: boolean | null = null;
let _lastCoreCheck = 0;
const CORE_CHECK_TTL = 30_000;

const CORE_URL = (typeof window !== "undefined"
  ? ""
  : process.env.NEXT_PUBLIC_AION_CORE_URL || "http://localhost:8000"
);

function offlineResponse(input: string, timeMs: number): AionReasonResponse {
  return {
    text: "O Aion Core está offline. Não foi possível processar sua solicitação. Tente novamente quando o Core estiver disponível.",
    voiceReply: "Aion Core offline.",
    intent: "unknown",
    actionsExecuted: [],
    nextSteps: [],
    confidence: 0,
    providerUsed: "none",
    route: "fallback",
    timeMs,
    record: null,
    suggestion: null,
    followUpQuestion: null,
    tips: null,
    debug: { source: "offline-gateway" },
  };
}

function coreToReasonResponse(reply: string, timeMs: number): AionReasonResponse {
  return {
    text: reply,
    voiceReply: reply,
    intent: "question" as const,
    actionsExecuted: [],
    nextSteps: [],
    confidence: 0.7,
    providerUsed: "aion-core",
    route: "llm",
    timeMs,
    record: null,
    suggestion: null,
    followUpQuestion: null,
    tips: null,
    debug: { source: "aion-core" },
  };
}

export async function isCoreAvailable(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastCoreCheck < CORE_CHECK_TTL && _coreAvailable !== null) {
    return _coreAvailable;
  }
  try {
    const res = await fetch(`${CORE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    _coreAvailable = res.ok;
  } catch {
    _coreAvailable = false;
  }
  _lastCoreCheck = Date.now();
  _source = _coreAvailable ? "core" : "local";
  return _coreAvailable;
}

export function getSource(): "core" | "local" {
  return _source;
}

export async function aionChat(
  input: string,
  options?: ReasonOptions,
): Promise<AionReasonResponse> {
  const start = Date.now();

  if (typeof window === "undefined" && await isCoreAvailable()) {
    try {
      const apiKey = process.env.AION_CORE_API_KEY || "";
      const res = await fetch(`${CORE_URL}/v1/core/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": "cortex",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: "cortex",
          user_id: options?.clientContext?.userId || "cortex",
          input,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.ui_reply) {
          _source = "core";
          return coreToReasonResponse(data.ui_reply, Date.now() - start);
        }
      }
    } catch {
      _coreAvailable = false;
      _source = "local";
    }
  }

  return offlineResponse(input, Date.now() - start);
}
