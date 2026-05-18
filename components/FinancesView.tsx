"use client";

import { useState, useEffect } from "react";
import { Wallet, Trash2, TrendingDown, Calendar } from "lucide-react";
import type { CortexRecord } from "@/lib/types";
import { getRecordsByType, getTotalSpent, getSpentToday } from "@/lib/storage";
import { deleteRecord, subscribeRecordsByType } from "@/lib/storageProvider";

export default function FinancesView() {
  const [expenses, setExpenses] = useState<CortexRecord[]>([]);
  const [spentToday, setSpentToday] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadData();
    const unsub = subscribeRecordsByType("expense", (records) => {
      setExpenses(records);
      setSpentToday(
        records
          .filter((r) => r.createdAt.startsWith(new Date().toISOString().split("T")[0]))
          .reduce((sum, r) => sum + (r.amount ?? 0), 0)
      );
      setTotalSpent(
        records.reduce((sum, r) => sum + (r.amount ?? 0), 0)
      );
    });
    return () => unsub();
  }, []);

  const loadData = () => {
    setExpenses(getRecordsByType("expense"));
    setSpentToday(getSpentToday());
    setTotalSpent(getTotalSpent());
  };

  const handleDelete = async (id: string) => {
    await deleteRecord(id);
    loadData();
  };

  if (!mounted) return null;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Finanças</h2>
          <p className="text-sm text-zinc-500">{expenses.length} registro{expenses.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <Calendar className="w-3.5 h-3.5" />
            <span>Hoje</span>
          </div>
          <p className="text-2xl font-bold text-green-400">
            R$ {spentToday.toFixed(2)}
          </p>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Total geral</span>
          </div>
          <p className="text-2xl font-bold text-red-400">
            R$ {totalSpent.toFixed(2)}
          </p>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Nenhum gasto registrado.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Diga ao Aion quanto você gastou para registrar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-zinc-100 text-sm font-medium truncate">
                      {expense.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {expense.category && (
                      <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                        {expense.category}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">
                      {new Date(expense.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-red-400">
                    R$ {expense.amount?.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
