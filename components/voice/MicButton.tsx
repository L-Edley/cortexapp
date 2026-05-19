"use client";

import React, { useEffect, useRef } from "react";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";

export interface MicButtonProps {
  state: "idle" | "listening" | "processing" | "speaking" | "error";
  lang?: string;
  disabled?: boolean;
  onTranscript?: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onStop?: () => void;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: {
    readonly transcript: string;
  };
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
}

interface ISpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export default function MicButton({
  state,
  lang = "pt-BR",
  disabled = false,
  onTranscript,
  onInterimTranscript,
  onError,
  onStart,
  onStop,
}: MicButtonProps) {
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognitionConstructor = typeof window !== "undefined"
      ? ((window as Record<string, unknown>).SpeechRecognition || (window as Record<string, unknown>).webkitSpeechRecognition)
      : null;

    if (!SpeechRecognitionConstructor) {
      if (state === "listening" && onError) {
        onError("Reconhecimento de voz não disponível neste navegador.");
      }
      return;
    }

    if (state === "listening") {
      if (!recognitionRef.current) {
        try {
          const rec = new (SpeechRecognitionConstructor as new () => ISpeechRecognition)();
          rec.lang = lang;
          rec.interimResults = true;
          rec.continuous = false;

          rec.onstart = () => {
            if (onStart) onStart();
          };

          rec.onresult = (event: SpeechRecognitionEvent) => {
            let interimTranscript = "";
            let finalTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }
            if (interimTranscript && onInterimTranscript) {
              onInterimTranscript(interimTranscript);
            }
            if (finalTranscript && onTranscript) {
              onTranscript(finalTranscript);
            }
          };

          rec.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (onError) onError(event.error || "Erro no reconhecimento de voz");
          };

          rec.onend = () => {
            if (onStop) onStop();
          };

          recognitionRef.current = rec;
          rec.start();
        } catch (e) {
          if (onError) onError(String(e));
        }
      }
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [state, lang]);

  const handleClick = () => {
    if (disabled) return;

    const SpeechRecognitionConstructor = typeof window !== "undefined"
      ? ((window as Record<string, unknown>).SpeechRecognition || (window as Record<string, unknown>).webkitSpeechRecognition)
      : null;

    if (!SpeechRecognitionConstructor) {
      if (onError) {
        onError("Reconhecimento de voz não disponível neste navegador.");
      }
      return;
    }

    if (state === "listening") {
      if (onStop) onStop();
    } else {
      if (onStart) onStart();
    }
  };

  // Determine classes based on state
  let buttonClasses = "relative flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 backdrop-blur-sm shadow-lg border ";
  let iconColor = "text-white";

  switch (state) {
    case "listening":
      buttonClasses += "bg-cyan-500/20 border-cyan-400/50 shadow-cyan-500/20 scale-105";
      iconColor = "text-cyan-400";
      break;
    case "processing":
      buttonClasses += "bg-amber-500/20 border-amber-400/50 shadow-amber-500/20 cursor-wait";
      iconColor = "text-amber-400";
      break;
    case "speaking":
      buttonClasses += "bg-emerald-500/20 border-emerald-400/50 shadow-emerald-500/20 animate-pulse";
      iconColor = "text-emerald-400";
      break;
    case "error":
      buttonClasses += "bg-red-500/20 border-red-400/50 shadow-red-500/20";
      iconColor = "text-red-500";
      break;
    case "idle":
    default:
      buttonClasses += "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-105 active:scale-95";
      iconColor = "text-slate-300";
      break;
  }

  if (disabled) {
    buttonClasses += " opacity-50 cursor-not-allowed hover:scale-100 active:scale-100";
  }

  return (
    <div className="relative flex items-center justify-center">
      {/* Wave animation circles in listening state */}
      {state === "listening" && (
        <>
          <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400/30 animate-ping opacity-75" />
          <span className="absolute inline-flex h-16 w-16 rounded-full bg-cyan-400/10 animate-pulse opacity-50" />
        </>
      )}

      {/* Wave animation circles in speaking state */}
      {state === "speaking" && (
        <>
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/25 animate-ping opacity-60" />
          <span className="absolute inline-flex h-14 w-14 rounded-full bg-emerald-400/5 animate-pulse opacity-40" />
        </>
      )}

      {/* Subtle pulse wave in error state */}
      {state === "error" && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400/20 animate-pulse opacity-50" />
      )}

      <button
        onClick={handleClick}
        disabled={disabled}
        className={buttonClasses}
        type="button"
        aria-label="Microfone Aion"
      >
        {state === "processing" ? (
          <Loader2 className={`w-5 h-5 animate-spin ${iconColor}`} />
        ) : state === "error" ? (
          <MicOff className={`w-5 h-5 ${iconColor}`} />
        ) : state === "speaking" ? (
          <Volume2 className={`w-5 h-5 ${iconColor}`} />
        ) : (
          <Mic className={`w-5 h-5 ${iconColor}`} />
        )}
      </button>
    </div>
  );
}
