import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CortexRecord } from "@/lib/types";

const {
  mockSaveRecord,
  mockFirebaseSave,
  mockAdapterSave,
  mockAdapterUpdate,
  mockAdapterDelete,
  mockGetRecordsById,
} = vi.hoisted(() => ({
  mockSaveRecord: vi.fn(),
  mockFirebaseSave: vi.fn(),
  mockAdapterSave: vi.fn(),
  mockAdapterUpdate: vi.fn(),
  mockAdapterDelete: vi.fn(),
  mockGetRecordsById: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  saveRecord: mockSaveRecord,
  getRecords: vi.fn().mockReturnValue([]),
  getRecordsById: mockGetRecordsById,
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
  saveRecord: mockFirebaseSave,
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  clearRecords: vi.fn(),
  getRecords: vi.fn().mockResolvedValue([]),
  getRecordById: vi.fn(),
  getRecordsByType: vi.fn().mockResolvedValue([]),
  subscribeRecords: vi.fn(),
  subscribeRecordsByType: vi.fn(),
  migrateFromLocal: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
}));

vi.mock("@/lib/obsidian-adapter", () => ({
  saveRecordToObsidian: mockAdapterSave,
  updateRecordInObsidian: mockAdapterUpdate,
  deleteRecordFromObsidian: mockAdapterDelete,
  isObsidianAvailable: vi.fn(),
  recordToObsidianNote: vi.fn(),
  buildFrontmatter: vi.fn(),
  parseFrontmatter: vi.fn(),
  writeObsidianNote: vi.fn(),
  readObsidianNote: vi.fn(),
  getFolderByRecordType: vi.fn(),
  createMarkdownNote: vi.fn(),
  buildNoteFrontmatter: vi.fn(),
  buildNoteBody: vi.fn(),
  cortexTypeToNoteType: vi.fn(),
  getObsidianPath: vi.fn(),
}));

import * as storageProvider from "@/lib/storageProvider";

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

describe("storageProvider — after Obsidian consolidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => {
          if (key === "cortex_storage_mode") return "local";
          return null;
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: {},
      writable: true,
    });
    process.env.NEXT_PUBLIC_STORAGE_MODE = "local";
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  });

  // ---- saveRecord ----

  it("salva em localStorage exatamente uma vez (modo local)", async () => {
    const record = makeRecord();
    await storageProvider.saveRecord(record);
    expect(mockSaveRecord).toHaveBeenCalledTimes(1);
    expect(mockSaveRecord).toHaveBeenCalledWith(record);
  });

  it("salva em localStorage exatamente uma vez (modo hybrid)", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hybrid";
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "fake";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "fake";

    await storageProvider.saveRecord(makeRecord());
    expect(mockSaveRecord).toHaveBeenCalledTimes(1);
  });

  it("chama adapter saveRecordToObsidian sempre (independente do modo)", async () => {
    await storageProvider.saveRecord(makeRecord());
    expect(mockAdapterSave).toHaveBeenCalledTimes(1);
  });

  it("chama Firebase + adapter em modo hybrid", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hybrid";
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "fake";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "fake";

    await storageProvider.saveRecord(makeRecord());
    expect(mockFirebaseSave).toHaveBeenCalledTimes(1);
    expect(mockAdapterSave).toHaveBeenCalledTimes(1);
  });

  it("chama Firebase em modo firebase", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "firebase";
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "fake";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "fake";

    await storageProvider.saveRecord(makeRecord());
    expect(mockFirebaseSave).toHaveBeenCalledTimes(1);
  });

  it("não quebra se adapter saveRecordToObsidian falhar", async () => {
    mockAdapterSave.mockRejectedValue(new Error("Adapter offline"));
    const record = makeRecord();
    await expect(storageProvider.saveRecord(record)).resolves.toBeUndefined();
    expect(mockSaveRecord).toHaveBeenCalledTimes(1);
  });

  it("não quebra se Firebase falhar", async () => {
    mockFirebaseSave.mockRejectedValue(new Error("Firestore offline"));
    process.env.NEXT_PUBLIC_STORAGE_MODE = "firebase";
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "fake";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "fake";

    const record = makeRecord();
    await expect(storageProvider.saveRecord(record)).resolves.toBeUndefined();
    expect(mockSaveRecord).toHaveBeenCalledTimes(1);
  });

  // ---- updateRecord ----

  it("updateRecord chama adapter updateRecordInObsidian", async () => {
    const record = makeRecord();
    mockGetRecordsById.mockReturnValue(record);

    await storageProvider.updateRecord("test-1", { title: "Novo" });
    expect(mockAdapterUpdate).toHaveBeenCalledTimes(1);
    expect(mockAdapterUpdate).toHaveBeenCalledWith({
      ...record,
      title: "Novo",
    });
  });

  it("não quebra se adapter updateRecordInObsidian falhar", async () => {
    mockAdapterUpdate.mockRejectedValue(new Error("offline"));
    mockGetRecordsById.mockReturnValue(makeRecord());

    await expect(
      storageProvider.updateRecord("test-1", { title: "X" })
    ).resolves.toBeUndefined();
  });

  // ---- deleteRecord ----

  it("deleteRecord chama adapter deleteRecordFromObsidian", async () => {
    const record = makeRecord();
    mockGetRecordsById.mockReturnValue(record);

    await storageProvider.deleteRecord("test-1");
    expect(mockAdapterDelete).toHaveBeenCalledTimes(1);
    expect(mockAdapterDelete).toHaveBeenCalledWith(record);
  });

  it("não quebra se adapter deleteRecordFromObsidian falhar", async () => {
    mockAdapterDelete.mockRejectedValue(new Error("offline"));
    mockGetRecordsById.mockReturnValue(makeRecord());

    await expect(
      storageProvider.deleteRecord("test-1")
    ).resolves.toBeUndefined();
  });
});
