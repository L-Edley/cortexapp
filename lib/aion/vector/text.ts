import type { CortexRecord } from "@/lib/types";
import type { SyncRecord } from "@/lib/aion/sync/types";
import type { AionBrainItem } from "@/lib/aion/brain/types";

type IndexableRecord = CortexRecord | SyncRecord;

function isCortexRecord(r: IndexableRecord): r is CortexRecord {
  return "nextAction" in r;
}

function isSyncRecord(r: IndexableRecord): r is SyncRecord {
  return "tags" in r && Array.isArray(r.tags) && "sync_status" in r;
}

function getTags(r: IndexableRecord): string[] {
  if (isCortexRecord(r)) return [];
  if (isSyncRecord(r)) return r.tags;
  return [];
}

function getContent(r: IndexableRecord): string | undefined {
  if (isSyncRecord(r)) return r.content;
  return undefined;
}

function getAmount(r: IndexableRecord): number | undefined {
  if (isSyncRecord(r)) return r.amount;
  if (isCortexRecord(r)) return r.amount ?? undefined;
  return undefined;
}

function getCategory(r: IndexableRecord): string | undefined {
  if (isSyncRecord(r)) return r.category;
  if (isCortexRecord(r)) return r.category ?? undefined;
  return undefined;
}

function getDueDate(r: IndexableRecord): string | undefined {
  if (isSyncRecord(r)) return r.dueDate;
  if (isCortexRecord(r)) return r.dueDate ?? undefined;
  return undefined;
}

function getPriority(r: IndexableRecord): string {
  if (isSyncRecord(r)) return r.priority ?? "";
  if (isCortexRecord(r)) return r.priority;
  return "";
}

export function buildVectorTextFromRecord(record: IndexableRecord): string {
  const parts: string[] = [];

  parts.push(`${record.type}: ${record.title}.`);

  if (record.description) {
    parts.push(`${record.description}`);
  }

  const content = getContent(record);
  if (content) {
    parts.push(`${content}`);
  }

  const category = getCategory(record);
  if (category) {
    parts.push(`Categoria: ${category}.`);
  }

  const amount = getAmount(record);
  if (amount !== undefined) {
    parts.push(`Valor: ${amount}.`);
  }

  const dueDate = getDueDate(record);
  if (dueDate) {
    parts.push(`Prazo: ${dueDate}.`);
  }

  const tags = getTags(record);
  if (tags.length > 0) {
    parts.push(`Tags: ${tags.join(", ")}.`);
  }

  const priority = getPriority(record);
  if (priority) {
    parts.push(`Prioridade: ${priority}.`);
  }

  if ("status" in record && record.status) {
    parts.push(`Status: ${record.status}.`);
  }

  return parts.join(" ");
}

export function buildVectorTextFromBrainItem(item: AionBrainItem): string {
  const parts: string[] = [];

  parts.push(`${item.type}: ${item.title}.`);

  if (item.content) {
    parts.push(item.content);
  }

  if (item.tags.length > 0) {
    parts.push(`Tags: ${item.tags.join(", ")}.`);
  }

  return parts.join(" ");
}
