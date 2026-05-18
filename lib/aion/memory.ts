import type { CortexRecord } from "@/lib/types";

export type ConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type UserContextSummary = {
  pendingTasks: { title: string; priority: string }[];
  recentExpenses: { title: string; amount: number }[];
  recentIdeas: { title: string }[];
  lastAction: string | null;
  taskCount: number;
  ideaCount: number;
  expenseCount: number;
  totalSpentToday: number;
  focusRequestCount: number;
};

export class ConversationMemory {
  private messages: ConversationMessage[] = [];
  private maxMessages = 20;

  addMessage(msg: ConversationMessage): void {
    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  getHistory(): ConversationMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }

  formatRecentRecords(records: CortexRecord[]): string {
    if (!records || records.length === 0) return "";

    const tasks = records
      .filter((r) => r.type === "task" && r.status === "pending")
      .slice(0, 5);
    const latest = records.slice(0, 3);

    const parts: string[] = [];
    if (tasks.length > 0) {
      parts.push(
        `Tarefas pendentes: ${tasks.map((t) => `"${t.title}"`).join(", ")}`
      );
    }
    if (latest.length > 0) {
      parts.push(
        `Últimos registros: ${latest.map((r) => `[${r.type}] ${r.title}`).join(" | ")}`
      );
    }

    return parts.length > 0 ? parts.join("\n") : "";
  }

  formatConversationContext(): string {
    const history = this.getHistory();
    if (history.length === 0) return "";

    const lastFew = history.slice(-6);
    return lastFew
      .map((m) => `${m.role === "user" ? "Usuário" : "Aion"}: ${m.content}`)
      .join("\n");
  }

  summarizeUserContext(records: CortexRecord[]): UserContextSummary {
    const pendingTasks = records
      .filter((r) => r.type === "task" && r.status === "pending")
      .slice(0, 5)
      .map((r) => ({ title: r.title, priority: r.priority }));

    const recentExpenses = records
      .filter((r) => r.type === "expense")
      .slice(0, 3)
      .map((r) => ({ title: r.title, amount: r.amount || 0 }));

    const recentIdeas = records
      .filter((r) => r.type === "idea")
      .slice(0, 3)
      .map((r) => ({ title: r.title }));

    const sorted = [...records].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const todayStr = new Date().toISOString().split("T")[0];

    return {
      pendingTasks,
      recentExpenses,
      recentIdeas,
      lastAction: sorted.length > 0 ? sorted[0].title : null,
      taskCount: records.filter((r) => r.type === "task").length,
      ideaCount: records.filter((r) => r.type === "idea").length,
      expenseCount: records.filter((r) => r.type === "expense").length,
      totalSpentToday: records
        .filter(
          (r) =>
            r.type === "expense" && r.createdAt.startsWith(todayStr)
        )
        .reduce((sum, r) => sum + (r.amount || 0), 0),
      focusRequestCount: records.filter(
        (r) => r.type === "focus_request"
      ).length,
    };
  }

  formatUserContextSummary(summary: UserContextSummary): string {
    const parts: string[] = [];

    if (summary.pendingTasks.length > 0) {
      parts.push(
        `Tarefas pendentes: ${summary.pendingTasks.map((t) => `"${t.title}" (${t.priority})`).join(", ")}`
      );
    } else {
      parts.push("Nenhuma tarefa pendente.");
    }

    if (summary.recentExpenses.length > 0) {
      const total = summary.recentExpenses.reduce(
        (s, e) => s + e.amount,
        0
      );
      parts.push(
        `Gastos recentes: ${summary.recentExpenses.map((e) => `R$ ${e.amount.toFixed(2)}`).join(" + ")} = R$ ${total.toFixed(2)}`
      );
    }

    if (summary.recentIdeas.length > 0) {
      parts.push(
        `Ideias recentes: ${summary.recentIdeas.map((i) => `"${i.title}"`).join(", ")}`
      );
    }

    if (summary.lastAction) {
      parts.push(`Último registro: "${summary.lastAction}"`);
    }

    if (summary.totalSpentToday > 0) {
      parts.push(
        `Gastos hoje: R$ ${summary.totalSpentToday.toFixed(2)}`
      );
    }

    parts.push(
      `Total: ${summary.taskCount} tarefas, ${summary.ideaCount} ideias, ${summary.expenseCount} gastos`
    );

    if (
      summary.ideaCount > summary.taskCount * 2 &&
      summary.ideaCount > 3
    ) {
      parts.push(
        "Observação: muitas ideias registradas, poucas tarefas — talvez seja hora de executar uma ideia."
      );
    }

    return parts.join("\n");
  }
}

let _memory: ConversationMemory | null = null;

export function getMemory(): ConversationMemory {
  if (!_memory) {
    _memory = new ConversationMemory();
  }
  return _memory;
}

export function resetMemory(): void {
  _memory = null;
}
