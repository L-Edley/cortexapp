import { useState, useEffect, useRef } from "react";

export const useVoice = (onTranscript: (text: string) => void) => {
  const [state, setState] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [isSupported, setIsSupported] = useState(false);
  const recognition = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    recognition.current = new SpeechRecognition();
    recognition.current.lang = "pt-BR";
    recognition.current.continuous = false;
    recognition.current.interimResults = true;

    recognition.current.onstart = () => setState("listening");
    recognition.current.onend = () => setState("idle");
    recognition.current.onerror = () => setState("idle");

    recognition.current.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join("");
      if (event.results[0].isFinal) {
        onTranscript(transcript);
      }
    };

    return () => {
      recognition.current?.abort();
    };
  }, [onTranscript]);

  const startListening = () => {
    if (state === "listening") {
      recognition.current?.stop();
    } else {
      setState("listening");
      try {
        recognition.current?.start();
      } catch {
        recognition.current?.stop();
        recognition.current?.start();
      }
    }
  };

  const stopListening = () => {
    recognition.current?.stop();
    setState("idle");
  };

  const speak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("Speech Synthesis não é suportado neste navegador.");
      return;
    }

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

  return { state, setState, isSupported, startListening, stopListening, speak };
};
