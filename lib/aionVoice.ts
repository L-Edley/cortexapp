import { loadVoiceProfile, applyVoiceProfileToSpeechOptions } from "./aionVoiceProfile";

export type VoiceProvider = "web_speech" | "elevenlabs" | "none";

export interface AionVoiceOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

export interface AionVoiceState {
  isSpeaking: boolean;
  provider: VoiceProvider;
  volume: number;
}

let globalVolume = 1.0;
let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let speakingStatus = false;

export function isWebSpeechAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

export function isVoiceEnabled(): boolean {
  if (typeof process !== "undefined" && process.env) {
    return process.env.NEXT_PUBLIC_TTS_ENABLED !== "false";
  }
  return true;
}

export function getVoiceProvider(): VoiceProvider {
  if (typeof process !== "undefined" && process.env) {
    const prov = process.env.NEXT_PUBLIC_TTS_PROVIDER;
    if (prov === "elevenlabs" || prov === "web_speech" || prov === "none") {
      return prov as VoiceProvider;
    }
  }
  return "web_speech";
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isWebSpeechAvailable()) return [];
  return window.speechSynthesis.getVoices();
}

export function selectBestPortugueseVoice(): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices();
  // Try precise pt-BR
  const ptBR = voices.find((v) => v.lang === "pt-BR");
  if (ptBR) return ptBR;
  // Fallback to any pt
  const ptAny = voices.find((v) => v.lang.startsWith("pt"));
  if (ptAny) return ptAny;
  return null;
}

export function setVoiceVolume(volume: number): void {
  globalVolume = Math.max(0, Math.min(1, volume));
  if (currentAudio) {
    currentAudio.volume = globalVolume;
  }
}

export function stopSpeaking(): void {
  speakingStatus = false;

  // Stop ElevenLabs HTMLAudio if playing
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
    currentAudio = null;
  }

  // Stop Web Speech Synthesis
  if (isWebSpeechAvailable()) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  currentUtterance = null;
}

export function isCurrentlySpeaking(): boolean {
  if (isWebSpeechAvailable() && window.speechSynthesis.speaking) {
    return true;
  }
  return speakingStatus;
}

async function speakWithElevenLabs(text: string, options: AionVoiceOptions): Promise<void> {
  const ttsUrl = `/api/tts?text=${encodeURIComponent(text)}`;
  
  return new Promise((resolve, reject) => {
    try {
      speakingStatus = true;
      if (options.onStart) options.onStart();

      const audio = new Audio(ttsUrl);
      currentAudio = audio;
      audio.volume = options.volume ?? globalVolume;

      audio.onended = () => {
        speakingStatus = false;
        currentAudio = null;
        if (options.onEnd) options.onEnd();
        resolve();
      };

      audio.onerror = () => {
        speakingStatus = false;
        currentAudio = null;
        const errMsg = "ElevenLabs playback failed";
        if (options.onError) options.onError(errMsg);
        reject(new Error(errMsg));
      };

      audio.play().catch((err) => {
        speakingStatus = false;
        currentAudio = null;
        reject(err);
      });
    } catch (err) {
      speakingStatus = false;
      currentAudio = null;
      reject(err);
    }
  });
}

function speakWithWebSpeech(text: string, options: AionVoiceOptions): Promise<void> {
  return new Promise((resolve) => {
    if (!isWebSpeechAvailable()) {
      const err = "Web Speech Synthesis not supported";
      if (options.onError) options.onError(err);
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      speakingStatus = true;
      if (options.onStart) options.onStart();

      const utterance = new SpeechSynthesisUtterance(text);
      currentUtterance = utterance;

      utterance.lang = options.lang ?? "pt-BR";
      utterance.rate = options.rate ?? 0.95;
      utterance.pitch = options.pitch ?? 1.0;
      utterance.volume = options.volume ?? globalVolume;

      let selectedVoice: SpeechSynthesisVoice | null = null;
      try {
        const profile = loadVoiceProfile();
        if (profile.voiceName) {
          const voices = getAvailableVoices();
          selectedVoice = voices.find((v) => v.name === profile.voiceName) || null;
        }
      } catch {
        // Fallback
      }

      if (!selectedVoice) {
        selectedVoice = selectBestPortugueseVoice();
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onend = () => {
        speakingStatus = false;
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (options.onEnd) options.onEnd();
        resolve();
      };

      utterance.onerror = (event) => {
        speakingStatus = false;
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        if (options.onError) options.onError(event.error || "Speech synthesis error");
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      speakingStatus = false;
      currentUtterance = null;
      if (options.onError) options.onError(String(e));
      resolve();
    }
  });
}

export async function speak(text: string, options: AionVoiceOptions = {}): Promise<void> {
  stopSpeaking();

  if (!text || !text.trim()) {
    return;
  }

  if (!isVoiceEnabled()) {
    return;
  }

  const profile = loadVoiceProfile();
  const mergedOptions = applyVoiceProfileToSpeechOptions(profile, options);

  let provider = profile.provider;
  if (provider === "local_piper" || provider === "none") {
    provider = "web_speech";
  }

  if (provider === "elevenlabs") {
    try {
      await speakWithElevenLabs(text, mergedOptions);
      return;
    } catch (err) {
      console.warn("ElevenLabs TTS failed, falling back to Web Speech:", err);
      return speakWithWebSpeech(text, mergedOptions);
    }
  } else {
    return speakWithWebSpeech(text, mergedOptions);
  }
}
