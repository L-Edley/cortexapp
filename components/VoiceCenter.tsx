"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import Blob from "./Blob";

interface VoiceCenterProps {
  onCommandComplete: (command: string) => void;
}

export default function VoiceCenter({ onCommandComplete }: VoiceCenterProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn("API de reconhecimento de voz não suportada neste navegador.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let currentInterim = "";
      let currentFinal = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          currentFinal += transcript;
        } else {
          currentInterim += transcript;
        }
      }

      setInterimText(currentInterim);
      if (currentFinal) {
        setFinalText((prev) => prev + " " + currentFinal);
      }

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      silenceTimerRef.current = setTimeout(() => {
        const commandToSubmit = (finalText + " " + currentFinal + " " + currentInterim).trim();
        if (commandToSubmit.length > 2) {
          onCommandComplete(commandToSubmit);
          setInterimText("");
          setFinalText("");
        }
      }, 1500);
    };

    recognition.onerror = (event: any) => {
      console.error("Erro no reconhecimento de voz:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [isListening, finalText, onCommandComplete]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setInterimText("");
      setFinalText("");
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    } else {
      setInterimText("");
      setFinalText("");
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  return (
    <>
      <Blob isListening={isListening} />

      <div className="flex flex-col items-center w-full max-w-2xl mx-auto space-y-4 p-4 border border-zinc-800 bg-zinc-950/50 rounded-2xl">
      <button
        onClick={toggleListening}
        className={`p-4 rounded-full transition-all duration-300 shadow-lg ${
          isListening 
            ? "bg-cyan-500/20 text-cyan-400 animate-pulse shadow-cyan-500/20" 
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        }`}
      >
        {isListening ? <Loader2 className="w-8 h-8 animate-spin" /> : <Mic className="w-8 h-8" />}
      </button>

      <div className="h-24 w-full flex items-center justify-center text-center px-4">
        {isListening ? (
          <p className="text-lg font-mono text-cyan-400">
            {finalText} <span className="opacity-60">{interimText}</span>
            <span className="animate-pulse">_</span>
          </p>
        ) : (
          <p className="text-sm font-mono text-zinc-600 uppercase tracking-widest">
            Sistema Aion em Standby
          </p>
        )}
      </div>
      </div>
    </>
  );
}
