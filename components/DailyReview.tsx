"use client";

import { useState, useEffect } from "react";
import { FileText, CheckCircle, Lightbulb, Wallet, Sparkles, Loader2 } from "lucide-react";
import type { CortexRecord } from "@/lib/types";
import {
  getTodaysRecords,
  getSpentToday,
  getRecordsByType,
} from "@/lib/storageProvider";
import { saveRecord } from "@/lib/storageProvider";
import { shouldShowDescription } from "@/lib/records/display";

export default function DailyReview() {
  const [todaysEntries, setTodaysEntries] = useState<CortexRecord[]>([]);
  const [doneToday, setDoneToday] = useState(0);
  const [spentToday, setSpentToday] = useState(0);
  const [todaysIdeas, setTodaysIdeas] = useState(0);
  const [summary, setSummary] = useState("");
  const [generating, setGenerating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadData();
  }, []);

  const loadData = () => {
    const today = new Date().toISOString().split("T")[0];
    setTodaysEntries(getTodaysRecords());
    setSpentToday(getSpentToday());
    setDoneToday(
      getRecordsByType("task").filter(
        (t) => t.status === "done" && t.createdAt.startsWith(today)
      ).length
    );
    setTodaysIdeas(
      getRecordsByType("idea").filter((i) => i.createdAt.startsWith(today)).length
    );
  };

  const handleGenerateSummary = () => {
    setGenerating(true);
    const pendingTasks = todaysEntries.filter(
      (e) => e.type === "task" && e.status === "pending"
    );

    const lines: string[] = [];
    lines.push(`📋 Revisão diária — ${new Date().toLocaleDateString("pt-BR")}`);
    lines.push("");

    if (todaysEntries.length > 0) {
      lines.push(`Total de entradas hoje: ${todaysEntries.length}`);
    }
    if (doneToday > 0) {
      lines.push(`Tarefas concluídas: ${doneToday}`);
    }
    if (spentToday > 0) {
      lines.push(`Gastos do dia: R$ ${spentToday.toFixed(2)}`);
    }
    if (todaysIdeas > 0) {
      lines.push(`Ideias capturadas: ${todaysIdeas}`);
    }
    if (pendingTasks.length > 0) {
      lines.push("");
      lines.push(`Pendentes: ${pendingTasks.length} tarefa(s)`);
      pendingTasks.slice(0, 3).forEach((t) => {
        lines.push(`  • ${t.title}`);
      });
    }

    setSummary(lines.join("\n"));
    setGenerating(false);

    const reviewRecord: CortexRecord = {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      type: "daily_review",
      title: `Revisão diária — ${new Date().toLocaleDateString("pt-BR")}`,
      description: lines.join("\n"),
      priority: "medium",
      project: null,
      amount: null,
      category: null,
      dueDate: null,
      nextAction: "",
      status: "done",
      createdAt: new Date().toISOString(),
    };
    saveRecord(reviewRecord);
  };

  if (!mounted) return null;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Revisão Diária</h2>
          <p className="text-sm text-zinc-500">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3">
          <p className="text-2xl font-bold text-zinc-100">{todaysEntries.length}</p>
          <p className="text-xs text-zinc-500 mt-1">Entradas</p>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <p className="text-2xl font-bold text-zinc-100">{doneToday}</p>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Concluídas</p>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center gap-1">
            <Wallet className="w-4 h-4 text-green-400" />
            <p className="text-2xl font-bold text-zinc-100">R$ {spentToday.toFixed(2)}</p>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Gastos</p>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center gap-1">
            <Lightbulb className="w-4 h-4 text-purple-400" />
            <p className="text-2xl font-bold text-zinc-100">{todaysIdeas}</p>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Ideias</p>
        </div>
      </div>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Resumo do dia
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Seu resumo aparecerá aqui..."
          rows={6}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm"
        />
        <button
          onClick={handleGenerateSummary}
          disabled={generating}
          className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm hover:bg-cyan-500/20 transition-all disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Gerar resumo local
        </button>
      </div>

      {todaysEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Entradas de hoje</h3>
          <div className="space-y-2">
            {todaysEntries.map((entry) => (
              <div
                key={entry.id}
                className="bg-zinc-900/60 border border-zinc-800/50 rounded-lg p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    entry.type === "task" ? "bg-blue-500/20 text-blue-400" :
                    entry.type === "idea" ? "bg-purple-500/20 text-purple-400" :
                    entry.type === "expense" ? "bg-green-500/20 text-green-400" :
                    entry.type === "focus_request" ? "bg-red-500/20 text-red-400" :
                    "bg-zinc-500/20 text-zinc-400"
                  }`}>
                    {entry.type === "task" ? "Tarefa" :
                     entry.type === "idea" ? "Ideia" :
                     entry.type === "expense" ? "Gasto" :
                     entry.type === "focus_request" ? "Foco" : entry.type}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {new Date(entry.createdAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-zinc-300 text-sm">{entry.title}</p>
                {shouldShowDescription(entry) && (
                  <p className="text-xs text-zinc-500 mt-1">{entry.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
