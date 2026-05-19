import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CortexRecord } from "@/lib/types";

const { mockIndexRecordInBackground, mockDeleteVectorInBackground } = vi.hoisted(() => ({
  mockIndexRecordInBackground: vi.fn(),
  mockDeleteVectorInBackground: vi.fn(),
}));

vi.mock("@/lib/aion/vector/background", () => ({
  indexRecordInBackground: mockIndexRecordInBackground,
  deleteVectorInBackground: mockDeleteVectorInBackground,
}));

vi.mock("@/lib/storage", () => ({
  saveRecord: vi.fn(),
  getRecords: vi.fn().mockReturnValue([]),
  getRecordsById: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  clearRecords: vi.fn(),
  getTodaysRecords: vi.fn().mockReturnValue([]),
  getSpentToday: vi.fn().mockReturnValue(0),
  getTotalSpent: vi.fn().mockReturnValue(0),
  getTopPendingTasks: vi.fn().mockReturnValue([]),
  getLatestEntries: vi.fn().mockReturnValue([]),
  getLastFocusRequest: vi.fn(),
  getRecordsByType: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/firebase/records", () => ({
  saveRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  clearRecords: vi.fn(),
  getRecords: vi.fn().mockResolvedValue([]),
  getRecordById: vi.fn(),
  migrateFromLocal: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
}));

vi.mock("@/lib/obsidian-adapter", () => ({
  exportRecordToObsidian: vi.fn().mockResolvedValue(undefined),
  exportUpdatedRecordToObsidian: vi.fn().mockResolvedValue(undefined),
  deleteExportedRecordFromObsidian: vi.fn().mockResolvedValue(undefined),
  saveRecordToObsidian: vi.fn().mockResolvedValue(undefined),
  updateRecordInObsidian: vi.fn().mockResolvedValue(undefined),
  deleteRecordFromObsidian: vi.fn().mockResolvedValue(undefined),
}));

import * as storageProvider from "@/lib/storageProvider";
import * as local from "@/lib/storage";

function makeRecord(overrides: Partial<CortexRecord> = {}): CortexRecord {
  return {
    id: "test-1",
    type: "task",
    title: "Testar",
    description: "Registro de teste",
    priority: "medium",
    project: null,
    amount: null,
    category: null,
    dueDate: null,
    nextAction: "",
    status: "pending",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("storageProvider — vector indexing integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn(() => "local"),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: {},
      writable: true,
    });
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED = "true";
  });

  it("saveRecord chama indexRecordInBackground", async () => {
    const record = makeRecord();
    await storageProvider.saveRecord(record);
    expect(mockIndexRecordInBackground).toHaveBeenCalledWith(record);
  });

  it("updateRecord chama indexRecordInBackground com registro atualizado", async () => {
    const record = makeRecord();
    const mockGetRecordsById = vi.mocked(local.getRecordsById);
    mockGetRecordsById.mockReturnValue(record);

    await storageProvider.updateRecord("test-1", { title: "Novo título" });
    expect(mockIndexRecordInBackground).toHaveBeenCalledWith(record);
  });

  it("deleteRecord chama deleteVectorInBackground", async () => {
    await storageProvider.deleteRecord("test-1");
    expect(mockDeleteVectorInBackground).toHaveBeenCalledWith("test-1");
  });

  it("saveRecord chama indexRecordInBackground mesmo se Firebase/Obsidian falharem", async () => {
    const record = makeRecord();
    const storage = await import("@/lib/storage");
    const getItemMock = vi.mocked(storage.getRecordsById);
    getItemMock.mockReturnValue(record);

    const obsidian = await import("@/lib/obsidian-adapter");
    vi.mocked(obsidian.exportRecordToObsidian).mockRejectedValue(new Error("offline"));

    await storageProvider.saveRecord(record);
    expect(mockIndexRecordInBackground).toHaveBeenCalledWith(record);
  });
});
