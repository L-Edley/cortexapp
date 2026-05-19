// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { normalizeAionError, shouldRetry } from "@/lib/aionError";

vi.mock("next/dynamic", () => ({
  default: () => {
    return function DynamicMock() {
      return null;
    };
  },
}));

vi.mock("@/lib/storageProvider", () => ({
  saveRecord: vi.fn(),
  getRecords: vi.fn(() => []),
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

vi.mock("@/components/VoiceCenter", () => ({
  default: () => null,
}));

vi.mock("@/components/voice/StreamingText", () => ({
  default: ({ text }: { text: string }) => text,
}));

vi.mock("@/components/voice/MicButton", () => ({
  default: () => null,
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

vi.mock("@/lib/aionVoice", () => ({
  speak: vi.fn().mockRejectedValue(new Error("TTS device failed")),
  stopSpeaking: vi.fn(),
}));

describe("Aion Error Classification & Reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("classifica e normaliza erros corretamente", () => {
    const errStream = normalizeAionError(new Error("ReadableStream chunk read failed"));
    expect(errStream.type).toBe("stream_failed");
    expect(errStream.message).toContain("problema na transmissão");

    const errTimeout = normalizeAionError("Groq service timeout error");
    expect(errTimeout.type).toBe("provider_timeout");

    const errTts = normalizeAionError(new Error("ElevenLabs synthesis credit limit reached"));
    expect(errTts.type).toBe("tts_failed");

    const errUnknown = normalizeAionError({});
    expect(errUnknown.type).toBe("unknown");
  });

  it("shouldRetry determina retentativas corretamente", () => {
    expect(shouldRetry("stream_failed")).toBe(true);
    expect(shouldRetry("provider_timeout")).toBe(true);
    expect(shouldRetry("tts_failed")).toBe(false);
  });

  it("cai de /api/aion/stream para /api/aion síncrona", async () => {
    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error("ReadableStream failed")) // Stream route fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: "Texto do fallback síncrono!",
          voiceReply: "Fallback síncrono.",
        }),
      } as any);

    const { default: CommandCenter } = await import("../CommandCenter");
    render(createElement(CommandCenter));

    const btn = await screen.findByTestId("send-btn");
    btn.click();

    await waitFor(() => {
      expect(screen.getByTestId("response").textContent).toContain(
        "Texto do fallback síncrono!"
      );
    });
  });

  it("mostra erro amigável se tanto stream quanto /api/aion falharem", async () => {
    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error("ReadableStream failed"))
      .mockRejectedValueOnce(new Error("Groq API 502 Bad Gateway"));

    const { default: CommandCenter } = await import("../CommandCenter");
    render(createElement(CommandCenter));

    const btn = await screen.findByTestId("send-btn");
    btn.click();

    await waitFor(() => {
      expect(screen.getByTestId("response").textContent).toContain(
        "instabilidade ao conectar com meu cérebro principal"
      );
    });
  });
});
