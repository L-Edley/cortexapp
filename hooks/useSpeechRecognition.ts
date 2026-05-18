"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError("Seu navegador não suporta reconhecimento de voz.");
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      const msgMap: Record<string, string> = {
        "no-speech": "Nenhuma fala detectada. Tente novamente.",
        "aborted": "Escuta cancelada.",
        "audio-capture": "Microfone não encontrado ou sem permissão.",
        "not-allowed": "Permissão do microfone negada.",
        "network": "Erro de rede na captura de áudio.",
      };
      setError(msgMap[event.error] || `Erro: ${event.error}`);
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript((prev) => {
        const base = final
          ? prev + (prev && !prev.endsWith(" ") ? " " : "") + final
          : prev;
        return interim ? base + interim : base;
      });
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    try {
      recognitionRef.current?.start();
    } catch {
      recognitionRef.current?.stop();
      recognitionRef.current?.start();
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}
