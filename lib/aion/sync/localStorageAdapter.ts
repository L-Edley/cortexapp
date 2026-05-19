import type { AionDatabaseAdapter, SyncRecord, SyncStatus } from "./types";

const STORAGE_KEY = "aion_sync_records";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function getAll(): SyncRecord[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SyncRecord[]) : [];
  } catch {
    return [];
  }
}

function saveAll(records: SyncRecord[]): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage cheio ou indisponível — falha silenciosa
  }
}

export class LocalStorageAionAdapter implements AionDatabaseAdapter {
  async upsert(record: SyncRecord): Promise<void> {
    const records = getAll();
    const index = records.findIndex((r) => r.id === record.id);
    const now = new Date().toISOString();

    if (index >= 0) {
      records[index] = { ...records[index], ...record, updated_at: now };
    } else {
      records.unshift({ ...record, updated_at: now });
    }

    saveAll(records);
  }

  async findById(id: string): Promise<SyncRecord | null> {
    const records = getAll();
    return records.find((r) => r.id === id) ?? null;
  }

  async markSynced(id: string): Promise<void> {
    const records = getAll();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return;

    records[index] = {
      ...records[index],
      sync_status: "synced" as SyncStatus,
      last_synced_at: new Date().toISOString(),
    };

    saveAll(records);
  }

  async getAll(): Promise<SyncRecord[]> {
    return getAll();
  }

  async clearAll(): Promise<void> {
    if (!isClient()) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // falha silenciosa
    }
  }
}
