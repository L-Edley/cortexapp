import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIndexRecordInBackground } = vi.hoisted(() => ({
  mockIndexRecordInBackground: vi.fn(),
}));

vi.mock("@/lib/aion/vector/background", () => ({
  indexRecordInBackground: mockIndexRecordInBackground,
}));

const mockUpsert = vi.fn();
const mockMarkSynced = vi.fn();
const mockAdapter = {
  upsert: mockUpsert,
  markSynced: mockMarkSynced,
  findById: vi.fn(),
};

vi.mock("@/lib/aion/sync/detect", () => ({
  detectUnsyncedNotes: vi.fn(),
}));

import { detectUnsyncedNotes } from "@/lib/aion/sync/detect";

describe("sync -- vector indexing integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncObsidianToAion indexa SyncRecord sincronizado", async () => {
    vi.mocked(detectUnsyncedNotes).mockResolvedValue([
      {
        id: "sync-1",
        type: "task" as const,
        title: "Pagar conta",
        tags: [],
        source: "obsidian" as const,
        sync_status: "pending" as const,
        aion_processed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const { syncObsidianToAion } = await import("../sync");
    const result = await syncObsidianToAion(mockAdapter);

    expect(result.synced).toBe(1);
    expect(mockIndexRecordInBackground).toHaveBeenCalledTimes(1);
  });

  it("falha no background não impede sync de completar", async () => {
    vi.mocked(detectUnsyncedNotes).mockResolvedValue([
      {
        id: "sync-2",
        type: "idea" as const,
        title: "Ideia legal",
        tags: [],
        source: "obsidian" as const,
        sync_status: "pending" as const,
        aion_processed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const { syncObsidianToAion } = await import("../sync");
    const result = await syncObsidianToAion(mockAdapter);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockIndexRecordInBackground).toHaveBeenCalled();
  });

  it("registro com erro de sync não é indexado", async () => {
    vi.mocked(detectUnsyncedNotes).mockResolvedValue([
      {
        id: "sync-3",
        type: "task" as const,
        title: "Falhar",
        tags: [],
        source: "obsidian" as const,
        sync_status: "pending" as const,
        aion_processed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    mockUpsert.mockRejectedValue(new Error("db error"));

    const { syncObsidianToAion } = await import("../sync");
    const result = await syncObsidianToAion(mockAdapter);

    expect(result.failed).toBe(1);
    expect(mockIndexRecordInBackground).not.toHaveBeenCalled();
  });
});
