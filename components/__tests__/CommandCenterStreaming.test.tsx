/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<any>) => {
    const React = require("react");
    return function DynamicMock(props: any) {
      const [Component, setComponent] = React.useState<any>(null);
      React.useEffect(() => {
        loader().then((mod) => {
          setComponent(() => mod.default);
        });
      }, []);
      if (!Component) return null;
      return React.createElement(Component, props);
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
  speak: vi.fn(async () => {}),
  stopSpeaking: vi.fn(),
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

describe("CommandCenter streaming and fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("busca de /api/aion/stream com sucesso e atualiza a resposta", async () => {
    const mockStreamReader = {
      read: vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({
          value: new TextEncoder().encode(
            'event: status\ndata: {"status":"classifying"}\n\n'
          ),
          done: false,
        }), 10)))
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({
          value: new TextEncoder().encode(
            'event: status\ndata: {"status":"thinking"}\n\n'
          ),
          done: false,
        }), 20)))
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({
          value: new TextEncoder().encode(
            'event: token\ndata: {"token":"Olá"}\n\n'
          ),
          done: false,
        }), 30)))
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({
          value: new TextEncoder().encode(
            'event: final\ndata: {"reply":"Olá da simulação!", "voiceReply":"Olá"}\n\n'
          ),
          done: false,
        }), 40)))
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), 50))),
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => mockStreamReader,
      },
    } as any);

    const { default: CommandCenter } = await import("../CommandCenter");
    render(createElement(CommandCenter));

    const btn = await screen.findByTestId("send-btn");
    btn.click();

    await waitFor(() => {
      expect(screen.getByTestId("response").textContent).toContain("Pensando...");
    });

    await waitFor(() => {
      expect(screen.getByTestId("response").textContent).toContain(
        "Olá da simulação!"
      );
    });
  });

  it("recua para /api/aion se o endpoint de streaming falhar", async () => {
    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error("Stream failed")) // Stream POST fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply: "Fallback bem sucedido!",
          voiceReply: "Fallback.",
        }),
      } as any);

    const { default: CommandCenter } = await import("../CommandCenter");
    render(createElement(CommandCenter));

    const btn = await screen.findByTestId("send-btn");
    btn.click();

    await waitFor(() => {
      expect(screen.getByTestId("response").textContent).toContain(
        "Fallback bem sucedido!"
      );
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/aion/stream",
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/aion",
      expect.any(Object)
    );
  });
});
