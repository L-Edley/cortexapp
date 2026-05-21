"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import StreamingText from "./StreamingText";
import MicButton from "./MicButton";
import { Send, Sparkles, Terminal } from "lucide-react";
import { stopSpeaking } from "@/lib/aionVoice";

const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), {
  ssr: false,
  loading: () => (
    <div className="relative flex items-center justify-center w-36 h-36 md:w-44 md:h-44 rounded-full border border-slate-800/40 bg-slate-900/10 backdrop-blur-sm shadow-inner transition-all duration-500">
      <div className="absolute inset-0 rounded-full blur-2xl opacity-20 bg-slate-500 scale-95 pointer-events-none" />
      <div className="absolute inset-0 rounded-full border-2 border-dashed border-slate-800/30 animate-[spin_20s_linear_infinite]" />
      <div className="absolute inset-2 rounded-full border border-double border-slate-800/20" />
      <div className="absolute inset-4 rounded-full border border-dashed border-slate-800/10 animate-[spin_15s_linear_infinite_reverse]" />
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-slate-950/60 border border-slate-800/40">
        <Terminal className="w-6 h-6 text-slate-400" />
      </div>
    </div>
  ),
});

export interface VoiceCenterProps {
  onSendMessage: (text: string) => Promise<void>;
  aiResponse: string;
  loading: boolean;
  suggestion?: string | null;
  followUp?: string | null;
  tips?: string[];
  sources?: Array<{ title: string; url: string }>;
  coreSource?: "core" | "local";
}

