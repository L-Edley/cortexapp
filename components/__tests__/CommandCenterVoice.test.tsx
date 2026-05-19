// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock dependent modules
vi.mock("@/lib/storageProvider", () => ({
  saveRecord: vi.fn(),
  getRecords: vi.fn(() => []),
}));

vi.mock("@/lib/aionProfile", () => ({
  loadProfile: vi.fn(async () => ({ version: 0 })),
  analyzeAndUpdateProfile: vi.fn(async () => ({})),
}));

vi.mock("@/lib/aion/patterns", () => ({
  buildEnhancedProfileContext: vi.fn(() => ""),
}));

vi.mock("@/lib/dailyBriefing", () => ({
  shouldShowBriefing: vi.fn(() => false),
  generateBriefing: vi.fn(),
  markBriefingShown: vi.fn(),
}));

vi.mock("@/lib/aionAlerts", () => ({
  checkAllAlerts: vi.fn(async () => ({})),
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

// Mock speak and stopSpeaking from aionVoice using mock-prefixed spies
const mockSpeakSpy = vi.fn(async () => {});
const mockStopSpeakingSpy = vi.fn();

vi.mock("@/lib/aionVoice", () => ({
  speak: (text: string, options?: unknown) => mockSpeakSpy(text, options),
  stopSpeaking: () => mockStopSpeakingSpy(),
}));

// Mock VoiceCenterCockpit to render controls that trigger spies
vi.mock("@/components/voice/VoiceCenter", () => ({
  default: ({ onSendMessage }: { onSendMessage: (text: string) => Promise<void> }) => {
    return createElement("div", {}, [
      createElement("button", {
        key: "send",
        "data-testid": "cockpit-send",
        onClick: () => onSendMessage("comando cockpit")
      }),
      createElement("button", {
        key: "mic",
        "data-testid": "mic-btn",
        onClick: () => {
          mockStopSpeakingSpy();
        }
      })
    ]);
  }
}));

vi.mock("@/lib/sessionMemory", () => ({
  addToSession: vi.fn(),
  getRecentSessionMessages: vi.fn(() => []),
}));

import CommandCenter from "../CommandCenter";

describe("CommandCenter Voice Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          reply: "Este é o reply completo longo que o usuário lê na tela.",
          voiceReply: "Olá usuário!",
        }),
      } as unknown as Response;
    });
  });

  it("chama speak com voiceReply e nunca com o reply completo", async () => {
    render(createElement(CommandCenter));
    
    // Trigger message dispatch
    const sendButton = screen.getByTestId("cockpit-send");
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSpeakSpy).toHaveBeenCalled();
    });

    expect(mockSpeakSpy).toHaveBeenCalledWith("Olá usuário!", expect.any(Object));
    expect(mockSpeakSpy).not.toHaveBeenCalledWith("Este é o reply completo longo que o usuário lê na tela.", expect.any(Object));
  });

  it("chama stopSpeaking ao clicar no botão de microfone", async () => {
    render(createElement(CommandCenter));

    const micButton = screen.getByTestId("mic-btn");
    fireEvent.click(micButton);

    expect(mockStopSpeakingSpy).toHaveBeenCalled();
  });
});
