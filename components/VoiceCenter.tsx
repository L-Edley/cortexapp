"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Loader2 } from "lucide-react";
import Blob from "./Blob";

interface VoiceCenterProps {
  onCommandComplete: (command: string) => void;
}

export default function VoiceCenter({ onCommandComplete }: VoiceCenterProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);

    if (!SpeechRecognition) return;

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
      if (event.error !== "aborted") {
        console.error("Erro no reconhecimento de voz:", event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [isListening, finalText, onCommandComplete]);

  const startAudioAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);

      const analyze = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);

        const sum = dataArrayRef.current.reduce((a, b) => a + b, 0);
        const average = sum / dataArrayRef.current.length;

        setAudioLevel(average / 50);

        animationFrameRef.current = requestAnimationFrame(analyze);
      };

      analyze();
    } catch (err) {
      console.error("Erro ao aceder ao microfone para a animação:", err);
    }
  }, []);

  const stopAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    if (isListening) {
      startAudioAnalysis();
    } else {
      stopAudioAnalysis();
    }

    return () => {
      if (isListening) stopAudioAnalysis();
    };
  }, [isListening, startAudioAnalysis, stopAudioAnalysis]);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      setInterimText("");
      setFinalText("");
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    } else {
      setInterimText("");
      setFinalText("");
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error("Erro ao iniciar reconhecimento:", err);
      }
    }
  };

  if (!speechSupported) {
    return (
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto space-y-4 p-4 border border-zinc-800 bg-zinc-950/50 rounded-2xl">
        <p className="text-sm font-mono text-zinc-500 text-center">
          Reconhecimento de voz não suportado neste navegador.
        </p>
      </div>
    );
  }

  return (
    <>
      <Blob isListening={isListening} audioLevel={audioLevel} />

      <div className={`flex flex-col items-center w-full ${isMobile ? "max-w-full px-2" : "max-w-2xl mx-auto px-4"} space-y-3 p-3 border border-zinc-800 bg-zinc-950/50 rounded-2xl`}>
        <button
          onClick={toggleListening}
          className={`p-3 ${isMobile ? "p-3" : "p-4"} rounded-full transition-all duration-300 shadow-lg ${
            isListening
              ? "bg-cyan-500/20 text-cyan-400 animate-pulse shadow-cyan-500/20"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          {isListening ? (
            <Loader2 className={`${isMobile ? "w-6 h-6" : "w-8 h-8"} animate-spin`} />
          ) : (
            <Mic className={`${isMobile ? "w-6 h-6" : "w-8 h-8"}`} />
          )}
        </button>

        <div className={`${isMobile ? "h-16" : "h-24"} w-full flex items-center justify-center text-center px-2`}>
          {isListening ? (
            <p className={`${isMobile ? "text-sm" : "text-lg"} font-mono text-cyan-400 break-words`}>
              {finalText}{" "}
              <span className="opacity-60">{interimText}</span>
              <span className="animate-pulse">_</span>
            </p>
          ) : (
            <p className="text-xs sm:text-sm font-mono text-zinc-600 uppercase tracking-widest">
              Sistema Aion em Standby
            </p>
          )}
        </div>
      </div>
    </>
  );
}
