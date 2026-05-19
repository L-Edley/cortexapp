import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIndexBrainItemInBackground = vi.fn();
const mockDeleteVectorInBackground = vi.fn();

vi.mock("@/lib/aion/vector/background", () => ({
  indexBrainItemInBackground: mockIndexBrainItemInBackground,
  deleteVectorInBackground: mockDeleteVectorInBackground,
}));

const mockTable = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  toArray: vi.fn(),
};

const mockDb = {
  table: vi.fn(() => mockTable),
};

vi.mock("@/lib/aion/brain/brainStore", () => ({
  getBrainDB: vi.fn(async () => mockDb),
  isBrainAvailable: vi.fn(() => true),
  generateId: vi.fn(() => "test-id-123"),
  isBrowser: vi.fn(() => true),
}));

vi.mock("@/lib/aion/vector/semanticIndex", () => ({
  semanticSearch: vi.fn(async () => []),
}));

describe("knowledge -- vector indexing integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveKnowledge chama indexBrainItemInBackground", async () => {
    const { saveKnowledge } = await import("../knowledge");
    const item = {
      id: "know-1",
      type: "research" as const,
      title: "Pesquisa sobre IA",
      content: "Artigos sobre transformers",
      tags: ["ia", "machine learning"],
      source: "web" as const,
      confidence: 0.8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveKnowledge(item);
    expect(mockIndexBrainItemInBackground).toHaveBeenCalled();
  });

  it("saveKnowledge não indexa item com tags sensíveis", async () => {
    const { saveKnowledge } = await import("../knowledge");
    const item = {
      id: "know-2",
      type: "research" as const,
      title: "Info legal",
      content: "Detalhes do processo",
      tags: ["legal"],
      source: "user" as const,
      confidence: 0.7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveKnowledge(item);
    expect(mockIndexBrainItemInBackground).not.toHaveBeenCalled();
  });

  it("deleteKnowledge chama deleteVectorInBackground", async () => {
    const { deleteKnowledge } = await import("../knowledge");
    await deleteKnowledge("know-1");
    expect(mockDeleteVectorInBackground).toHaveBeenCalledWith("know-1");
  });

  it("saveKnowledge funciona mesmo com background indexing", async () => {
    const { saveKnowledge } = await import("../knowledge");
    const item = {
      id: "know-3",
      type: "procedure" as const,
      title: "Procedimento",
      content: "Passos",
      tags: [],
      source: "user" as const,
      confidence: 0.7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await saveKnowledge(item);
    expect(result).not.toBeNull();
    expect(mockIndexBrainItemInBackground).toHaveBeenCalled();
  });
});
