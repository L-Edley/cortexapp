import type { CortexRecord, CortexRecordType } from "./types";

const STORAGE_KEY = "cortex_records";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function getRecords(): CortexRecord[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CortexRecord[];
  } catch {
    return [];
  }
}

export function saveRecord(record: CortexRecord): void {
  if (!isClient()) return;
  const records = getRecords();
  records.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function updateRecord(id: string, patch: Partial<CortexRecord>): void {
  if (!isClient()) return;
  const records = getRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return;
  records[index] = { ...records[index], ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function deleteRecord(id: string): void {
  if (!isClient()) return;
  const records = getRecords().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function clearRecords(): void {
  if (!isClient()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getRecordsByType(type: CortexRecordType): CortexRecord[] {
  return getRecords().filter((r) => r.type === type);
}

export function getRecordsById(id: string): CortexRecord | undefined {
  return getRecords().find((r) => r.id === id);
}

export function getTodaysRecords(): CortexRecord[] {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  return getRecords().filter((r) => r.createdAt.startsWith(todayStr));
}

export function getSpentToday(): number {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  return getRecords()
    .filter((r) => r.type === "expense" && r.createdAt.startsWith(todayStr))
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
}

export function getTotalSpent(): number {
  return getRecords()
    .filter((r) => r.type === "expense")
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
}

export function getTopPendingTasks(limit = 3): CortexRecord[] {
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return getRecords()
    .filter((r) => r.type === "task" && r.status === "pending")
    .sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99))
    .slice(0, limit);
}

export function getLastFocusRequest(): CortexRecord | undefined {
  return getRecords()
    .filter((r) => r.type === "focus_request")
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
}

export function getLatestEntries(limit = 5): CortexRecord[] {
  return getRecords().slice(0, limit);
}
