import type { SyncRecord, SyncRecordType, SyncRecordSource, SyncStatus } from "./types";

const TYPE_MAP: Record<string, SyncRecordType> = {
  gasto: "finance",
  receita: "finance",
  tarefa: "task",
  habito: "habit",
  ideia: "idea",
  projeto: "project",
  daily: "daily",
  conhecimento: "knowledge",
  entrada_livre: "note",
  task: "task",
  expense: "finance",
  idea: "idea",
  habit: "habit",
  daily_review: "daily",
  project_note: "project",
  note: "note",
  knowledge: "knowledge",
  finance: "finance",
  project: "project",
};

function alias(val: unknown, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof val === "object" && val !== null) {
      const v = (val as Record<string, unknown>)[key];
      if (v !== undefined && v !== null) return String(v);
    }
  }
  return undefined;
}

function computeId(path: string, frontmatter: Record<string, unknown>): string {
  if (frontmatter.id && typeof frontmatter.id === "string" && frontmatter.id.length > 0) {
    return frontmatter.id;
  }
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function computeTitle(frontmatter: Record<string, unknown>): string {
  return (
    alias(frontmatter, "title", "titulo", "nome") ?? "Registro sem título"
  );
}

function parseTags(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags;
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw === "string") {
    return raw
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, ""))
      .filter(Boolean);
  }
  return [];
}

function parseNum(val: unknown): number | undefined {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(",", "."));
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

function parseDate(val: unknown): string | undefined {
  if (typeof val === "string" && val.length > 0) return val;
  return undefined;
}

export function normalizeObsidianNoteToRecord(
  markdown: string,
  path?: string
): SyncRecord {
  const rawFields: Record<string, unknown> = {};
  let body = markdown;

  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    body = (fmMatch[2] ?? "").trim();
    for (const line of fmMatch[1].split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex === -1) continue;
      const key = trimmed.slice(0, colonIndex).trim();
      let value: unknown = trimmed.slice(colonIndex + 1).trim();

      if (value === "null" || value === "~") value = null;
      else if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (/^\d+(\.\d+)?$/.test(String(value))) value = Number(value);
      else if (
        String(value).startsWith("[") &&
        String(value).endsWith("]")
      ) {
        value = String(value)
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, ""))
          .filter(Boolean);
      } else if (
        (String(value).startsWith('"') && String(value).endsWith('"')) ||
        (String(value).startsWith("'") && String(value).endsWith("'"))
      ) {
        value = String(value).slice(1, -1);
      }

      rawFields[key] = value;
    }
  }

  const id = computeId(path ?? "", rawFields);
  const title = computeTitle(rawFields);
  const tags = parseTags(rawFields);
  const rawType = alias(rawFields, "type", "tipo") ?? "note";

  const extraKeys = new Set([
    "id", "type", "tipo", "title", "titulo", "nome",
    "descricao", "description", "descrição",
    "valor", "amount", "categoria", "category",
    "data", "date", "tags", "source", "origem",
    "sync_status", "aion_processed", "aion_version",
    "created_at", "createdAt", "updated_at", "updatedAt",
    "last_synced_at", "prioridade", "priority",
    "status", "deadline", "dueDate",
  ]);

  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    if (!extraKeys.has(k)) {
      raw[k] = v;
    }
  }

  const record: SyncRecord = {
    id,
    type: TYPE_MAP[rawType] ?? "note",
    title,
    description: alias(rawFields, "description", "descricao", "descrição"),
    content: body.length > 0 ? body : undefined,
    amount: parseNum(alias(rawFields, "amount", "valor")),
    category: alias(rawFields, "category", "categoria"),
    priority: (alias(rawFields, "priority", "prioridade") as SyncRecord["priority"]) ?? undefined,
    status: alias(rawFields, "status"),
    dueDate: parseDate(alias(rawFields, "dueDate", "deadline")),
    date: parseDate(alias(rawFields, "date", "data")),
    tags,
    source: (alias(rawFields, "source", "origem") as SyncRecordSource) ?? "obsidian",
    sync_status: (alias(rawFields, "sync_status") as SyncStatus) ?? "pending",
    aion_processed:
      typeof rawFields.aion_processed === "boolean"
        ? rawFields.aion_processed
        : rawFields.aion_processed === "true"
          ? true
          : false,
    created_at:
      parseDate(alias(rawFields, "created_at", "createdAt")) ??
      new Date().toISOString(),
    updated_at:
      parseDate(alias(rawFields, "updated_at", "updatedAt")) ??
      new Date().toISOString(),
    raw: Object.keys(raw).length > 0 ? raw : undefined,
  };

  return record;
}
