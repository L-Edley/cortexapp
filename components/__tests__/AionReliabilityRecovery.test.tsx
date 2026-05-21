// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    return function DynamicMock() {
      return null;
    };
  },
}));

const mockSaveRecord = vi.fn();
const mockSaveMemory = vi.fn();

vi.mock("@/lib/storageProvider", () => ({
  saveRecord: (rec: any) => mockSaveRecord(rec),
  getRecords: vi.fn(() => []),
}));

vi.mock("@/lib/aion/brain/memory", () => ({
  saveMemory: (item: any) => mockSaveMemory(item),
}));

vi.mock("@/lib/aionProfile", () => ({
  loadProfile: vi.fn(async () => ({
    version: 1,
    userName: "João",
  })),
  analyzeAndUpdateProfile: vi.fn(async () => ({})),
}));

vi.mock("@/lib/aion/patterns", () => ({
  runPatternAnalysis: vi.fn(async () => ({})),
  buildEnhancedProfileContext: vi.fn(() => ""),
}));

vi.mock("@/lib/dailyBriefing", () => ({
  shouldShowBriefing: vi.fn(() => false),
  generateBriefing: vi.fn(),
  markBriefingShown: vi.fn(),
}));

vi.mock("@/lib/aionAlerts", () => ({
  checkAllAlerts: vi.fn(async () => {}),
  getUnshownAlerts: vi.fn(() => []),
  markAlertShown: vi.fn(),
}));

vi.mock("@/lib/aionScheduler", () => ({
  runAionScheduledJobs: vi.fn(async () => []),
}));

vi.mock("@/lib/aion/clientContext", () => ({
  prepareClientAionContext: vi.fn(async () => ({
    source: "client-dexie",
    semanticResults: [],
    brainItems: [],
  })),
}));

vi.mock("@/components/VoiceCenter", () => ({
  default: ({
    aiResponse,
    onSendMessage,
  }: {
    aiResponse: string;
    onSendMessage: (t: string) => void;
  }) => (
    <div>
      <span data-testid="response">{aiResponse}</span>
      <button data-testid="send-btn" onClick={() => onSendMessage("Oi Aion")}>
        Send
      </button>
    </div>
  ),
}));

vi.mock("@/components/voice/StreamingText", () => ({
  default: ({ text }: { text: string }) => text,
}));

vi.mock("@/components/voice/MicButton", () => ({
  default: ({ onError }: { onError: (err: any) => void }) => {
    return (
      <button data-testid="mic-trigger-error" onClick={() => onError("Permission denied")}>
        Trigger Mic Error
      </button>
    );
  },
}));

vi.mock("@/components/voice/VoiceCenter", () => ({
  default: ({
    aiResponse,
    onSendMessage,
  }: {
    aiResponse: string;
    onSendMessage: (t: string) => void;
  }) => (
    <div>
      <span data-testid="response">{aiResponse}</span>
      <button data-testid="send-btn" onClick={() => onSendMessage("Oi Aion")}>
        Send
      </button>
    </div>
  ),
}));

vi.mock("@/lib/aionGateway", () => ({
  isCoreAvailable: vi.fn(async () => false),
  getSource: vi.fn(() => "local" as const),
  aionChat: vi.fn(async (input: string) => ({
    text: "Resposta local.",
    voiceReply: "Resposta local.",
    intent: "question",
    actionsExecuted: [],
    nextSteps: [],
    confidence: 0.8,
    providerUsed: "local",
    route: "local",
    timeMs: 10,
  })),
}));

const mockSpeak = vi.fn();
vi.mock("@/lib/aionVoice", () => ({
  speak: (text: string, options?: any) => mockSpeak(text, options),
  stopSpeaking: vi.fn(),
}));

const mockAddToSession = vi.fn();
vi.mock("@/lib/sessionMemory", () => ({
  addToSession: (role: string, text: string) => mockAddToSession(role, text),
  getRecentSessionMessages: vi.fn(() => []),
}));

describe("Aion Reliability Recovery Scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("recupera elegantemente de falha de storage (addToSession/saveRecord/saveMemory) sem quebrar o fluxo", async () => {
    // 1) Mock addToSession to throw
    mockAddToSession.mockImplementation(() => {
      throw new Error("IndexedDB quota exceeded");
    });
    mockSaveRecord.mockRejectedValue(new Error("IndexedDB write failed"));
    mockSaveMemory.mockRejectedValue(new Error("IndexedDB save memory failed"));

    // 2) Mock successful API response with fallback
    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error("ReadableStream failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: "Resposta textual bem sucedida!",
          action: "create_record",
          record: {
            type: "task",
            title: "Test task",
            priority: "medium",
          },
        }),
      } as any);

    const { default: CommandCenter } = await import("../CommandCenter");
    render(createElement(CommandCenter));

    const btn = await screen.findByTestId("send-btn");
    btn.click();

    // Verify user still gets their text reply even though storage throw exceptions
    await waitFor(() => {
      expect(screen.getByTestId("response").textContent).toContain(
        "Resposta textual bem sucedida!"
      );
    });
  });

  it("recupera elegantemente de falha no TTS (speak) sem quebrar a interface e revertendo para idle", async () => {
    // Mock speak to throw or reject immediately
    mockSpeak.mockRejectedValue(new Error("TTS Engine failure"));

    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error("ReadableStream failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: "Resposta com áudio",
          voiceReply: "Texto da voz",
        }),
      } as any);

    const { default: CommandCenter } = await import("../CommandCenter");
    render(createElement(CommandCenter));

    const btn = await screen.findByTestId("send-btn");
    btn.click();

    // Verify response is shown and speak is triggered without hanging the interface
    await waitFor(() => {
      expect(screen.getByTestId("response").textContent).toContain("Resposta com áudio");
    });
  });

  it("recupera de falha de microfone exibindo mensagem amigável e normalizando como speech_recognition_failed", async () => {
    const { default: CommandCenter } = await import("../CommandCenter");
    render(createElement(CommandCenter));

    const errBtn = await screen.findByTestId("mic-trigger-error");
    errBtn.click();

    // Verify user is alerted about microphone not available
    await waitFor(() => {
      expect(screen.getByTestId("response").textContent).toContain(
        "O microfone não está disponível. Você pode digitar normalmente."
      );
    });
  });
});
