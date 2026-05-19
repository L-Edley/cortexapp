import { describe, it, expect, beforeEach, vi } from "vitest";
import { LocalStorageAionAdapter } from "../localStorageAdapter";
import type { SyncRecord } from "../types";

vi.stubGlobal("window", {});

const store: Record<string, string> = {};

vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    store[key] = val;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  }),
});

function makeRecord(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    id: "test-1",
    type: "task",
    title: "Testar",
    tags: [],
    source: "cortex",
    sync_status: "pending",
    aion_processed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("LocalStorageAionAdapter", () => {
  let adapter: LocalStorageAionAdapter;

  beforeEach(() => {
    localStorage.clear();
    adapter = new LocalStorageAionAdapter();
  });

  it("upsert salva novo registro", async () => {
    const record = makeRecord();
    await adapter.upsert(record);

    const found = await adapter.findById("test-1");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("test-1");
    expect(found!.title).toBe("Testar");
  });

  it("upsert atualiza registro existente", async () => {
    await adapter.upsert(makeRecord({ title: "Original" }));
    await adapter.upsert(makeRecord({ title: "Atualizado" }));

    const found = await adapter.findById("test-1");
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Atualizado");
  });

  it("findById retorna null para registro inexistente", async () => {
    const found = await adapter.findById("nao-existe");
    expect(found).toBeNull();
  });

  it("markSynced altera sync_status e preenche last_synced_at", async () => {
    await adapter.upsert(makeRecord());
    await adapter.markSynced("test-1");

    const found = await adapter.findById("test-1");
    expect(found!.sync_status).toBe("synced");
    expect(found!.last_synced_at).toBeTruthy();
  });
});
