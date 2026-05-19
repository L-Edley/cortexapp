import type { CortexRecord } from "@/lib/types";
import type { SyncRecord } from "@/lib/aion/sync/types";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import {
  indexRecord,
  indexBrainItem,
  deleteFromSemanticIndex,
} from "./semanticIndex";
import { isBrowser } from "../brain/brainStore";

export function indexRecordInBackground(
  record: CortexRecord | SyncRecord
): void {
  if (!isBrowser()) return;
  void indexRecord(record).catch(() => {});
}

export function indexBrainItemInBackground(item: AionBrainItem): void {
  if (!isBrowser()) return;
  void indexBrainItem(item).catch(() => {});
}

export function deleteVectorInBackground(sourceId: string): void {
  if (!isBrowser()) return;
  void deleteFromSemanticIndex(sourceId).catch(() => {});
}
