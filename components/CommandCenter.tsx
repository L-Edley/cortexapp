"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Loader2, AlertCircle, Sparkles, Zap, CheckCircle2, CloudOff } from "lucide-react";
import type { CortexApiResponse, CortexRecord } from "@/lib/types";
import { saveRecord, getStorageLabelForIndicator } from "@/lib/storageProvider";

type Interaction = {
  id: string;
  message: string;
  response: CortexApiResponse;
  timestamp: string;
};

export default function CommandCenter() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [mounted, setMounted] = useState(false);
  const [syncIndicator, setSyncIndicator] = useState<{ id: string; ok: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("cortex_interactions");
    if (stored) {
      try {
        setInteractions(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("cortex_interactions", JSON.stringify(interactions));
    }
  }, [interactions, mounted]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [interactions]);

  const handleSend = async (text?: string) => {
    const msg = (text ?? message).trim();
    if (!msg) return;

    setLoading(true);
    setError(null);

    try {
      if (!text) setMessage("");
      const res = await fetch("/api/cortex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${res.status}`);
      }

      const data: CortexApiResponse = await res.json();

      const interaction: Interaction = {
        id: crypto.randomUUID?.() ?? Date.now().toString(),
        message: msg,
        response: data,
        timestamp: new Date().toISOString(),
      };

      setInteractions((prev) => [interaction, ...prev]);

      const record: CortexRecord = {
        id: interaction.id,
        type: data.type,
        title: data.title,
        description: data.description,
        priority: data.priority,
        project: data.project,
        amount: data.amount,
        category: data.category,
        dueDate: data.dueDate,
        nextAction: data.nextAction,
        status: data.type === "task" ? "pending" : data.type === "idea" ? "archived" : "pending",
        createdAt: interaction.timestamp,
      };

      await saveRecord(record);
      localStorage.setItem("cortex_has_data", "true");
      setSyncIndicator({ id: interaction.id, ok: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar mensagem");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestions = [
    "Gastei R$32 no almoço",
    "Ideia: criar agente SDR para negócios locais",
    "Preciso revisar o dashboard amanhã",
    "Estou travado, o que faço agora?",
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 sm:p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Fale com Aion</h2>
            <p className="text-sm text-zinc-500">Sua IA pessoal de organização</p>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem para o Aion..."
            rows={3}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
            disabled={loading}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !message.trim()}
            className="absolute bottom-3 right-3 w-9 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white flex items-center justify-center transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2 mt-3 flex-wrap">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setMessage(s);
                handleSend(s);
              }}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 transition-all disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {interactions.length === 0 ? (
          <div className="text-center py-12">
            <Zap className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">
              Envie sua primeira mensagem para o Aion.
            </p>
            <p className="text-zinc-600 text-xs mt-1">
              Classificação e salvamento automáticos.
            </p>
          </div>
        ) : (
          interactions.map((interaction) => (
            <div
              key={interaction.id}
              className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="text-zinc-400 text-xs mb-1">Você</p>
                  <p className="text-zinc-200 text-sm">{interaction.message}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                  {syncIndicator?.id === interaction.id && (
                    syncIndicator.ok ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" title={getStorageLabelForIndicator()} />
                    ) : (
                      <CloudOff className="w-3 h-3 text-zinc-600" title="Salvo apenas localmente" />
                    )
                  )}
                  <span className="text-[10px] text-zinc-600">
                    {new Date(interaction.timestamp).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>

              <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    interaction.response.type === "task" ? "bg-blue-500/20 text-blue-400" :
                    interaction.response.type === "idea" ? "bg-purple-500/20 text-purple-400" :
                    interaction.response.type === "expense" ? "bg-green-500/20 text-green-400" :
                    interaction.response.type === "focus_request" ? "bg-red-500/20 text-red-400" :
                    interaction.response.type === "project_note" ? "bg-amber-500/20 text-amber-400" :
                    interaction.response.type === "daily_review" ? "bg-cyan-500/20 text-cyan-400" :
                    "bg-zinc-500/20 text-zinc-400"
                  }`}>
                    {interaction.response.type === "task" ? "Tarefa" :
                     interaction.response.type === "idea" ? "Ideia" :
                     interaction.response.type === "expense" ? "Gasto" :
                     interaction.response.type === "focus_request" ? "Foco" :
                     interaction.response.type === "project_note" ? "Projeto" :
                     interaction.response.type === "daily_review" ? "Revisão" :
                     "Desconhecido"}
                  </span>
                  {interaction.response.priority && interaction.response.type !== "expense" && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      interaction.response.priority === "high" ? "bg-red-500/20 text-red-400" :
                      interaction.response.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-zinc-500/20 text-zinc-400"
                    }`}>
                      {interaction.response.priority === "high" ? "Alta" :
                       interaction.response.priority === "medium" ? "Média" : "Baixa"}
                    </span>
                  )}
                </div>
                <p className="text-zinc-100 text-sm font-medium">{interaction.response.title}</p>
                {interaction.response.amount != null && (
                  <p className="text-green-400 text-sm font-semibold mt-1">
                    R$ {interaction.response.amount.toFixed(2)}
                  </p>
                )}
                {interaction.response.nextAction && (
                  <p className="text-zinc-500 text-xs mt-1.5">
                    Próxima ação: {interaction.response.nextAction}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
