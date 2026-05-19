import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VectorEntry } from "../types";

const mockGenerateEmbedding = vi.fn();
const mockUpsertVector = vi.fn();
const mockGetAllVectors = vi.fn();
const mockDeleteVectorBySourceId = vi.fn();

vi.mock("../embed", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

vi.mock("../store", () => ({
  upsertVector: mockUpsertVector,
  getAllVectors: mockGetAllVectors,
  deleteVectorBySourceId: mockDeleteVectorBySourceId,
}));

vi.mock("@/lib/aion/brain/brainStore", () => ({
  generateId: vi.fn(() => "vec-id-123"),
  getBrainDB: vi.fn(),
  isBrainAvailable: vi.fn(() => true),
}));

const mockVector: VectorEntry = {
  id: "v1",
  type: "task",
  embedding: [0.1, 0.2, 0.3],
  text: "Tarefa: pagar conta.",
  tags: [],
  sourceType: "record",
  sourceId: "rec-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mockFinanceVector: VectorEntry = {
  ...mockVector,
  id: "v2",
  type: "finance",
  sourceId: "rec-2",
  text: "Financeiro: almoço.",
};

describe("indexRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("salva vetor quando embedding existe", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.4, 0.5, 0.6]);

    const { indexRecord } = await import("../semanticIndex");
    await indexRecord({
      id: "rec-1",
      type: "task",
      title: "Pagar internet",
      priority: "high",
      project: null,
      amount: null,
      category: null,
      dueDate: null,
      nextAction: "",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(mockGenerateEmbedding).toHaveBeenCalled();
    expect(mockUpsertVector).toHaveBeenCalledTimes(1);

    const saved = mockUpsertVector.mock.calls[0][0] as VectorEntry;
    expect(saved.sourceId).toBe("rec-1");
    expect(saved.sourceType).toBe("record");
    expect(saved.type).toBe("task");
    expect(saved.embedding).toEqual([0.4, 0.5, 0.6]);
  });

  it("não salva quando embedding é []", async () => {
    mockGenerateEmbedding.mockResolvedValue([]);

    const { indexRecord } = await import("../semanticIndex");
    await indexRecord({
      id: "rec-2",
      type: "task",
      title: "Teste",
      priority: "low",
      project: null,
      amount: null,
      category: null,
      dueDate: null,
      nextAction: "",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(mockUpsertVector).not.toHaveBeenCalled();
  });

  it("mapeia expense para finance", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2]);

    const { indexRecord } = await import("../semanticIndex");
    await indexRecord({
      id: "rec-3",
      type: "expense",
      title: "Almoço",
      amount: 25,
      priority: "medium",
      project: null,
      category: "alimentação",
      dueDate: null,
      nextAction: "",
      status: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const saved = mockUpsertVector.mock.calls[0][0] as VectorEntry;
    expect(saved.type).toBe("finance");
  });

  it("funciona com SyncRecord", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.7, 0.8]);

    const { indexRecord } = await import("../semanticIndex");
    await indexRecord({
      id: "sync-1",
      type: "habit",
      title: "Meditar",
      tags: ["saúde"],
      source: "obsidian",
      sync_status: "synced",
      aion_processed: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(mockUpsertVector).toHaveBeenCalledTimes(1);

    const saved = mockUpsertVector.mock.calls[0][0] as VectorEntry;
    expect(saved.sourceId).toBe("sync-1");
    expect(saved.sourceType).toBe("record");
  });
});

describe("indexBrainItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("salva vetor para brain item", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.9, 0.8, 0.7]);

    const { indexBrainItem } = await import("../semanticIndex");
    await indexBrainItem({
      id: "brain-1",
      type: "user_preference",
      title: "Gosta de produtividade",
      content: "Usuário prefere Pomodoro",
      tags: ["foco"],
      source: "user",
      confidence: 0.9,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(mockUpsertVector).toHaveBeenCalledTimes(1);

    const saved = mockUpsertVector.mock.calls[0][0] as VectorEntry;
    expect(saved.sourceId).toBe("brain-1");
    expect(saved.sourceType).toBe("brain_item");
    expect(saved.type).toBe("note");
    expect(saved.tags).toEqual(["foco"]);
  });

  it("não salva se embedding falhar", async () => {
    mockGenerateEmbedding.mockResolvedValue([]);

    const { indexBrainItem } = await import("../semanticIndex");
    await indexBrainItem({
      id: "brain-2",
      type: "decision",
      title: "Decisão",
      content: "Conteúdo",
      tags: [],
      source: "user",
      confidence: 0.5,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(mockUpsertVector).not.toHaveBeenCalled();
  });
});

describe("semanticSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna resultados ordenados por score", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
    mockGetAllVectors.mockResolvedValue([
      { ...mockVector, embedding: [0.6, 0.5, 0.4] },
      { ...mockVector, id: "v3", embedding: [0.1, 0.1, 0.1], sourceId: "rec-3" },
      { ...mockVector, id: "v4", embedding: [0.9, 0.9, 0.8], sourceId: "rec-4" },
    ]);

    const { semanticSearch } = await import("../semanticIndex");
    const results = await semanticSearch("teste");

    expect(results).toHaveLength(3);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
  });

  it("respeita filtro type", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
    mockGetAllVectors.mockResolvedValue([mockVector, mockFinanceVector]);

    const { semanticSearch } = await import("../semanticIndex");
    const results = await semanticSearch("teste", { type: "finance" });

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("finance");
  });

  it("respeita topK", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
    mockGetAllVectors.mockResolvedValue([
      { ...mockVector, embedding: [0.6, 0.5, 0.4], sourceId: "r1" },
      { ...mockVector, embedding: [0.9, 0.8, 0.7], sourceId: "r2" },
      { ...mockVector, embedding: [0.3, 0.3, 0.3], sourceId: "r3" },
    ]);

    const { semanticSearch } = await import("../semanticIndex");
    const results = await semanticSearch("teste", { topK: 2 });

    expect(results).toHaveLength(2);
  });

  it("retorna [] se query embedding falhar", async () => {
    mockGenerateEmbedding.mockResolvedValue([]);

    const { semanticSearch } = await import("../semanticIndex");
    const results = await semanticSearch("teste");

    expect(results).toEqual([]);
    expect(mockGetAllVectors).not.toHaveBeenCalled();
  });

  it("aplica threshold corretamente", async () => {
    mockGenerateEmbedding.mockResolvedValue([1, 0, 0]);
    mockGetAllVectors.mockResolvedValue([
      { ...mockVector, embedding: [1, 0, 0], sourceId: "r1" },
      { ...mockVector, embedding: [0, 1, 0], sourceId: "r2" },
    ]);

    const { semanticSearch } = await import("../semanticIndex");
    const results = await semanticSearch("teste", { threshold: 0.8 });

    expect(results).toHaveLength(1);
    expect(results[0].sourceId).toBe("r1");
  });

  it("retorna [] se não houver vetores", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
    mockGetAllVectors.mockResolvedValue([]);

    const { semanticSearch } = await import("../semanticIndex");
    const results = await semanticSearch("teste");

    expect(results).toEqual([]);
  });
});

describe("deleteFromSemanticIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("remove vetor pelo sourceId", async () => {
    const { deleteFromSemanticIndex } = await import("../semanticIndex");
    await deleteFromSemanticIndex("rec-1");

    expect(mockDeleteVectorBySourceId).toHaveBeenCalledWith("rec-1");
  });
});
