import type { CortexRecord } from "@/lib/types";

export function shouldShowDescription(record: CortexRecord): boolean {
  if (!record.description) return false;

  const desc = record.description.trim().toLowerCase();
  const title = record.title.trim().toLowerCase();
  const raw = record.rawInput?.trim().toLowerCase();

  if (!desc) return false;
  if (desc === title) return false;
  if (raw && desc === raw) return false;

  return true;
}
