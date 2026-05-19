import type { SyncRecord } from "./types";
import { normalizeObsidianNoteToRecord } from "./normalize";

// ---------------------------------------------------------------------------
// TODO: Quando o plugin Obsidian Local REST API suportar listagem de arquivos,
// substituir esta função por uma chamada real a GET /vault/.
// Por enquanto, a função retorna um array vazio e o sync depende de
// chamadas individuais por path conhecido.
// ---------------------------------------------------------------------------

export async function listVaultFiles(_suffix?: string): Promise<string[]> {
  // Future: GET /api/obsidian/vault — retorna árvore de arquivos do vault
  // Por enquanto: sem implementação confiável cross-plugin.
  return [];
}

export async function detectUnsyncedNotes(): Promise<SyncRecord[]> {
  const files = await listVaultFiles(".md");
  if (files.length === 0) return [];

  const results: SyncRecord[] = [];

  for (const filePath of files) {
    try {
      const res = await fetch(`/api/obsidian/vault/${encodeURIComponent(filePath)}`);
      if (!res.ok) continue;

      const markdown = await res.text();
      const record = normalizeObsidianNoteToRecord(markdown, filePath);

      if (!record.aion_processed) {
        results.push(record);
      }
    } catch {
      continue;
    }
  }

  return results;
}
