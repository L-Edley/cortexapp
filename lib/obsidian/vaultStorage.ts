import type { CortexRecord } from "@/lib/types";
import {
  getRecords,
  updateRecord as updateLocal,
  getRecordsById,
  deleteRecord as deleteLocal,
} from "@/lib/storage";
import { recordToMarkdown } from "./markdown";
import { getObsidianPath } from "./paths";
import { writeVaultFile, deleteVaultFile, checkObsidianConnection, getObsidianConfig } from "./client";

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

async function shouldSyncToObsidian(): Promise<boolean> {
  const config = getObsidianConfig();
  if (!config.enabled) return false;
  try {
    return await checkObsidianConnection();
  } catch {
    return false;
  }
}

export async function saveRecord(record: CortexRecord): Promise<SyncResult> {
  const result: SyncResult = { savedLocal: false, savedObsidian: false };

  // Nota: storageProvider já salva em localStorage antes de chamar esta função.
  // vaultStorage é apenas camada de sync com Obsidian, não duplica escrita local.

  const sync = await shouldSyncToObsidian();
  if (!sync) return result;

  try {
    const md = recordToMarkdown(record);
    const vaultPath = getObsidianPath(record);
    await writeVaultFile(vaultPath, md);
    result.savedObsidian = true;
  } catch (e) {
    result.error = `Obsidian sync error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  return result;
}

export async function syncLocalRecordsToObsidian(): Promise<BulkSyncResult> {
  const config = getObsidianConfig();
  if (!config.enabled) {
    return {
      totalAttempted: 0,
      successCount: 0,
      failCount: 0,
      errors: [{ path: "config", error: "Obsidian REST não está habilitado" }],
    };
  }

  const online = await checkObsidianConnection();
  if (!online) {
    return {
      totalAttempted: 0,
      successCount: 0,
      failCount: 0,
      errors: [{ path: "connection", error: "Obsidian REST está offline" }],
    };
  }

  const records = getRecords();
  const result: BulkSyncResult = {
    totalAttempted: records.length,
    successCount: 0,
    failCount: 0,
    errors: [],
  };

  for (const record of records) {
    try {
      const md = recordToMarkdown(record);
      const vaultPath = getObsidianPath(record);
      await writeVaultFile(vaultPath, md);
      result.successCount++;
    } catch (e) {
      result.failCount++;
      const vaultPath = getObsidianPath(record);
      result.errors.push({
        path: vaultPath,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return result;
}

export async function deleteRecord(id: string): Promise<SyncResult> {
  const result: SyncResult = { savedLocal: false, savedObsidian: false };

  const record = getRecordsById(id);
  if (!record) {
    return { savedLocal: false, savedObsidian: false, error: "Registro não encontrado" };
  }

  try {
    deleteLocal(id);
    result.savedLocal = true;
  } catch (e) {
    return {
      savedLocal: false,
      savedObsidian: false,
      error: `localStorage error: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  const sync = await shouldSyncToObsidian();
  if (!sync) return result;

  try {
    const vaultPath = getObsidianPath(record);
    await deleteVaultFile(vaultPath);
    result.savedObsidian = true;
  } catch (e) {
    result.error = `Obsidian delete error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  return result;
}

export async function updateRecord(id: string, patch: Partial<CortexRecord>): Promise<SyncResult> {
  const result: SyncResult = { savedLocal: false, savedObsidian: false };

  const oldRecord = getRecordsById(id);
  if (!oldRecord) {
    return { savedLocal: false, savedObsidian: false, error: "Registro não encontrado" };
  }

  try {
    updateLocal(id, patch);
    result.savedLocal = true;
  } catch (e) {
    return {
      savedLocal: false,
      savedObsidian: false,
      error: `localStorage error: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  const sync = await shouldSyncToObsidian();
  if (!sync) return result;

  try {
    const oldPath = getObsidianPath(oldRecord);
    await deleteVaultFile(oldPath);

    const updated = { ...oldRecord, ...patch };
    const newPath = getObsidianPath(updated);
    const md = recordToMarkdown(updated);
    await writeVaultFile(newPath, md);
    result.savedObsidian = true;
  } catch (e) {
    result.error = `Obsidian update error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  return result;
}

export type StorageProvider = "localStorage" | "localStorage + Obsidian";
