/**
 * @deprecated Use lib/obsidian-adapter.ts — a source oficial para operações Obsidian.
 * vaultStorage agora é apenas uma camada de compatibilidade. Nenhuma lógica nova deve ser
 * adicionada aqui. Prefira importar saveRecordToObsidian / updateRecordInObsidian /
 * deleteRecordFromObsidian de @/lib/obsidian-adapter.
 */

import type { CortexRecord } from "@/lib/types";
import {
  saveRecordToObsidian,
  updateRecordInObsidian,
  deleteRecordFromObsidian,
} from "@/lib/obsidian-adapter";

export type SyncResult = {
  savedLocal: boolean;
  savedObsidian: boolean;
  error?: string;
};

export type BulkSyncResult = {
  totalAttempted: number;
  successCount: number;
  failCount: number;
  errors: { path: string; error: string }[];
};

/** @deprecated Use saveRecordToObsidian de @/lib/obsidian-adapter */
export async function saveRecord(record: CortexRecord): Promise<SyncResult> {
  const ok = await saveRecordToObsidian(record);
  return { savedLocal: false, savedObsidian: ok };
}

/** @deprecated Use saveRecordToObsidian (adapter sobrescreve o arquivo existente) */
export async function updateRecord(_id: string, record: CortexRecord): Promise<SyncResult> {
  const ok = await updateRecordInObsidian(record);
  return { savedLocal: false, savedObsidian: ok };
}

/** @deprecated Use deleteRecordFromObsidian de @/lib/obsidian-adapter */
export async function deleteRecord(_id: string, record: CortexRecord): Promise<SyncResult> {
  const ok = await deleteRecordFromObsidian(record);
  return { savedLocal: false, savedObsidian: ok };
}

/** @deprecated Mantido para compatibilidade com SettingsView; prefira syncObsidianToAion futuramente. */
export async function syncLocalRecordsToObsidian(): Promise<BulkSyncResult> {
  return {
    totalAttempted: 0,
    successCount: 0,
    failCount: 0,
    errors: [{ path: "deprecated", error: "vaultStorage.syncLocalRecordsToObsidian está deprecated. Use syncObsidianToAion." }],
  };
}

export type StorageProvider = "localStorage" | "localStorage + Obsidian";
