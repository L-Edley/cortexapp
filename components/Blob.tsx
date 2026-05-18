"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface BlobProps {
  isListening: boolean;
}

export default function Blob({ isListening }: BlobProps) {
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isListening) {
      setAudioLevel(0);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const startAudioAnalysis = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    };

    startAudioAnalysis();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [isListening]);

  const scale = 1 + (audioLevel * 0.5);

  return (
    <motion.div
      drag
      dragConstraints={{ left: -300, right: 300, top: -300, bottom: 300 }}
      whileDrag={{ scale: 1.1, cursor: "grabbing" }}
      className="fixed z-50 flex items-center justify-center cursor-grab"
      style={{ bottom: "10%", right: "10%" }}
    >
      <motion.div
        animate={{
          scale: isListening ? scale : [1, 1.05, 1],
          borderRadius: ["40% 60% 70% 30%", "50% 50% 30% 70%", "60% 40% 50% 50%", "40% 60% 70% 30%"]
        }}
        transition={{
          scale: { type: "spring", stiffness: 300, damping: 20 },
          borderRadius: { duration: 4, repeat: Infinity, ease: "linear" }
        }}
        className={`w-32 h-32 rounded-full shadow-[0_0_40px_rgba(0,212,255,0.4)] flex items-center justify-center ${
          isListening 
            ? "bg-gradient-to-tr from-cyan-600 to-blue-400" 
            : "bg-zinc-800 border border-zinc-700"
        }`}
      >
        <div className={`w-16 h-16 rounded-full blur-md ${isListening ? "bg-white/40" : "bg-cyan-500/10"}`} />
      </motion.div>
    </motion.div>
  );
}
