import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AionDatabaseAdapter, SyncRecord } from "../types";

vi.mock("../detect", () => ({
  detectUnsyncedNotes: vi.fn(),
  listVaultFiles: vi.fn().mockResolvedValue([]),
}));

import { detectUnsyncedNotes } from "../detect";
import { syncObsidianToAion } from "../sync";

function makeAdapter(): AionDatabaseAdapter {
  const store = new Map<string, SyncRecord>();
  return {
    upsert: vi.fn(async (r: SyncRecord) => {
      store.set(r.id, r);
    }),
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    markSynced: vi.fn(async (id: string) => {
      const r = store.get(id);
      if (r) {
        r.sync_status = "synced";
        r.last_synced_at = new Date().toISOString();
      }
    }),
  };
}

describe("syncObsidianToAion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sincroniza notas pendentes", async () => {
    vi.mocked(detectUnsyncedNotes).mockResolvedValue([
      {
        id: "n1",
        type: "task",
        title: "Nota 1",
        tags: [],
        source: "obsidian",
        sync_status: "pending",
        aion_processed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "n2",
        type: "idea",
        title: "Nota 2",
        tags: [],
        source: "obsidian",
        sync_status: "pending",
        aion_processed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const adapter = makeAdapter();
    const result = await syncObsidianToAion(adapter);

    expect(result.total).toBe(2);
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("continua mesmo se uma nota falhar", async () => {
    vi.mocked(detectUnsyncedNotes).mockResolvedValue([
      {
        id: "n1",
        type: "task",
        title: "Nota 1",
        tags: [],
        source: "obsidian",
        sync_status: "pending",
        aion_processed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "n2",
        type: "idea",
        title: "Nota 2",
        tags: [],
        source: "obsidian",
        sync_status: "pending",
        aion_processed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const adapter = makeAdapter();
    adapter.upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error("falha na nota 1"))
      .mockResolvedValueOnce(undefined);

    const result = await syncObsidianToAion(adapter);

    expect(result.total).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("n1");
  });

  it("retorna total, synced, failed e errors corretamente", async () => {
    vi.mocked(detectUnsyncedNotes).mockResolvedValue([]);

    const adapter = makeAdapter();
    const result = await syncObsidianToAion(adapter);

    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("synced");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
