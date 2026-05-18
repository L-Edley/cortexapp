import { useState } from "react";

/**
 * useVoice Hook
 * Strictly uses Web Speech Synthesis (pt-BR) to speak locally,
 * avoiding any cloud service charges (such as ElevenLabs) or API key exposure.
 */
export const useVoice = () => {
  const [state, setState] = useState<"idle" | "speaking">("idle");

  const speak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("Web Speech Synthesis não é suportada neste navegador.");
      return;
    }

    // Cancela qualquer fala ativa anterior
    window.speechSynthesis.cancel();

    setState("speaking");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find((v) => v.lang.startsWith("pt"));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    utterance.onend = () => setState("idle");
    utterance.onerror = () => setState("idle");

    window.speechSynthesis.speak(utterance);
  };

  return { state, speak };
};
