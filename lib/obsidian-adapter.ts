// lib/obsidian-adapter.ts
// Base de integração com Obsidian para o Cortex/Aion.
// Fornece criação, leitura e escrita de notas Markdown com frontmatter YAML.
// Quando o Obsidian não está disponível, as funções retornam false/null
// e o sistema continua funcionando apenas com localStorage.

import type { CortexRecord, CortexRecordType } from "@/lib/types";
import { getObsidianPath } from "@/lib/obsidian/paths";

export type ObsidianNoteType =
  | "gasto"
  | "receita"
  | "tarefa"
  | "habito"
  | "ideia"
  | "daily"
  | "projeto"
  | "entrada_livre";

export type ObsidianFrontmatter = {
  id: string;
  type: ObsidianNoteType;
  title: string;
  status?: string;
  priority?: string;
  amount?: number | null;
  category?: string | null;
  dueDate?: string | null;
  project?: string | null;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  source?: string;
};

function isServer(): boolean {
  return typeof window === "undefined";
}

function hasTauri(): boolean {
  return !isServer() && !!(window as Record<string, unknown>).__TAURI__;
}

function hasRestUrl(): boolean {
  return (
    !!process.env.OBSIDIAN_REST_URL ||
    !!process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL
  );
}

export function isObsidianAvailable(): boolean {
  // 1. Ambiente Tauri: acesso direto ao sistema de arquivos
  if (hasTauri()) return true;
  // 2. Obsidian Local REST API configurado (via .env)
  if (hasRestUrl()) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Geração de frontmatter YAML
// ---------------------------------------------------------------------------

function encodeYamlValue(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "true" : "false";
  if (Array.isArray(val)) {
    return `[${val.map((v) => `"${String(v)}"`).join(", ")}]`;
  }
  const s = String(val);
  if (/[:\n#\[\]{},"']/.test(s) || s === "" || /^\s/.test(s) || /\s$/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

export function buildFrontmatter(data: ObsidianFrontmatter): string {
  const lines: string[] = ["---"];
  const fields: Array<keyof ObsidianFrontmatter> = [
    "id",
    "type",
    "title",
    "status",
    "priority",
    "amount",
    "category",
    "dueDate",
    "project",
    "createdAt",
    "updatedAt",
    "tags",
    "source",
  ];

  for (const key of fields) {
    const value = data[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    lines.push(`${key}: ${encodeYamlValue(value)}`);
  }

  lines.push("---");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Parsing de frontmatter YAML (apenas campos simples, sem aninhamento)
// ---------------------------------------------------------------------------

export function parseFrontmatter(
  markdown: string
): { frontmatter: ObsidianFrontmatter; body: string } | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const raw = match[1];
  const body = (match[2] ?? "").trim();

  const parsed: Record<string, unknown> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim() as keyof ObsidianFrontmatter;
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    // Parse typed values
    if (value === "null" || value === "~") {
      value = null;
    } else if (value === "true") {
      value = true;
    } else if (value === "false") {
      value = false;
    } else if (/^\d+(\.\d+)?$/.test(String(value))) {
      value = Number(value);
    } else if (
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

    parsed[key] = value;
  }

  // Validate required fields
  if (
    typeof parsed.id !== "string" ||
    typeof parsed.type !== "string" ||
    typeof parsed.title !== "string" ||
    typeof parsed.createdAt !== "string"
  ) {
    return null;
  }

  return {
    frontmatter: parsed as unknown as ObsidianFrontmatter,
    body,
  };
}

// ---------------------------------------------------------------------------
// Criação de nota Markdown completa
// ---------------------------------------------------------------------------

export function createMarkdownNote(
  data: ObsidianFrontmatter,
  body?: string
): string {
  const frontmatter = buildFrontmatter(data);

  const defaultBody = `# ${data.title}

Registro criado pelo Cortex/Aion.

## Observações

*Edite este espaço livremente. O frontmatter YAML acima será preservado nas sincronizações futuras.*
`;

  return frontmatter + "\n" + (body ?? defaultBody);
}

// ---------------------------------------------------------------------------
// Mapeamento de tipos para pastas do vault
// ---------------------------------------------------------------------------

const NOTE_TYPE_TO_FOLDER: Record<string, string> = {
  gasto: "Financeiro",
  receita: "Financeiro",
  tarefa: "Tarefas",
  habito: "Hábitos",
  ideia: "Ideias",
  daily: "Daily",
  projeto: "Projetos",
  entrada_livre: "00_Inbox",
};

export function getFolderByRecordType(type: ObsidianNoteType): string {
  return NOTE_TYPE_TO_FOLDER[type] ?? "00_Inbox";
}

// ---------------------------------------------------------------------------
// Conversão de CortexRecord para nota Obsidian
// ---------------------------------------------------------------------------

function cortexTypeToNoteType(type: CortexRecordType): ObsidianNoteType {
  const map: Partial<Record<CortexRecordType, ObsidianNoteType>> = {
    task: "tarefa",
    expense: "gasto",
    idea: "ideia",
    project_note: "projeto",
    daily_review: "daily",
    focus_request: "tarefa",
    unknown: "entrada_livre",
  };
  return map[type] ?? "entrada_livre";
}

function escapeYaml(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  const s = String(val);
  if (
    /[:\n#\[\]{},"']/.test(s) || s === "" || /^\s/.test(s) || /\s$/.test(s)
  ) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

function buildNoteFrontmatter(record: CortexRecord): string {
  const tipo = cortexTypeToNoteType(record.type);
  const date = record.createdAt.split("T")[0];
  const lines: string[] = ["---"];

  lines.push(`id: ${escapeYaml(record.id)}`);
  lines.push(`tipo: ${tipo}`);
  lines.push(`data: ${escapeYaml(date)}`);
  lines.push("origem: cortex");
  lines.push(`tags: [${buildTags(record, tipo).join(", ")}]`);
  lines.push("sync_status: pending");
  lines.push(`created_at: ${escapeYaml(record.createdAt)}`);
  lines.push(`updated_at: ${escapeYaml(record.updatedAt ?? record.createdAt)}`);
  lines.push("aion_processed: false");
  lines.push("aion_version: null");

  if (record.priority) {
    const p =
      record.priority === "high"
        ? "alta"
        : record.priority === "medium"
          ? "media"
          : "baixa";
    lines.push(`prioridade: ${p}`);
  }

  if (record.status) {
    const s = record.status === "done" ? "concluida" : record.status;
    lines.push(`status: ${s}`);
  }

  lines.push(`descricao: ${escapeYaml(record.description ?? record.title)}`);

  switch (tipo) {
    case "gasto":
      lines.push(`valor: ${record.amount ?? 0}`);
      lines.push(`categoria: ${escapeYaml(record.category ?? "geral")}`);
      lines.push("forma_pagamento: null");
      lines.push("parcela: null");
      if (record.project) lines.push(`projeto: ${escapeYaml(record.project)}`);
      break;
    case "receita":
      lines.push(`valor: ${record.amount ?? 0}`);
      lines.push(`categoria: ${escapeYaml(record.category ?? "salario")}`);
      lines.push("fonte: null");
      lines.push("recorrente: false");
      if (record.project) lines.push(`projeto: ${escapeYaml(record.project)}`);
      break;
    case "tarefa":
      if (record.dueDate) lines.push(`deadline: ${escapeYaml(record.dueDate)}`);
      if (record.project) lines.push(`projeto: ${escapeYaml(record.project)}`);
      if (record.category)
        lines.push(`categoria: ${escapeYaml(record.category)}`);
      break;
    case "habito":
      lines.push(`habito: ${escapeYaml(record.title)}`);
      lines.push("concluido: false");
      lines.push(`categoria: ${escapeYaml(record.category ?? "saude")}`);
      lines.push("recorrencia: diario");
      break;
    case "ideia":
      lines.push("estado: quarentena");
      if (record.project) lines.push(`projeto: ${escapeYaml(record.project)}`);
      if (record.category) lines.push(`area: ${escapeYaml(record.category)}`);
      break;
    case "projeto":
      lines.push("status: idealizacao");
      if (record.dueDate) lines.push(`deadline: ${escapeYaml(record.dueDate)}`);
      if (record.category) lines.push(`area: ${escapeYaml(record.category)}`);
      break;
    case "daily":
      lines.push("humor: null");
      lines.push("energia: null");
      lines.push("foco: null");
      lines.push("horas_trabalhadas: null");
      break;
    case "entrada_livre":
      lines.push("tipo_registro: livre");
      lines.push("classificacao_sugerida: null");
      break;
  }

  lines.push("---");
  return lines.join("\n") + "\n";
}

function buildTags(record: CortexRecord, tipo: ObsidianNoteType): string[] {
  const tags: string[] = [tipo];
  if (record.type === "expense") tags.push("financeiro");
  if (record.type === "idea") tags.push("quarentena");
  if (record.project) tags.push("projeto");
  if (record.category) tags.push(record.category);
  return tags;
}

function buildNoteBody(record: CortexRecord): string {
  const tipo = cortexTypeToNoteType(record.type);

  const sections: string[] = [`# ${record.title}`, ""];

  if (record.description && record.description !== record.title) {
    sections.push("## Descrição");
    sections.push(record.description);
    sections.push("");
  }

  if (record.nextAction) {
    sections.push("## Próxima ação");
    sections.push(record.nextAction);
    sections.push("");
  }

  if (record.rawInput) {
    sections.push("## Entrada original");
    sections.push(`\`\`\`\n${record.rawInput}\n\`\`\``);
    sections.push("");
  }

  if (tipo === "tarefa") {
    sections.push("## Status");
    sections.push(
      record.status === "done" ? "- [x] Concluída" : "- [ ] Pendente"
    );
    sections.push("");
    if (record.dueDate) {
      sections.push(`Prazo: ${record.dueDate}`);
      sections.push("");
    }
  }

  if (tipo === "gasto" && record.amount) {
    sections.push(`**Valor:** R$ ${record.amount.toFixed(2)}`);
    sections.push("");
    if (record.category) {
      sections.push(`**Categoria:** ${record.category}`);
      sections.push("");
    }
  }

  if (record.project) {
    sections.push("## Projeto relacionado");
    sections.push(`- [[${record.project}]]`);
    sections.push("");
  }

  sections.push("---");
  sections.push(`*Registro criado pelo Cortex/Aion em ${record.createdAt}*`);

  return sections.join("\n");
}

export function recordToObsidianNote(record: CortexRecord): string {
  const frontmatter = buildNoteFrontmatter(record);
  const body = buildNoteBody(record);
  return frontmatter + "\n" + body;
}

export async function saveRecordToObsidian(
  record: CortexRecord
): Promise<boolean> {
  if (!isObsidianAvailable()) return false;

  try {
    const content = recordToObsidianNote(record);
    const path = getObsidianPath(record);
    return await writeObsidianNote(path, content);
  } catch {
    return false;
  }
}

export async function updateRecordInObsidian(
  record: CortexRecord
): Promise<boolean> {
  if (!isObsidianAvailable()) return false;

  try {
    const content = recordToObsidianNote(record);
    const path = getObsidianPath(record);
    return await writeObsidianNote(path, content);
  } catch {
    return false;
  }
}

export async function deleteRecordFromObsidian(
  record: CortexRecord
): Promise<boolean> {
  if (!isObsidianAvailable()) return false;

  try {
    const path = getObsidianPath(record);
    const encoded = encodeURIComponent(path);
    const res = await fetch(`/api/obsidian/vault/${encoded}`, {
      method: "DELETE",
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Escrita e leitura via proxy server-side
// ---------------------------------------------------------------------------

export async function writeObsidianNote(
  path: string,
  content: string
): Promise<boolean> {
  // Tauri: filesystem API (futuro)
  if (hasTauri()) {
    console.warn("[obsidian] Tauri write not implemented yet");
    return false;
  }

  // Proxy server-side: a API key fica no servidor, nunca no bundle
  try {
    const encoded = encodeURIComponent(path);
    const res = await fetch(`/api/obsidian/vault/${encoded}`, {
      method: "PUT",
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
      body: content,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function readObsidianNote(
  path: string
): Promise<string | null> {
  // Tauri: filesystem API (futuro)
  if (hasTauri()) {
    console.warn("[obsidian] Tauri read not implemented yet");
    return null;
  }

  // Proxy server-side
  try {
    const encoded = encodeURIComponent(path);
    const res = await fetch(`/api/obsidian/vault/${encoded}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
