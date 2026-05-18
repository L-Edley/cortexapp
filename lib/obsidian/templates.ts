import type { CortexRecord } from "@/lib/types";

export function taskTemplate(record: CortexRecord): string {
  const due = record.dueDate ? `dueDate: ${record.dueDate}\n` : "";
  const proj = record.project ? `project: ${record.project}\n` : "";

  return `---
type: task
status: ${record.status}
priority: ${record.priority}
${proj}${due}createdAt: ${record.createdAt}
source: cortex
assistant: Aion
---

# ${record.title}

## Descrição
${record.description || "Sem descrição."}

## Próxima ação
${record.nextAction || "—"}

## Links
- [[Tarefas]]
${record.project ? `- [[${record.project}]]` : ""}
`;
}

export function ideaTemplate(record: CortexRecord): string {
  const cat = record.category ? `category: ${record.category}\n` : "";
  const proj = record.project ? `project: ${record.project}\n` : "";

  return `---
type: idea
status: quarantine
${cat}${proj}createdAt: ${record.createdAt}
source: cortex
assistant: Aion
---

# ${record.title}

## Descrição
${record.description || "Ideia capturada pelo Aion."}

## Próxima ação
${record.nextAction || "Manter em quarentena até a revisão semanal."}

## Links
- [[Ideias]]
${record.project ? `- [[${record.project}]]` : ""}
`;
}

export function expenseTemplate(record: CortexRecord): string {
  const cat = record.category ? `category: ${record.category}\n` : "";
  const amount = record.amount ?? 0;
  const spentAt = record.createdAt;

  return `---
type: expense
amount: ${amount}
${cat}spentAt: ${spentAt}
createdAt: ${record.createdAt}
source: cortex
assistant: Aion
---

# ${record.title} — R$${amount.toFixed(2)}

## Descrição
${record.description || "Gasto registrado."}

## Próxima ação
${record.nextAction || "Verificar impacto no total do dia."}

## Links
- [[Financeiro]]
- [[Daily/${spentAt.split("T")[0]}]]
`;
}

export function focusTemplate(record: CortexRecord): string {
  const date = record.createdAt?.split("T")[0] ?? "";

  return `---
type: focus_request
priority: ${record.priority}
createdAt: ${record.createdAt}
source: cortex
assistant: Aion
---

# ${record.title}

## Situação
O usuário pediu ajuda para sair da procrastinação ou confusão mental.

## Ação de 5 minutos
Abrir o projeto principal e executar apenas o primeiro passo visível.

## Links
- [[Foco]]
${date ? `- [[Daily/${date}]]` : ""}
`;
}

export function dailyReviewTemplate(record: CortexRecord): string {
  const date = record.createdAt?.split("T")[0] ?? "";

  return `---
type: daily_review
createdAt: ${record.createdAt}
source: cortex
assistant: Aion
---

# Daily — ${date}

## Registros do Cortex
${record.description || "Nenhum resumo registrado."}

## Revisão
${record.nextAction || "—"}
`;
}

export function projectNoteTemplate(record: CortexRecord): string {
  const proj = record.project ? `project: ${record.project}\n` : "";

  return `---
type: project_note
priority: ${record.priority}
${proj}createdAt: ${record.createdAt}
source: cortex
assistant: Aion
---

# ${record.title}

## Descrição
${record.description || "Nota de projeto."}

## Próxima ação
${record.nextAction || "—"}

## Links
- [[ProjectNotes]]
${record.project ? `- [[${record.project}]]` : ""}
`;
}

export function unknownTemplate(record: CortexRecord): string {
  return `---
type: unknown
createdAt: ${record.createdAt}
source: cortex
assistant: Aion
---

# ${record.title}

## Conteúdo
${record.description || record.title}

## Próxima ação
${record.nextAction || "Classificar manualmente."}

## Links
- [[Inbox]]
`;
}

export const TEMPLATES: Record<string, (r: CortexRecord) => string> = {
  task: taskTemplate,
  idea: ideaTemplate,
  expense: expenseTemplate,
  focus_request: focusTemplate,
  daily_review: dailyReviewTemplate,
  project_note: projectNoteTemplate,
  unknown: unknownTemplate,
};
