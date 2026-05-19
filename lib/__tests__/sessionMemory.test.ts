import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// LocalStorage & SessionStorage mock
const sessionStorageStore: Record<string, string> = {};
const localStorageStore: Record<string, string> = {};

const sessionStorageMock = {
  getItem: vi.fn((key: string) => sessionStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageStore[key] = value.toString();
  }),
  removeItem: vi.fn((key: string) => {
    delete sessionStorageStore[key];
  }),
  clear: vi.fn(() => {
    for (const k in sessionStorageStore) {
      delete sessionStorageStore[k];
    }
  }),
};

const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value.toString();
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    for (const k in localStorageStore) {
      delete localStorageStore[k];
    }
  }),
};

describe("Aion Session Memory", () => {
  beforeEach(async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", sessionStorageMock);
    vi.stubGlobal("localStorage", localStorageMock);
    sessionStorageMock.clear();
    localStorageMock.clear();
    
    // Clear internal state of the imported module by importing it fresh or resetting it
    const { clearSession } = await import("../sessionMemory");
    clearSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("addToSession salva mensagem", async () => {
    const { addToSession, getSessionHistory } = await import("../sessionMemory");
    const msg = addToSession("user", "Olá Aion");
    
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Olá Aion");
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeTruthy();

    const history = getSessionHistory();
    expect(history.length).toBe(1);
    expect(history[0].content).toBe("Olá Aion");
  });

  it("getSessionHistory retorna histórico", async () => {
    const { addToSession, getSessionHistory } = await import("../sessionMemory");
    addToSession("user", "Mensagem 1");
    addToSession("aion", "Resposta 1");

    const history = getSessionHistory();
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe("Mensagem 1");
    expect(history[1].content).toBe("Resposta 1");
  });

  it("limita histórico para evitar crescimento infinito", async () => {
    const { addToSession, getSessionHistory } = await import("../sessionMemory");
    // Add 25 messages
    for (let i = 0; i < 25; i++) {
      addToSession("user", `Mensagem ${i}`);
    }

    const history = getSessionHistory();
    expect(history.length).toBe(20); // strictly capped at 20
    expect(history[0].content).toBe("Mensagem 5");
    expect(history[19].content).toBe("Mensagem 24");
  });

  it("clearSession limpa apenas sessão", async () => {
    const { addToSession, getSessionHistory, clearSession, saveSessionSummary, loadLastSessionSummary } = await import("../sessionMemory");
    addToSession("user", "Oi");
    
    const summary = {
      summary: "Conversa rápida.",
      timestamp: new Date().toISOString(),
      keyPoints: ["Oi"],
    };
    saveSessionSummary(summary);

    clearSession();

    expect(getSessionHistory()).toHaveLength(0);
    // Permenant summary should NOT be cleared by clearSession
    expect(loadLastSessionSummary()).toEqual(summary);
  });

  it("buildSessionContext inclui mensagens recentes", async () => {
    const { addToSession, buildSessionContext } = await import("../sessionMemory");
    const names = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
    // Add 12 messages
    for (let i = 0; i < 12; i++) {
      addToSession(i % 2 === 0 ? "user" : "aion", `Msg ${names[i]}`);
    }

    const context = buildSessionContext();
    expect(context).toContain("HISTÓRICO RECENTE DA CONVERSA NA SESSÃO");
    // Should include the last 10 messages: Msg two to Msg eleven
    expect(context).not.toContain("Msg zero");
    expect(context).not.toContain("Msg one");
    expect(context).toContain("Msg two");
    expect(context).toContain("Msg eleven");
  });

  it("SSR-safe", async () => {
    vi.unstubAllGlobals(); // removes window, sessionStorage, localStorage
    const { addToSession, getSessionHistory } = await import("../sessionMemory");
    
    // Should not crash even without window
    expect(() => {
      addToSession("user", "Olá sem window");
      const history = getSessionHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
    }).not.toThrow();
  });
});
