export type SessionRole = "user" | "aion" | "system";

export interface SessionMessage {
  id: string;
  role: SessionRole;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SessionSummary {
  summary: string;
  timestamp: string;
  keyPoints: string[];
}

const SESSION_STORAGE_KEY = "aion_session_messages";
const LAST_SUMMARY_KEY = "aion_last_session_summary";

let inMemoryHistory: SessionMessage[] = [];

function getHistoryInternal(): SessionMessage[] {
  if (inMemoryHistory.length > 0) return inMemoryHistory;
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        inMemoryHistory = JSON.parse(raw);
      }
    } catch {
      // Safe fallback
    }
  }
  return inMemoryHistory;
}

function saveHistoryInternal(history: SessionMessage[]): void {
  inMemoryHistory = history;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Safe fallback
    }
  }
}

export function addToSession(
  role: SessionRole,
  content: string,
  metadata?: Record<string, unknown>
): SessionMessage {
  const msg: SessionMessage = {
    id: "session-msg-" + Math.random().toString(36).substr(2, 9),
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata,
  };

  const history = [...getHistoryInternal()];
  history.push(msg);

  // Keep only the last 20 messages
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  saveHistoryInternal(history);
  return msg;
}

export function getSessionHistory(): SessionMessage[] {
  return getHistoryInternal();
}

export function getRecentSessionMessages(limit = 10): SessionMessage[] {
  const history = getSessionHistory();
  return history.slice(-limit);
}

export function clearSession(): void {
  inMemoryHistory = [];
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Safe fallback
    }
  }
}

export async function summarizeSession(): Promise<SessionSummary> {
  const history = getSessionHistory();
  if (history.length === 0) {
    return {
      summary: "Sessão vazia.",
      timestamp: new Date().toISOString(),
      keyPoints: [],
    };
  }

  const userMessages = history.filter((m) => m.role === "user");
  const aionMessages = history.filter((m) => m.role === "aion");

  const keyPoints: string[] = [];
  userMessages.forEach((m) => {
    if (m.content.trim().length > 0) {
      keyPoints.push(m.content);
    }
  });

  const summary = `Conversa de ${userMessages.length} interações. Usuário enviou ${userMessages.length} mensagens e Aion respondeu ${aionMessages.length} vezes.`;

  return {
    summary,
    timestamp: new Date().toISOString(),
    keyPoints,
  };
}

export function saveSessionSummary(summary: SessionSummary): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify(summary));
  } catch {
    // Safe fallback
  }
}

export function loadLastSessionSummary(): SessionSummary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_SUMMARY_KEY);
    return raw ? (JSON.parse(raw) as SessionSummary) : null;
  } catch {
    return null;
  }
}

export function buildSessionContext(): string {
  const recent = getRecentSessionMessages(10);
  if (recent.length === 0) return "";

  const lines = recent.map((m) => {
    const roleName = m.role === "user" ? "Usuário" : m.role === "aion" ? "Aion" : "Sistema";
    return `[${roleName}] ${m.content}`;
  });

  return [
    "HISTÓRICO RECENTE DA CONVERSA NA SESSÃO:",
    ...lines,
    ""
  ].join("\n");
}
