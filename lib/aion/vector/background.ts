import type { CortexRecord } from "@/lib/types";
import type { SyncRecord } from "@/lib/aion/sync/types";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import { isBrowser } from "../brain/brainStore";

export function indexRecordInBackground(
  record: CortexRecord | SyncRecord
): void {
  if (!isBrowser()) return;
  import("./semanticIndex")
    .then(({ indexRecord }) => {
      void indexRecord(record).catch(() => {});
    })
    .catch(() => {});
}

export function indexBrainItemInBackground(item: AionBrainItem): void {
  if (!isBrowser()) return;
  import("./semanticIndex")
    .then(({ indexBrainItem }) => {
      void indexBrainItem(item).catch(() => {});
    })
    .catch(() => {});
}

export function deleteVectorInBackground(sourceId: string): void {
  if (!isBrowser()) return;
  import("./semanticIndex")
    .then(({ deleteFromSemanticIndex }) => {
      void deleteFromSemanticIndex(sourceId).catch(() => {});
    })
    .catch(() => {});
}
