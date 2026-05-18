import type { CortexRecord, CortexRecordType } from "@/lib/types";

export function sanitizeFileName(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function getObsidianPath(record: CortexRecord): string {
  const safe = sanitizeFileName(record.title);
  if (!safe) return "Inbox/untitled.md";

  const date = record.createdAt?.split("T")[0] ?? "";
  const dateStr = date.replace(/-/g, "-");

  const pathMap: Record<CortexRecordType, string> = {
    task: `Tarefas/${safe}.md`,
    idea: `Ideias/${safe}.md`,
    expense: dateStr ? `Financeiro/${dateStr}-${safe}.md` : `Financeiro/${safe}.md`,
    focus_request: dateStr ? `Daily/${dateStr}-focus.md` : `Daily/focus.md`,
    daily_review: dateStr ? `Daily/${dateStr}.md` : `Daily/review.md`,
    project_note: `ProjectNotes/${safe}.md`,
    unknown: `Inbox/${safe}.md`,
  };

  return pathMap[record.type] ?? `Inbox/${safe}.md`;
}

export const VAULT_STRUCTURE = `vault/
├── Daily/
├── Financeiro/
├── Ideias/
├── Inbox/
├── ProjectNotes/
├── Tarefas/
├── Dashboard.md
├── Foco.md`;

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
