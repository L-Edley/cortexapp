import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VectorEntry } from "../types";

const mockFirst = vi.fn(async () => undefined);
const mockWhereChain = {
  equals: vi.fn(() => ({ first: mockFirst })),
};

const mockPut = vi.fn();
const mockDelete = vi.fn();
const mockToArray = vi.fn(async () => []);
const mockClear = vi.fn();
const mockGet = vi.fn();

const mockTable = {
  put: mockPut,
  where: vi.fn(() => mockWhereChain),
  delete: mockDelete,
  toArray: mockToArray,
  clear: mockClear,
  get: mockGet,
};

const mockDb = {
  table: vi.fn(() => mockTable),
};

vi.mock("@/lib/aion/brain/brainStore", () => ({
  getBrainDB: vi.fn(async () => mockDb),
  generateId: vi.fn(() => "test-id-123"),
  isBrainAvailable: vi.fn(() => true),
}));

const sampleVector: VectorEntry = {
  id: "v1",
  type: "task",
  embedding: [0.1, 0.2, 0.3],
  text: "Tarefa: pagar conta.",
  tags: ["urgente"],
  sourceType: "record",
  sourceId: "rec-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function restoreGetBrainDB() {
  const brainStore = await import("@/lib/aion/brain/brainStore");
  vi.mocked(brainStore.getBrainDB).mockResolvedValue(mockDb);
}

describe("upsertVector", () => {
  beforeEach(async () => {
    await restoreGetBrainDB();
    mockPut.mockClear();
    mockDb.table.mockClear();
  });

  it("salva vetor na tabela vectors", async () => {
    const { upsertVector } = await import("../store");
    await upsertVector(sampleVector);

    expect(mockDb.table).toHaveBeenCalledWith("vectors");
    expect(mockPut).toHaveBeenCalledWith(sampleVector);
  });

  it("atualiza vetor existente (mesmo id)", async () => {
    const { upsertVector } = await import("../store");
    const updated = { ...sampleVector, text: "Tarefa: pagar conta atualizada." };
    await upsertVector(updated);

    expect(mockPut).toHaveBeenCalledWith(updated);
  });

  it("não quebra se db for null", async () => {
    const brainStore = await import("@/lib/aion/brain/brainStore");
    vi.mocked(brainStore.getBrainDB).mockResolvedValue(null);

    const { upsertVector } = await import("../store");
    await expect(upsertVector(sampleVector)).resolves.toBeUndefined();
  });
});

describe("getVectorBySourceId", () => {
  beforeEach(async () => {
    await restoreGetBrainDB();
    mockFirst.mockReset();
    mockFirst.mockImplementation(async () => undefined);
    mockDb.table.mockClear();
    mockTable.where.mockClear();
    mockWhereChain.equals.mockClear();
  });

  it("retorna vetor quando encontrado", async () => {
    mockFirst.mockResolvedValue(sampleVector);

    const { getVectorBySourceId } = await import("../store");
    const result = await getVectorBySourceId("rec-1");

    expect(result).toEqual(sampleVector);
    expect(mockTable.where).toHaveBeenCalledWith("sourceId");
  });

  it("retorna null quando não encontrado", async () => {
    mockFirst.mockResolvedValue(undefined);

    const { getVectorBySourceId } = await import("../store");
    const result = await getVectorBySourceId("inexistente");

    expect(result).toBeNull();
  });

  it("retorna null se db for null", async () => {
    const brainStore = await import("@/lib/aion/brain/brainStore");
    vi.mocked(brainStore.getBrainDB).mockResolvedValue(null);

    const { getVectorBySourceId } = await import("../store");
    const result = await getVectorBySourceId("rec-1");

    expect(result).toBeNull();
  });
});

describe("deleteVectorBySourceId", () => {
  beforeEach(async () => {
    await restoreGetBrainDB();
    mockFirst.mockReset();
    mockFirst.mockImplementation(async () => undefined);
    mockDelete.mockClear();
    mockDb.table.mockClear();
    mockTable.where.mockClear();
  });

  it("remove vetor quando encontrado", async () => {
    mockFirst.mockResolvedValue(sampleVector);

    const { deleteVectorBySourceId } = await import("../store");
    await deleteVectorBySourceId("rec-1");

    expect(mockDelete).toHaveBeenCalledWith("v1");
  });

  it("não chama delete se vetor não existir", async () => {
    mockFirst.mockResolvedValue(undefined);

    const { deleteVectorBySourceId } = await import("../store");
    await deleteVectorBySourceId("rec-1");

    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("getAllVectors", () => {
  beforeEach(async () => {
    await restoreGetBrainDB();
    mockToArray.mockReset();
    mockToArray.mockImplementation(async () => []);
    mockDb.table.mockClear();
  });

  it("retorna lista de vetores", async () => {
    mockToArray.mockResolvedValue([sampleVector]);

    const { getAllVectors } = await import("../store");
    const result = await getAllVectors();

    expect(result).toEqual([sampleVector]);
  });

  it("retorna lista vazia se db for null", async () => {
    const brainStore = await import("@/lib/aion/brain/brainStore");
    vi.mocked(brainStore.getBrainDB).mockResolvedValue(null);

    const { getAllVectors } = await import("../store");
    const result = await getAllVectors();

    expect(result).toEqual([]);
  });
});

describe("clearVectorStore", () => {
  beforeEach(async () => {
    await restoreGetBrainDB();
    mockClear.mockClear();
    mockDb.table.mockClear();
  });

  it("limpa tabela vectors", async () => {
    const { clearVectorStore } = await import("../store");
    await clearVectorStore();

    expect(mockClear).toHaveBeenCalled();
  });

  it("não quebra se db for null", async () => {
    const brainStore = await import("@/lib/aion/brain/brainStore");
    vi.mocked(brainStore.getBrainDB).mockResolvedValue(null);

    const { clearVectorStore } = await import("../store");
    await expect(clearVectorStore()).resolves.toBeUndefined();
  });
});
