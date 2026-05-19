// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isWebSpeechAvailable,
  selectBestPortugueseVoice,
  stopSpeaking,
  speak,
} from "../aionVoice";

describe("aionVoice Library", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalSpeechSynthesis: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalUtterance: any;
  let prevProvider: string | undefined;
  let prevEnabled: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalSpeechSynthesis = (window as any).speechSynthesis;
    originalUtterance = (window as any).SpeechSynthesisUtterance;
    
    prevProvider = process.env.NEXT_PUBLIC_TTS_PROVIDER;
    prevEnabled = process.env.NEXT_PUBLIC_TTS_ENABLED;
    process.env.NEXT_PUBLIC_TTS_PROVIDER = "web_speech";
    process.env.NEXT_PUBLIC_TTS_ENABLED = "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).SpeechSynthesisUtterance = function(this: any, text: string) {
      this.text = text;
      this.lang = "";
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
    };
  });

  afterEach(() => {
    if (originalSpeechSynthesis) {
      (window as any).speechSynthesis = originalSpeechSynthesis;
    }
    if (originalUtterance) {
      (window as any).SpeechSynthesisUtterance = originalUtterance;
    } else {
      delete (window as any).SpeechSynthesisUtterance;
    }
    
    if (prevProvider !== undefined) {
      process.env.NEXT_PUBLIC_TTS_PROVIDER = prevProvider;
    } else {
      delete process.env.NEXT_PUBLIC_TTS_PROVIDER;
    }
    
    if (prevEnabled !== undefined) {
      process.env.NEXT_PUBLIC_TTS_ENABLED = prevEnabled;
    } else {
      delete process.env.NEXT_PUBLIC_TTS_ENABLED;
    }
  });

  it("isWebSpeechAvailable retorna false em SSR", () => {
    // In Node (non-browser environment) without window.speechSynthesis
    delete (window as any).speechSynthesis;
    expect(isWebSpeechAvailable()).toBe(false);
  });

  it("selectBestPortugueseVoice escolhe pt-BR se existir", () => {
    const mockVoices = [
      { lang: "en-US", name: "Samantha" },
      { lang: "pt-PT", name: "Joana" },
      { lang: "pt-BR", name: "Daniel" },
    ];
    
    (window as any).speechSynthesis = {
      getVoices: () => mockVoices,
    };

    const best = selectBestPortugueseVoice();
    expect(best?.lang).toBe("pt-BR");
    expect(best?.name).toBe("Daniel");
  });

  it("selectBestPortugueseVoice escolhe pt-PT se pt-BR não existir", () => {
    const mockVoices = [
      { lang: "en-US", name: "Samantha" },
      { lang: "pt-PT", name: "Joana" },
    ];
    
    (window as any).speechSynthesis = {
      getVoices: () => mockVoices,
    };

    const best = selectBestPortugueseVoice();
    expect(best?.lang).toBe("pt-PT");
  });

  it("stopSpeaking chama cancel", () => {
    const mockCancel = vi.fn();
    (window as any).speechSynthesis = {
      cancel: mockCancel,
      getVoices: () => [],
    };

    stopSpeaking();
    expect(mockCancel).toHaveBeenCalled();
  });

  it("speak não quebra sem speechSynthesis", async () => {
    delete (window as any).speechSynthesis;
    await expect(speak("olá")).resolves.toBeUndefined();
  });

  it("speak usa apenas o texto recebido", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockSpeak = vi.fn((utterance: any) => {
      if (utterance.onend) utterance.onend();
    });
    const mockCancel = vi.fn();
    (window as any).speechSynthesis = {
      cancel: mockCancel,
      speak: mockSpeak,
      getVoices: () => [],
    };

    // Trigger speak
    await speak("teste de texto");
    
    expect(mockCancel).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalled();
    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.text).toBe("teste de texto");
  });
});
