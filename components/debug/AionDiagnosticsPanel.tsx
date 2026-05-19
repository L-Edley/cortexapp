"use client";

import React, { useState, useEffect } from "react";
import { Shield, Activity, Trash2, ChevronDown, ChevronUp, Terminal } from "lucide-react";

export interface DiagnosticCycle {
  timestamp: string;
  intent: string;
  providerUsed: string;
  fallbackUsed: boolean;
  streamingUsed: boolean;
  totalMs: number;
  firstStatusMs?: number;
  firstTokenMs?: number;
  streamTotalMs?: number;
  classifyIntentMs?: number;
  contextBuildMs?: number;
  semanticSearchMs?: number;
  llmMs?: number;
  storageMs?: number;
  ttsStartMs?: number;
  errorType?: string;
  errorFallbackUsed?: string;
}

interface AionDiagnosticsPanelProps {
  latestMetrics?: DiagnosticCycle | null;
}

export default function AionDiagnosticsPanel({ latestMetrics }: AionDiagnosticsPanelProps) {
  const [history, setHistory] = useState<DiagnosticCycle[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Check visibility conditions
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isDev = process.env.NODE_ENV === "development";
    const debugFlag = localStorage.getItem("aion_debug") === "true";

    if (isDev || debugFlag) {
      setIsVisible(true);
    }
  }, []);

  // Update history when new metrics are received
  useEffect(() => {
    if (!latestMetrics) return;

    setHistory((prev) => {
      // Avoid duplicate logs if same metrics are passed repeatedly
      const exists = prev.some(
        (item) =>
          item.timestamp === latestMetrics.timestamp &&
          item.totalMs === latestMetrics.totalMs &&
          item.intent === latestMetrics.intent
      );
      if (exists) return prev;

      const newHistory = [latestMetrics, ...prev];
      return newHistory.slice(0, 5); // limit to last 5 cycles
    });
  }, [latestMetrics]);

  if (!isVisible) return null;

  const handleClear = () => {
    setHistory([]);
  };

  const getMetricColor = (val: number | undefined, thresholds: { fast: number; med: number }) => {
    if (val === undefined) return "text-slate-500";
    if (val <= thresholds.fast) return "text-emerald-400 font-mono";
    if (val <= thresholds.med) return "text-amber-400 font-mono";
    return "text-rose-400 font-mono font-bold animate-pulse";
  };

  const getMetricBadge = (val: number | undefined, thresholds: { fast: number; med: number }) => {
    if (val === undefined) return "bg-slate-900/40 border-slate-800 text-slate-500";
    if (val <= thresholds.fast) return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    if (val <= thresholds.med) return "bg-amber-500/10 border-amber-500/30 text-amber-400";
    return "bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse";
  };

  return (
    <div className="w-full rounded-xl border border-slate-800/40 bg-slate-950/40 backdrop-blur-md shadow-2xl p-4 overflow-hidden relative">
      <div className="flex items-center justify-between border-b border-slate-800/40 pb-3 mb-3">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="text-xs font-mono tracking-widest text-cyan-400 font-bold uppercase">
            Aion telemetry & diagnostics
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-slate-900 text-slate-500 hover:text-slate-300 transition-colors"
            title="Limpar Histórico"
            type="button"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded hover:bg-slate-900 text-slate-400 hover:text-white transition-colors flex items-center space-x-1"
            type="button"
          >
            <span className="text-[10px] font-mono uppercase tracking-widest">
              {isOpen ? "Colapsar" : "Expandir"}
            </span>
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Terminal className="w-6 h-6 text-slate-700 mb-2" />
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                Nenhum ciclo de telemetria registrado ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {history.map((cycle, idx) => {
                const total = cycle.totalMs || 0;
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-900 bg-slate-950/80 space-y-2 relative"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          #{history.length - idx}
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                          {cycle.intent}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[9px] font-mono text-slate-500">
                        <span>{new Date(cycle.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-500 font-mono block">Provider:</span>
                        <span className="text-slate-300 font-mono font-bold">
                          {cycle.providerUsed || "none"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-mono block">Fallback:</span>
                        <span
                          className={`font-mono font-bold ${
                            cycle.fallbackUsed ? "text-rose-400" : "text-slate-400"
                          }`}
                        >
                          {cycle.fallbackUsed ? "SIM" : "NÃO"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-mono block">Streaming:</span>
                        <span
                          className={`font-mono font-bold ${
                            cycle.streamingUsed ? "text-cyan-400" : "text-slate-400"
                          }`}
                        >
                          {cycle.streamingUsed ? "SIM" : "NÃO"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-mono block">Total Latency:</span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${getMetricBadge(total, { fast: 1000, med: 2500 })}`}>
                          {total}ms
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-slate-900/60 pt-2 grid grid-cols-3 sm:grid-cols-6 gap-2 text-[9px] font-mono">
                      <div>
                        <span className="text-slate-500 block">Classify:</span>
                        <span className={getMetricColor(cycle.classifyIntentMs, { fast: 150, med: 400 })}>
                          {cycle.classifyIntentMs !== undefined ? `${cycle.classifyIntentMs}ms` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Context:</span>
                        <span className={getMetricColor(cycle.contextBuildMs, { fast: 300, med: 800 })}>
                          {cycle.contextBuildMs !== undefined ? `${cycle.contextBuildMs}ms` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Retrieval:</span>
                        <span className={getMetricColor(cycle.semanticSearchMs, { fast: 150, med: 400 })}>
                          {cycle.semanticSearchMs !== undefined ? `${cycle.semanticSearchMs}ms` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">LLM:</span>
                        <span className={getMetricColor(cycle.llmMs, { fast: 1200, med: 3000 })}>
                          {cycle.llmMs !== undefined ? `${cycle.llmMs}ms` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Storage:</span>
                        <span className={getMetricColor(cycle.storageMs, { fast: 100, med: 300 })}>
                          {cycle.storageMs !== undefined ? `${cycle.storageMs}ms` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">TTS Latency:</span>
                        <span className={getMetricColor(cycle.ttsStartMs, { fast: 500, med: 1500 })}>
                          {cycle.ttsStartMs !== undefined ? `${cycle.ttsStartMs}ms` : "—"}
                        </span>
                      </div>
                    </div>

                    {cycle.streamingUsed && (
                      <div className="border-t border-slate-900/60 pt-2 grid grid-cols-3 gap-2 text-[9px] font-mono text-cyan-500/80">
                        <div>
                          <span>1st Status: </span>
                          <span className="font-bold">{cycle.firstStatusMs ?? 0}ms</span>
                        </div>
                        <div>
                          <span>1st Token: </span>
                          <span className="font-bold">{cycle.firstTokenMs ?? 0}ms</span>
                        </div>
                        <div>
                          <span>Stream End: </span>
                          <span className="font-bold">{cycle.streamTotalMs ?? 0}ms</span>
                        </div>
                      </div>
                    )}

                    {cycle.errorType && (
                      <div className="border-t border-rose-950/60 pt-2 text-[9px] font-mono text-rose-400 space-y-1">
                        <div>
                          <span className="text-rose-500 font-bold uppercase tracking-wider">Error classified:</span>{" "}
                          <span>{cycle.errorType}</span>
                        </div>
                        {cycle.errorFallbackUsed && (
                          <div>
                            <span className="text-cyan-500 font-bold uppercase tracking-wider">Reliability recovery:</span>{" "}
                            <span>{cycle.errorFallbackUsed}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          <div className="flex items-center space-x-1.5 text-[9px] text-slate-500 border-t border-slate-900 pt-2 justify-end">
            <Shield className="w-3 h-3 text-slate-600" />
            <span>Telemetry data is kept strictly inside memory. No personal values logged.</span>
          </div>
        </div>
      )}
    </div>
  );
}
