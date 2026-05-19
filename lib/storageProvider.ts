import type { CortexRecord, CortexRecordType } from "./types";
import * as local from "./storage";
import * as firebase from "./firebase/records";
import {
  exportRecordToObsidian,
  exportUpdatedRecordToObsidian,
  deleteExportedRecordFromObsidian,
} from "@/lib/obsidian-adapter";
import {
  indexRecordInBackground,
  deleteVectorInBackground,
} from "@/lib/aion/vector/background";

// ============================================
// STORAGE PROVIDER — Zero-Cost Architecture
// localStorage (primário) + Cloud sync (futuro) + Obsidian (export)
// ============================================

export type StorageMode = "local" | "firebase" | "hybrid";

function obsidianExportEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED === "true";
}

function firebaseAvailable(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

function getMode(): StorageMode {
  if (typeof window === "undefined") return "local";
  const env = process.env.NEXT_PUBLIC_STORAGE_MODE;
  if (env === "firebase" || env === "hybrid") return env;
  const raw = localStorage.getItem("cortex_storage_mode");
  if (raw === "firebase" || raw === "hybrid") return raw;
  return "local";
}

function setMode(mode: StorageMode): void {
  localStorage.setItem("cortex_storage_mode", mode);
}

export async function saveRecord(record: CortexRecord): Promise<void> {
  local.saveRecord(record);
  const mode = getMode();
  if ((mode === "firebase" || mode === "hybrid") && firebaseAvailable()) {
    try {
      await firebase.saveRecord(record);
    } catch {
      // Firebase offline — keep local copy
    }
  }
  // Exportação opcional para Markdown no vault Obsidian
  if (obsidianExportEnabled()) {
    exportRecordToObsidian(record).catch(() => {});
  }
  indexRecordInBackground(record);
}

export async function updateRecord(
  id: string,
  patch: Partial<CortexRecord>
): Promise<void> {
  local.updateRecord(id, patch);
  const mode = getMode();
  if ((mode === "firebase" || mode === "hybrid") && firebaseAvailable()) {
    try {
      await firebase.updateRecord(id, patch);
    } catch {
      // offline
    }
  }
  // Exportação opcional de atualização para o vault
  const updated = { ...local.getRecordsById(id)!, ...patch };
  if (obsidianExportEnabled()) {
    exportUpdatedRecordToObsidian(updated).catch(() => {});
  }
  const patched = local.getRecordsById(id);
  if (patched) indexRecordInBackground(patched);
}

export async function deleteRecord(id: string): Promise<void> {
  local.deleteRecord(id);
  const mode = getMode();
  if ((mode === "firebase" || mode === "hybrid") && firebaseAvailable()) {
    try {
      await firebase.deleteRecord(id);
    } catch {
      // offline
    }
  }
  // Remoção opcional da nota no vault
  const record = local.getRecordsById(id);
  if (record && obsidianExportEnabled()) {
    deleteExportedRecordFromObsidian(record).catch(() => {});
  }
  deleteVectorInBackground(id);
}

export function getRecords(): CortexRecord[] {
  return local.getRecords();
}

export function getRecordsByType(type: CortexRecordType): CortexRecord[] {
  return local.getRecordsByType(type);
}

export function getRecordsById(id: string): CortexRecord | undefined {
  return local.getRecordsById(id);
}

export function getTodaysRecords(): CortexRecord[] {
  return local.getTodaysRecords();
}

export function getSpentToday(): number {
  return local.getSpentToday();
}

export function getTotalSpent(): number {
  return local.getTotalSpent();
}

export function getTopPendingTasks(limit = 3): CortexRecord[] {
  return local.getTopPendingTasks(limit);
}

export function getLatestEntries(limit = 5): CortexRecord[] {
  return local.getLatestEntries(limit);
}

export function getLastFocusRequest(): CortexRecord | undefined {
  return local.getLastFocusRequest();
}

export function clearRecords(): void {
  local.clearRecords();
  const mode = getMode();
  if ((mode === "firebase" || mode === "hybrid") && firebaseAvailable()) {
    firebase.clearRecords().catch(() => {});
  }
}

export function getCurrentMode(): StorageMode {
  return getMode();
}

export function setStorageMode(mode: StorageMode): void {
  setMode(mode);
}

export async function pullFromFirebase(): Promise<number> {
  if (!firebaseAvailable()) return 0;
  const remote = await firebase.getRecords();
  for (const record of remote) {
    const existing = local.getRecordsById(record.id);
    if (!existing) {
      local.saveRecord(record);
    } else if (new Date(record.createdAt) > new Date(existing.createdAt)) {
      local.updateRecord(record.id, record);
    }
  }
  return remote.length;
}

export async function migrateLocalToFirebase(): Promise<{
  success: number;
  failed: number;
}> {
  if (!firebaseAvailable()) {
    return { success: 0, failed: 0 };
  }
  const localRecords = local.getRecords();
  return firebase.migrateFromLocal(localRecords);
}

export function getStorageLabel(): string {
  const mode = getMode();
  const obsidian = obsidianExportEnabled() ? " + Exportação Obsidian" : "";
  switch (mode) {
    case "firebase":
      return "Firebase" + obsidian;
    case "hybrid":
      return "Firebase + localStorage" + obsidian;
    default:
      return "localStorage" + obsidian;
  }
}

export function getStorageLabelForIndicator(): string {
  const mode = getMode();
  const obsidian = obsidianExportEnabled() ? " + exportação Obsidian" : "";
  switch (mode) {
    case "firebase":
      return "Sincronizado com Firebase" + obsidian;
    case "hybrid":
      return "Sincronizado com Firebase + localStorage" + obsidian;
    default:
      return "Salvo no localStorage" + obsidian;
  }
}

// Subscription com carregamento imediato do cache local
export function subscribeRecords(
  callback: (records: CortexRecord[]) => void
): () => void {
  // Carregamento imediato
  const currentLocalRecords = local.getRecords();
  callback(currentLocalRecords);

  // Polling para mudanças no localStorage (reage a saves de outras tabs, etc.)
  const interval = setInterval(() => {
    callback(local.getRecords());
  }, 3000);

  return () => clearInterval(interval);
}

export function subscribeRecordsByType(
  type: CortexRecordType,
  callback: (records: CortexRecord[]) => void
): () => void {
  // Carregamento imediato
  const currentLocalRecords = local.getRecordsByType(type);
  callback(currentLocalRecords);

  // Polling
  const interval = setInterval(() => {
    callback(local.getRecordsByType(type));
  }, 3000);

  return () => clearInterval(interval);
}