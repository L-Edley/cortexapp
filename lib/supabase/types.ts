import type { CortexRecordType, Priority, RecordStatus } from "@/lib/types";
import type { AionBrainItemType, AionBrainSource } from "@/lib/aion/brain/types";
import type { AionProfile } from "@/lib/aionProfile";

/**
 * lib/supabase/types.ts
 * Mapeamento estrito das tabelas do Supabase para o ecossistema Cortex/Aion.
 */

// 1. Tabela: records
export interface SupabaseRecord {
  id: string; // PK text (formato do generateRecordId)
  user_id: string; // UUID
  type: CortexRecordType;
  title: string;
  description: string | null;
  priority: Priority;
  project: string | null;
  amount: number | null;
  category: string | null;
  due_date: string | null; // DATE (YYYY-MM-DD)
  next_action: string;
  status: RecordStatus;
  raw_input: string | null;
  device_id: string;
  version: number;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
  deleted_at: string | null; // TIMESTAMPTZ (soft delete)
}

export type SupabaseRecordInsert = Omit<SupabaseRecord, "updated_at" | "deleted_at" | "version"> & {
  version?: number;
  updated_at?: string;
  deleted_at?: string | null;
};

export type SupabaseRecordUpdate = Partial<SupabaseRecord>;


// 2. Tabela: memories
export interface SupabaseMemory {
  id: string; // PK text
  user_id: string; // UUID
  type: AionBrainItemType;
  content: string;
  source: AionBrainSource | null;
  confidence: number;
  tags: string[];
  metadata: Record<string, unknown> | null;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
  expires_at: string | null; // TIMESTAMPTZ
  deleted_at: string | null; // TIMESTAMPTZ
  device_id: string;
  version: number;
}

export type SupabaseMemoryInsert = Omit<SupabaseMemory, "updated_at" | "deleted_at" | "version"> & {
  version?: number;
  updated_at?: string;
  deleted_at?: string | null;
};

export type SupabaseMemoryUpdate = Partial<SupabaseMemory>;


// 3. Tabela: profiles
export interface SupabaseProfile {
  id: string; // UUID PK
  user_id: string; // UUID FK
  display_name: string | null;
  avatar_url: string | null;
  preferences: Record<string, unknown> | null;
  profile_data: AionProfile;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
  deleted_at: string | null; // TIMESTAMPTZ
}

export type SupabaseProfileInsert = Omit<SupabaseProfile, "id" | "created_at" | "updated_at" | "deleted_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type SupabaseProfileUpdate = Partial<SupabaseProfile>;


// 4. Tabela: sync_queue
export interface SupabaseSyncQueueItem {
  id: string; // UUID PK
  user_id: string; // UUID
  device_id: string;
  table_name: string; // 'records' | 'memories' | 'knowledge' | etc.
  record_id: string;
  operation: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "failed" | "completed";
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

export type SupabaseSyncQueueItemInsert = Omit<SupabaseSyncQueueItem, "id" | "status" | "retry_count" | "max_retries" | "error_message" | "created_at" | "updated_at"> & {
  id?: string;
  status?: SupabaseSyncQueueItem["status"];
  retry_count?: number;
  max_retries?: number;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SupabaseSyncQueueItemUpdate = Partial<SupabaseSyncQueueItem>;


// 5. Tabela: devices
export interface SupabaseDevice {
  id: string; // device_id gerado localmente
  user_id: string; // UUID
  device_name: string | null;
  device_type: "mobile" | "desktop" | "web" | null;
  last_synced_at: string | null; // TIMESTAMPTZ
  last_ip: string | null;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

export type SupabaseDeviceInsert = Omit<SupabaseDevice, "created_at" | "updated_at" | "last_synced_at"> & {
  last_synced_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SupabaseDeviceUpdate = Partial<SupabaseDevice>;


// 6. Tabela: sync_log
export interface SupabaseSyncLog {
  id: string; // UUID PK
  user_id: string; // UUID
  device_id: string;
  direction: "push" | "pull";
  status: "in_progress" | "completed" | "failed";
  records_pushed: number;
  records_pulled: number;
  conflicts_resolved: number;
  errors: number;
  error_details: Record<string, unknown> | null;
  started_at: string; // TIMESTAMPTZ
  completed_at: string | null; // TIMESTAMPTZ
}

export type SupabaseSyncLogInsert = Omit<SupabaseSyncLog, "id" | "status" | "records_pushed" | "records_pulled" | "conflicts_resolved" | "errors" | "completed_at"> & {
  id?: string;
  status?: SupabaseSyncLog["status"];
  records_pushed?: number;
  records_pulled?: number;
  conflicts_resolved?: number;
  errors?: number;
  completed_at?: string | null;
};

export type SupabaseSyncLogUpdate = Partial<SupabaseSyncLog>;
