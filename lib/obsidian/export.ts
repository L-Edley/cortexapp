import type { CortexRecord } from "@/lib/types";
import { recordToMarkdown, generateDashboardMarkdown, generateDailyNoteMarkdown } from "./markdown";
import { sanitizeFileName } from "./paths";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function downloadBlob(content: string, filename: string, mime = "text/markdown"): void {
  if (!isClient()) return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRecordAsMarkdown(record: CortexRecord): void {
  const md = recordToMarkdown(record);
  const safe = sanitizeFileName(record.title).slice(0, 80) || "untitled";
  downloadBlob(md, `${safe}.md`);
}

export function exportAllRecordsAsMarkdown(records: CortexRecord[]): void {
  const parts: string[] = [];

  for (const r of records) {
    const md = recordToMarkdown(r);
    parts.push(md);
    parts.push("\n---\n");
  }

  const combined = parts.join("\n");
  downloadBlob(
    combined,
    `Cortex_Export_${new Date().toISOString().split("T")[0]}.md`
  );
}

export function exportDashboardMarkdown(records: CortexRecord[]): void {
  const md = generateDashboardMarkdown(records);
  downloadBlob(md, "Dashboard.md");
}

export function exportDailyNoteMarkdown(date: string, records: CortexRecord[]): void {
  const md = generateDailyNoteMarkdown(date, records);
  downloadBlob(md, `Daily-${date}.md`);
}

export async function copyMarkdownToClipboard(markdown: string): Promise<boolean> {
  if (!isClient()) return false;
  try {
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = markdown;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  }
}

export function generateVaultReadme(): string {
  return `# Cortex Vault

Este vault foi gerado pelo Cortex — Motor de organização pessoal, financeira e estratégica.

## Estrutura

\`\`\`
vault/
├── Daily/          — Notas diárias e pedidos de foco
├── Financeiro/     — Gastos e despesas
├── Ideias/         — Ideias em quarentena
├── Inbox/          — Registros não classificados
├── ProjectNotes/   — Notas de projetos
├── Tarefas/        — Tarefas pendentes e concluídas
├── Dashboard.md    — Visão geral com Dataview
├── Foco.md         — Link para pedidos de foco
\`\`\`

## Plugins recomendados

- **Dataview** — Consultas nas notas
- **Tasks** — Gerenciamento de tarefas
- **Periodic Notes** — Notas diárias automáticas
- **Templater** — Templates avançados
- **Obsidian Git** — Sincronização futura

## Próximo passo

Integração direta entre Cortex e este vault.
`;
}

export async function copyVaultReadmeToClipboard(): Promise<boolean> {
  return copyMarkdownToClipboard(generateVaultReadme());
}
