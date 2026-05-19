// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getDefaultVoiceProfile,
  loadVoiceProfile,
  saveVoiceProfile,
  updateVoiceProfile,
  applyVoiceProfileToSpeechOptions,
} from "../aionVoiceProfile";

describe("AionVoiceProfile", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      localStorage.clear();
    }
  });

  it("carrega perfil padrão corretamente", () => {
    const profile = getDefaultVoiceProfile();
    expect(profile.provider).toBe("web_speech");
    expect(profile.lang).toBe("pt-BR");
    expect(profile.rate).toBe(0.95);
    expect(profile.pitch).toBe(1.0);
    expect(profile.volume).toBe(1.0);
    expect(profile.tone).toBe("natural");
  });

  it("salva e carrega o perfil de voz do localStorage", () => {
    const customProfile = {
      provider: "elevenlabs" as const,
      lang: "pt-BR",
      rate: 1.2,
      pitch: 0.9,
      volume: 0.8,
      tone: "calm" as const,
      voiceName: "Rachel",
      personalityPrompt: "Fala de forma calma e pausada",
      localVoiceId: "piper-pt-br",
    };

    saveVoiceProfile(customProfile);

    const loaded = loadVoiceProfile();
    expect(loaded).toEqual(customProfile);
  });

  it("atualiza perfil de voz parcialmente", () => {
    const updated = updateVoiceProfile({ rate: 1.5, tone: "strategic" });
    expect(updated.rate).toBe(1.5);
    expect(updated.tone).toBe("strategic");
    expect(updated.provider).toBe("web_speech"); // mantem o padrao
  });

  it("aplica opções de voz mesclando opções do usuário e do perfil", () => {
    const profile = getDefaultVoiceProfile();
    const options = { rate: 1.1, onStart: () => {} };

    const merged = applyVoiceProfileToSpeechOptions(profile, options);
    expect(merged.rate).toBe(1.1); // sobrescreve
    expect(merged.pitch).toBe(1.0); // mantem do perfil
    expect(merged.volume).toBe(1.0); // mantem do perfil
    expect(merged.onStart).toBe(options.onStart);
  });

  it("não quebra se executado fora do navegador (SSR-safe)", () => {
    const originalWindow = globalThis.window;
    // Simula ambiente Node/SSR deletando temporariamente o global window
    const tempGlobal: any = globalThis;
    delete tempGlobal.window;

    try {
      const profile = loadVoiceProfile();
      expect(profile).toBeDefined();
      expect(profile.provider).toBe("web_speech");

      expect(() => saveVoiceProfile(profile)).not.toThrow();
    } finally {
      // Restaura o ambiente
      tempGlobal.window = originalWindow;
    }
  });
});
