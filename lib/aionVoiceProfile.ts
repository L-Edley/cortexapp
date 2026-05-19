export interface AionVoiceProfile {
  provider: "web_speech" | "elevenlabs" | "local_piper" | "none";
  lang: string;
  voiceName?: string;
  rate: number;
  pitch: number;
  volume: number;
  tone: "calm" | "firm" | "robotic" | "natural" | "strategic";
  personalityPrompt?: string;
  localVoiceId?: string;
}

export function getDefaultVoiceProfile(): AionVoiceProfile {
  return {
    provider: "web_speech",
    lang: "pt-BR",
    rate: 0.95,
    pitch: 1.0,
    volume: 1.0,
    tone: "natural",
  };
}

const STORAGE_KEY = "aion_voice_profile";

export function loadVoiceProfile(): AionVoiceProfile {
  if (typeof window === "undefined") {
    return getDefaultVoiceProfile();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultVoiceProfile();
    const parsed = JSON.parse(raw);
    return {
      ...getDefaultVoiceProfile(),
      ...parsed,
    };
  } catch {
    return getDefaultVoiceProfile();
  }
}

export function saveVoiceProfile(profile: AionVoiceProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn("[VOICE PROFILE] Failed to save voice profile:", err);
  }
}

export function updateVoiceProfile(updates: Partial<AionVoiceProfile>): AionVoiceProfile {
  const current = loadVoiceProfile();
  const updated = {
    ...current,
    ...updates,
  };
  saveVoiceProfile(updated);
  return updated;
}

export function applyVoiceProfileToSpeechOptions(
  profile: AionVoiceProfile,
  options: any = {}
): any {
  return {
    lang: options.lang ?? profile.lang,
    rate: options.rate ?? profile.rate,
    pitch: options.pitch ?? profile.pitch,
    volume: options.volume ?? profile.volume,
    onStart: options.onStart,
    onEnd: options.onEnd,
    onError: options.onError,
  };
}