export default function VoiceCenter({
  onSendMessage,
  aiResponse,
  loading,
  suggestion,
  followUp,
  tips = [],
  sources = [],
  coreSource,
}: VoiceCenterProps) {
  const [localInput, setLocalInput] = useState("");
  const [globalState, setGlobalState] = useState<
    "idle" | "listening" | "processing" | "responding" | "error"
  >("idle");
  const [reducedMotion, setReducedMotion] = useState(false);

  // Sync reduced motion preference
  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, []);

  // Sync processing state with parents loading prop
  useEffect(() => {
    if (loading) {
      setGlobalState("processing");
    } else if (aiResponse && aiResponse !== "Sistema online. Aguardando comandos." && aiResponse !== "Processando...") {
      setGlobalState("responding");
    } else {
      setGlobalState("idle");
    }
  }, [loading, aiResponse]);

  const handleSend = async (textToSend?: string) => {
    const finalMsg = (textToSend ?? localInput).trim();
    if (!finalMsg) return;

    setLocalInput("");
    setGlobalState("processing");
    try {
      await onSendMessage(finalMsg);
    } catch {
      setGlobalState("error");
      setTimeout(() => setGlobalState("idle"), 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Determine status color/text
  let statusText = "AION — PRONTO";
  let statusColor = "text-slate-400 border-slate-500/30 bg-slate-500/5";

  switch (globalState) {
    case "listening":
      statusText = "AION — ESCUTANDO...";
      statusColor = "text-cyan-400 border-cyan-400/30 bg-cyan-400/5 animate-pulse";
      break;
    case "processing":
      statusText = "AION — PROCESSANDO...";
      statusColor = "text-amber-400 border-amber-400/30 bg-amber-400/5";
      break;
    case "responding":
      statusText = "AION — TRANSMITINDO";
      statusColor = "text-emerald-400 border-emerald-400/30 bg-emerald-400/5";
      break;
    case "error":
      statusText = "AION — FALHA";
      statusColor = "text-red-500 border-red-500/30 bg-red-500/5";
      break;
    case "idle":
    default:
      break;
  }

  return (
    <div className="flex flex-col flex-1 w-full max-w-4xl mx-auto min-h-[460px] md:min-h-[540px] bg-slate-950/40 backdrop-blur-md border border-slate-800/60 rounded-3xl p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 relative overflow-hidden shadow-2xl transition-all duration-500">
      {/* Animated holographic scanline background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.2)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-50" />

      {/* Top Status Bar */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 z-10">
        <div className="flex items-center space-x-2.5">
          <div className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              globalState === "listening" ? "bg-cyan-400" :
              globalState === "processing" ? "bg-amber-400" :
              globalState === "responding" ? "bg-emerald-400" :
              globalState === "error" ? "bg-red-500" : "bg-slate-400"
            }`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              globalState === "listening" ? "bg-cyan-500" :
              globalState === "processing" ? "bg-amber-500" :
              globalState === "responding" ? "bg-emerald-500" :
              globalState === "error" ? "bg-red-600" : "bg-slate-500"
            }`} />
          </div>
          <span className="font-mono text-xs text-slate-400 uppercase tracking-widest">
            AION COCKPIT v2.5
          </span>
          {coreSource && (
            <span className="flex items-center space-x-1 ml-3" title={coreSource === "core" ? "AION Core conectado" : "Modo local"}>
              <span className={`inline-flex rounded-full h-1.5 w-1.5 ${coreSource === "core" ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" : "bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]"}`} />
              <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider hidden sm:inline">
                {coreSource === "core" ? "CORE" : "LOCAL"}
              </span>
            </span>
          )}
        </div>

        <div className={`px-3 py-1 rounded-full border text-[10px] font-mono tracking-widest ${statusColor} transition-all duration-300`}>
          {statusText}
        </div>
      </div>

      {/* Center Display: Space for future 3D Globe Canvas & Aion responses */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] md:min-h-[240px] space-y-6 md:space-y-8 z-10">
        
        <GlobeCanvas
          state={globalState === "responding" ? "speaking" : globalState}
          reducedMotion={reducedMotion}
          size="md"
        />

        {/* Dynamic Aion Text Output Panel */}
        <div className="w-full bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 min-h-[90px] flex items-start space-x-3.5 shadow-inner">
          <span className="font-mono text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1 select-none">
            AION ›
          </span>
          <div className="flex-1 min-w-0">
            <StreamingText
              text={aiResponse}
              speedMs={35}
              isActive={globalState !== "idle"}
              highlightNumbers={true}
            />
          </div>
        </div>
      </div>

      {/* Suggested & Context widgets (if any) */}
      {(suggestion || followUp || tips.length > 0 || sources.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800/50 pt-4 z-10">
          {/* Column 1: Suggestions and Follow-up */}
          <div className="space-y-3">
            {suggestion && (
              <div className="flex items-center space-x-2 text-xs bg-slate-900/40 border border-slate-800/50 rounded-xl p-3">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-slate-300 font-sans">{suggestion}</span>
              </div>
            )}
            {followUp && (
              <div className="text-xs bg-slate-900/40 border border-slate-800/50 rounded-xl p-3">
                <span className="text-slate-500 font-mono block mb-1 uppercase tracking-wider">Follow-up:</span>
                <span className="text-slate-300 font-sans">{followUp}</span>
              </div>
            )}
          </div>

          {/* Column 2: Tips and Sources */}
          <div className="space-y-3">
            {tips.length > 0 && (
              <div className="text-xs bg-slate-900/40 border border-slate-800/50 rounded-xl p-3 max-h-[100px] overflow-y-auto font-mono text-slate-400">
                <span className="text-slate-500 block mb-1 uppercase tracking-wider">Dicas:</span>
                {tips.slice(0, 2).map((t, idx) => (
                  <div key={idx} className="truncate">• {t}</div>
                ))}
              </div>
            )}
            {sources.length > 0 && (
              <div className="text-xs bg-slate-900/40 border border-slate-800/50 rounded-xl p-3">
                <span className="text-slate-500 font-mono block mb-1 uppercase tracking-wider">Fontes:</span>
                <div className="flex flex-wrap gap-2">
                  {sources.slice(0, 3).map((s, idx) => (
                    <a
                      key={idx}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 transition-colors underline font-mono text-[10px]"
                    >
                      [{s.title}]
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Row Panel (fixed/glassmorphic at bottom) */}
      <div className="flex items-center space-x-3 bg-slate-900/80 border border-slate-800/80 rounded-2xl p-2.5 z-10">
        <span className="font-mono text-xs text-slate-500 select-none pl-2 hidden sm:inline">
          USER ›
        </span>
        <input
          type="text"
          className="flex-1 bg-transparent border-0 outline-none ring-0 text-slate-100 font-mono placeholder-slate-500 text-sm py-2 px-1 focus:ring-0 focus:outline-none"
          placeholder="fale ou digite um comando..."
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />

        <MicButton
          state={
            globalState === "listening"
              ? "listening"
              : globalState === "processing"
              ? "processing"
              : globalState === "responding"
              ? "speaking"
              : "idle"
          }
          onStart={() => {
            stopSpeaking();
            setGlobalState("listening");
          }}
          onStop={() => setGlobalState("idle")}
          onTranscript={(text) => {
            setLocalInput(text);
            handleSend(text);
          }}
          onInterimTranscript={(text) => {
            setLocalInput(text);
          }}
          onError={(err) => {
            console.error("Erro VoiceCenter Mic:", err);
            setGlobalState("error");
            setTimeout(() => setGlobalState("idle"), 3000);
          }}
          disabled={loading}
        />

        <button
          onClick={() => handleSend()}
          disabled={loading || !localInput.trim()}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          title="Enviar"
          type="button"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
