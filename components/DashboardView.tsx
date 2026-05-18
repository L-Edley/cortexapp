"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  ListTodo,
  Lightbulb,
  Wallet,
  Zap,
  TrendingUp,
  Target,
} from "lucide-react";
import {
  getRecords,
  getRecordsByType,
  getSpentToday,
  getTopPendingTasks,
  getLastFocusRequest,
  getLatestEntries,
  subscribeRecords,
} from "@/lib/storageProvider";
import type { CortexRecord } from "@/lib/types";

export default function DashboardView({
  onNavigate,
}: {
  onNavigate?: (tab: string) => void;
}) {
  const [stats, setStats] = useState({
    total: 0,
    pendingTasks: 0,
    totalIdeas: 0,
    spentToday: 0,
    topTasks: [] as CortexRecord[],
    lastFocus: null as CortexRecord | null,
    latest: [] as CortexRecord[],
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadStats();
    const unsub = subscribeRecords((records) => {
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      setStats({
        total: records.length,
        pendingTasks: records.filter((r) => r.type === "task" && r.status === "pending").length,
        totalIdeas: records.filter((r) => r.type === "idea" && r.status !== "archived").length,
        spentToday: records
          .filter((r) => r.type === "expense" && r.createdAt.startsWith(new Date().toISOString().split("T")[0]))
          .reduce((sum, r) => sum + (r.amount ?? 0), 0),
        topTasks: records
          .filter((r) => r.type === "task" && r.status === "pending")
          .sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99))
          .slice(0, 3),
        lastFocus: records
          .filter((r) => r.type === "focus_request")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null,
        latest: records.slice(0, 5),
      });
    });
    return () => unsub();
  }, []);

  const loadStats = () => {
    setStats({
      total: getRecords().length,
      pendingTasks: getRecordsByType("task").filter((t) => t.status === "pending").length,
      totalIdeas: getRecordsByType("idea").filter((i) => i.status !== "archived").length,
      spentToday: getSpentToday(),
      topTasks: getTopPendingTasks(3),
      lastFocus: getLastFocusRequest() ?? null,
      latest: getLatestEntries(5),
    });
  };

  if (!mounted) return null;

  const statCards = [
    {
      label: "Tarefas pendentes",
      value: stats.pendingTasks,
      icon: ListTodo,
      color: "bg-blue-500/20 text-blue-400",
      tab: "tasks",
    },
    {
      label: "Ideias ativas",
      value: stats.totalIdeas,
      icon: Lightbulb,
      color: "bg-purple-500/20 text-purple-400",
      tab: "ideas",
    },
    {
      label: "Gasto hoje",
      value: `R$ ${stats.spentToday.toFixed(2)}`,
      icon: Wallet,
      color: "bg-green-500/20 text-green-400",
      tab: "finances",
    },
    {
      label: "Total de registros",
      value: stats.total,
      icon: TrendingUp,
      color: "bg-orange-500/20 text-orange-400",
      tab: "aion",
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <LayoutDashboard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Dashboard</h2>
          <p className="text-sm text-zinc-500">Visão geral do Cortex</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map((card) => (
          <button
            key={card.label}
            onClick={() => onNavigate?.(card.tab)}
            className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 text-left hover:border-zinc-700 transition-all"
          >
            <div className={`w-8 h-8 rounded-lg ${card.color} flex items-center justify-center mb-3`}>
              <card.icon className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold text-zinc-100">{card.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{card.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-zinc-200">Top 3 tarefas</h3>
          </div>
          {stats.topTasks.length === 0 ? (
            <p className="text-zinc-600 text-xs">Nenhuma tarefa pendente.</p>
          ) : (
            <div className="space-y-2">
              {stats.topTasks.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-600 w-4">{i + 1}.</span>
                  <p className="text-sm text-zinc-300 truncate flex-1">{t.title}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    t.priority === "high" ? "bg-red-500/20 text-red-400" :
                    t.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-zinc-500/20 text-zinc-400"
                  }`}>
                    {t.priority === "high" ? "Alta" : t.priority === "medium" ? "Média" : "Baixa"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-medium text-zinc-200">Último pedido de foco</h3>
          </div>
          {stats.lastFocus ? (
            <div>
              <p className="text-sm text-zinc-300">{stats.lastFocus.title}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {new Date(stats.lastFocus.createdAt).toLocaleString("pt-BR")}
              </p>
              {stats.lastFocus.nextAction && (
                <p className="text-xs text-orange-400 mt-1">
                  {stats.lastFocus.nextAction}
                </p>
              )}
            </div>
          ) : (
            <p className="text-zinc-600 text-xs">Nenhum pedido de foco ainda.</p>
          )}
          <button
            onClick={() => onNavigate?.("aion")}
            className="mt-3 text-xs text-orange-500 hover:text-orange-400 transition-colors"
          >
            Pedir foco ao Aion →
          </button>
        </div>
      </div>

      <div className="mt-4 bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <LayoutDashboard className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-200">Últimas entradas</h3>
        </div>
        {stats.latest.length === 0 ? (
          <p className="text-zinc-600 text-xs">Nenhuma entrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {stats.latest.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  entry.type === "task" ? "bg-blue-500/20 text-blue-400" :
                  entry.type === "idea" ? "bg-purple-500/20 text-purple-400" :
                  entry.type === "expense" ? "bg-green-500/20 text-green-400" :
                  entry.type === "focus_request" ? "bg-red-500/20 text-red-400" :
                  "bg-zinc-500/20 text-zinc-400"
                }`}>
                  {entry.type === "task" ? "T" :
                   entry.type === "idea" ? "I" :
                   entry.type === "expense" ? "$" :
                   entry.type === "focus_request" ? "!" : "?"}
                </span>
                <p className="text-sm text-zinc-300 truncate flex-1">{entry.title}</p>
                <span className="text-[10px] text-zinc-600">
                  {new Date(entry.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
