export type SyncRecordType =
  | "task"
  | "finance"
  | "idea"
  | "habit"
  | "daily"
  | "project"
  | "note"
  | "knowledge";

export type SyncRecordSource = "cortex" | "obsidian" | "aion" | "import";

export type SyncStatus = "pending" | "synced" | "failed";

export type SyncRecord = {
  id: string;
  type: SyncRecordType;
  title: string;
  description?: string;
  content?: string;
  amount?: number;
  category?: string;
  priority?: "low" | "medium" | "high";
  status?: string;
  dueDate?: string;
  date?: string;
  tags: string[];
  source: SyncRecordSource;
  sync_status: SyncStatus;
  aion_processed: boolean;
  created_at: string;
  updated_at: string;
  last_synced_at?: string;
  raw?: Record<string, unknown>;
};

export type SyncSummary = {
  total: number;
  synced: number;
  failed: number;
  errors: string[];
};

export interface AionDatabaseAdapter {
  upsert(record: SyncRecord): Promise<void>;
  findById(id: string): Promise<SyncRecord | null>;
  markSynced(id: string): Promise<void>;
  getAll?(): Promise<SyncRecord[]>;
  clearAll?(): Promise<void>;
}
