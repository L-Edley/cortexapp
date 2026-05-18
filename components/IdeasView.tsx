"use client";

import { useState, useEffect } from "react";
import { Lightbulb, Archive, ArrowUpRight, Trash2 } from "lucide-react";
import type { CortexRecord } from "@/lib/types";
import { getRecordsByType } from "@/lib/storageProvider";
import { saveRecord, updateRecord, deleteRecord, subscribeRecordsByType } from "@/lib/storageProvider";
import { shouldShowDescription } from "@/lib/records/display";

export default function IdeasView() {
  const [ideas, setIdeas] = useState<CortexRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadIdeas();
    const unsub = subscribeRecordsByType("idea", (records) => {
      setIdeas(records);
    });
    return () => unsub();
  }, []);

  const loadIdeas = () => {
    setIdeas(getRecordsByType("idea"));
  };

  const handleArchive = async (id: string) => {
    await updateRecord(id, { status: "archived" });
    loadIdeas();
  };

  const handlePromote = async (idea: CortexRecord) => {
    const task: CortexRecord = {
      ...idea,
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      type: "task",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    await saveRecord(task);
    await updateRecord(idea.id, { status: "promoted" });
    loadIdeas();
  };

  const handleDelete = async (id: string) => {
    await deleteRecord(id);
    loadIdeas();
  };

  if (!mounted) return null;

  const activeIdeas = ideas.filter((i) => i.status === "pending" || i.status === "promoted");
  const archivedIdeas = ideas.filter((i) => i.status === "archived");

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Lightbulb className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Ideias</h2>
          <p className="text-sm text-zinc-500">
            {activeIdeas.length} ativa{activeIdeas.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {ideas.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Nenhuma ideia capturada.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Compartilhe ideias com o Aion no Command Center.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeIdeas.map((idea) => (
            <div
              key={idea.id}
              className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-100 text-sm font-medium mb-1">{idea.title}</p>
                  {shouldShowDescription(idea) && (
                    <p className="text-zinc-400 text-xs mt-0.5 mb-1">{idea.description}</p>
                  )}
                  {idea.nextAction && (
                    <p className="text-zinc-500 text-xs">Próxima: {idea.nextAction}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePromote(idea)}
                    className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                    title="Promover para tarefa"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleArchive(idea.id)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="Arquivar"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(idea.id)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {archivedIdeas.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-4 pb-1">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs text-zinc-600">Arquivadas ({archivedIdeas.length})</span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>
              {archivedIdeas.map((idea) => (
                <div
                  key={idea.id}
                  className="bg-zinc-900/40 border border-zinc-800/30 rounded-xl p-4 opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-400 text-sm">{idea.title}</p>
                      {shouldShowDescription(idea) && (
                        <p className="text-zinc-500 text-xs mt-0.5">{idea.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(idea.id)}
                      className="p-1 rounded-lg text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
