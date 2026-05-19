import type { AionDatabaseAdapter, SyncRecord, SyncSummary } from "./types";
import { detectUnsyncedNotes } from "./detect";
import { indexRecordInBackground } from "@/lib/aion/vector/background";

// ---------------------------------------------------------------------------
// Sync de notas Obsidian não processadas para o banco do Aion.
// Fluxo:
//   1. detectUnsyncedNotes() → notas com aion_processed: false
//   2. Para cada nota: normalize → adapter.upsert → markSynced
//   3. Se uma falhar, as demais continuam
// ---------------------------------------------------------------------------

export async function syncObsidianToAion(
  adapter: AionDatabaseAdapter
): Promise<SyncSummary> {
  const summary: SyncSummary = { total: 0, synced: 0, failed: 0, errors: [] };

  const records = await detectUnsyncedNotes();
  summary.total = records.length;

  for (const record of records) {
    try {
      await adapter.upsert(record);
      await adapter.markSynced(record.id);
      indexRecordInBackground(record);
      summary.synced++;
    } catch (e) {
      summary.failed++;

      const errorMsg =
        e instanceof Error ? e.message : "Erro desconhecido ao sincronizar";

      summary.errors.push(`[${record.id}] ${record.title}: ${errorMsg}`);

      try {
        const failedRecord: SyncRecord = {
          ...record,
          sync_status: "failed",
          raw: { ...(record.raw ?? {}), syncError: errorMsg },
        };
        await adapter.upsert(failedRecord);
      } catch {
        // falha ao registrar falha — continua
      }
    }
  }

  return summary;
}
