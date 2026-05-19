/**
 * @deprecated Use recordToObsidianNote de lib/obsidian-adapter.ts.
 * Este módulo é mantido apenas para export.ts (download de arquivos .md).
 * Nenhuma lógica de escrita no vault deve usar recordToMarkdown.
 */

import type { CortexRecord } from "@/lib/types";
import { TEMPLATES } from "./templates";

/** @deprecated Use recordToObsidianNote de lib/obsidian-adapter.ts */
export function recordToMarkdown(record: CortexRecord): string {
  const fn = TEMPLATES[record.type];
  if (fn) return fn(record);
  return TEMPLATES.unknown(record);
}

export function generateDashboardMarkdown(records: CortexRecord[]): string {
  const pendingTasks = records.filter(
    (r) => r.type === "task" && r.status === "pending"
  );
  const expenses = records.filter((r) => r.type === "expense");
  const ideas = records.filter((r) => r.type === "idea" && r.status !== "archived");

  const taskRows = pendingTasks
    .map(
      (t) =>
        `| ${t.title} | ${t.priority} | ${t.dueDate ?? "—"} | ${t.project ?? "—"} |`
    )
    .join("\n");

  const expenseRows = expenses
    .slice(0, 20)
    .map(
      (e) =>
        `| R$ ${(e.amount ?? 0).toFixed(2)} | ${e.category ?? "—"} | ${
          e.createdAt?.split("T")[0] ?? "—"
        } |`
    )
    .join("\n");

  const ideaRows = ideas
    .map(
      (i) =>
        `| ${i.title} | ${i.category ?? "—"} | ${
          i.createdAt?.split("T")[0] ?? "—"
        } |`
    )
    .join("\n");

  const sections: string[] = [
    "# Dashboard Cortex",
    "",
    "## Tarefas pendentes",
    "",
    "```dataview",
    "TABLE priority, dueDate, project",
    'FROM "Tarefas"',
    'WHERE status = "pending"',
    "SORT dueDate ASC",
    "```",
    "",
  ];

  if (pendingTasks.length > 0) {
    sections.push(
      "### Resumo local",
      "",
      "| Título | Prioridade | Data | Projeto |",
      "| --- | --- | --- | --- |",
      taskRows,
      ""
    );
  }

  sections.push(
    "## Gastos recentes",
    "",
    "```dataview",
    "TABLE amount, category, spentAt",
    'FROM "Financeiro"',
    "SORT spentAt DESC",
    "LIMIT 20",
    "```",
    ""
  );

  if (expenses.length > 0) {
    sections.push(
      "### Resumo local",
      "",
      "| Valor | Categoria | Data |",
      "| --- | --- | --- |",
      expenseRows,
      ""
    );
  }

  sections.push(
    "## Ideias em quarentena",
    "",
    "```dataview",
    "TABLE category, createdAt",
    'FROM "Ideias"',
    'WHERE status = "quarantine"',
    "SORT createdAt DESC",
    "```",
    ""
  );

  if (ideas.length > 0) {
    sections.push(
      "### Resumo local",
      "",
      "| Título | Categoria | Data |",
      "| --- | --- | --- |",
      ideaRows,
      ""
    );
  }

  sections.push(
    "---",
    "",
    "_Gerado pelo Cortex em " +
      new Date().toISOString().split("T")[0] +
      "_"
  );

  return sections.join("\n");
}

export function generateDailyNoteMarkdown(
  date: string,
  records: CortexRecord[]
): string {
  const dayRecords = records.filter(
    (r) => r.createdAt?.startsWith(date)
  );
  const tasks = dayRecords.filter((r) => r.type === "task");
  const expenses = dayRecords.filter((r) => r.type === "expense");
  const ideas = dayRecords.filter((r) => r.type === "idea");
  const focusRequests = dayRecords.filter((r) => r.type === "focus_request");

  const sections: string[] = [
    `# Daily — ${date}`,
    "",
    "## Registros do Cortex",
    "",
    dayRecords.length === 0
      ? "_Nenhum registro neste dia._"
      : `Total: ${dayRecords.length} registro(s)`,
    "",
  ];

  if (tasks.length > 0) {
    sections.push(
      "### Tarefas do dia",
      "",
      ...tasks.map(
        (t) =>
          `- [${t.status === "done" ? "x" : " "}] **${t.title}** — ${t.priority}` +
          (t.project ? ` (${t.project})` : "")
      ),
      ""
    );
  }

  if (expenses.length > 0) {
    sections.push(
      "### Gastos do dia",
      "",
      ...expenses.map(
        (e) =>
          `- R$ ${(e.amount ?? 0).toFixed(2)} — ${e.title}` +
          (e.category ? ` _(${e.category})_` : "")
      ),
      ""
    );
  }

  if (ideas.length > 0) {
    sections.push(
      "### Ideias capturadas",
      "",
      ...ideas.map((i) => `- ${i.title}`),
      ""
    );
  }

  if (focusRequests.length > 0) {
    sections.push(
      "### Pedidos de foco",
      "",
      ...focusRequests.map((f) => `- ${f.nextAction || "Micro-ação de 5 min"}`),
      ""
    );
  }

  sections.push(
    "## Revisão",
    "",
    "<!-- Adicione sua revisão aqui -->",
    "",
    "## Próximo foco",
    "",
    "<!-- Defina seu próximo foco -->"
  );

  return sections.join("\n");
}
