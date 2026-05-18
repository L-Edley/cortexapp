"use client";

import { useState, useEffect } from "react";
import { Check, Trash2, ListTodo, AlertTriangle, Target } from "lucide-react";
import type { CortexRecord } from "@/lib/types";
import { getRecordsByType } from "@/lib/storageProvider";
import { updateRecord, deleteRecord, subscribeRecordsByType } from "@/lib/storageProvider";

export default function TasksView() {
  const [tasks, setTasks] = useState<CortexRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadTasks();
    const unsub = subscribeRecordsByType("task", (records) => {
      setTasks(records);
    });
    return () => unsub();
  }, []);

  const loadTasks = () => {
    setTasks(getRecordsByType("task"));
  };

  const handleToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "done" ? "pending" : "done";
    await updateRecord(id, { status: newStatus as CortexRecord["status"] });
    loadTasks();
  };

  const handleDelete = async (id: string) => {
    await deleteRecord(id);
    loadTasks();
  };

  if (!mounted) return null;

  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <ListTodo className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Tarefas</h2>
          <p className="text-sm text-zinc-500">
            {pendingTasks.length} pendente{pendingTasks.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {pendingTasks.length === 0 && doneTasks.length === 0 ? (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Nenhuma tarefa ainda.</p>
          <p className="text-zinc-600 text-xs mt-1">
            As tarefas aparecerão aqui após classificação pelo Aion.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingTasks.map((task) => (
            <TaskCard key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
          ))}

          {doneTasks.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-4 pb-1">
                <div className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs text-zinc-600">Concluídas ({doneTasks.length})</span>
                <div className="h-px flex-1 bg-zinc-800" />
              </div>
              {doneTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onToggle,
  onDelete,
}: {
  task: CortexRecord;
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const isDone = task.status === "done";

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isDone
          ? "bg-zinc-900/40 border-zinc-800/30"
          : task.priority === "high"
          ? "bg-red-950/20 border-red-900/30"
          : "bg-zinc-900/80 border-zinc-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(task.id, task.status)}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            isDone
              ? "bg-green-500 border-green-500"
              : "border-zinc-600 hover:border-zinc-400"
          }`}
        >
          {isDone && <Check className="w-3 h-3 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {task.priority === "high" && !isDone && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            )}
            <p
              className={`text-sm truncate ${
                isDone ? "text-zinc-600 line-through" : "text-zinc-200"
              }`}
            >
              {task.title}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {task.project && (
              <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                {task.project}
              </span>
            )}
            {task.dueDate && (
              <span className="text-[10px] text-zinc-500">{task.dueDate}</span>
            )}
            {!isDone && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  task.priority === "high"
                    ? "bg-red-500/20 text-red-400"
                    : task.priority === "medium"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-zinc-500/20 text-zinc-400"
                }`}
              >
                {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Média" : "Baixa"}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => onDelete(task.id)}
          className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
