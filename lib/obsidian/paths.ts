import type { CortexRecord, CortexRecordType } from "@/lib/types";

export function sanitizeFileName(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

const FOLDER_MAP: Record<CortexRecordType, string> = {
  task: "Tarefas",
  idea: "Ideias",
  expense: "Financeiro",
  focus_request: "Daily",
  daily_review: "Daily",
  project_note: "Projetos",
  unknown: "00_Inbox",
};

export function getObsidianPath(record: CortexRecord): string {
  const folder = FOLDER_MAP[record.type] ?? "00_Inbox";

  // Usa ID do registro como nome do arquivo (migração de {title}.md → {id}.md)
  // Fallback: se não houver ID, usa título sanitizado
  const fileName = record.id
    ? `${record.id}.md`
    : `${sanitizeFileName(record.title) || "untitled"}.md`;

  return `${folder}/${fileName}`;
}

export const VAULT_STRUCTURE = `vault/
├── 00_Inbox/
├── Daily/
├── Financeiro/
├── Hábitos/
├── Ideias/
├── Projetos/
├── Tarefas/
├── Dashboard.md`;

export const RECOMMENDED_PLUGINS = [
  "Dataview",
  "Tasks",
  "Periodic Notes",
  "Templater",
  "Obsidian Git",
];

export function copyVaultStructure(): string {
  return VAULT_STRUCTURE;
}
