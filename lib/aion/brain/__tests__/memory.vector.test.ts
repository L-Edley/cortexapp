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

describe("memory -- vector indexing integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveMemory chama indexBrainItemInBackground", async () => {
    const { saveMemory } = await import("../memory");
    const item = {
      id: "mem-1",
      type: "user_preference",
      title: "Prefere trabalhar de manhã",
      content: "Usuário é mais produtivo pela manhã",
      tags: ["produtividade"],
      source: "user" as const,
      confidence: 0.9,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveMemory(item);
    expect(mockIndexBrainItemInBackground).toHaveBeenCalled();
  });

  it("saveMemory não indexa item com tags sensíveis", async () => {
    const { saveMemory } = await import("../memory");
    const item = {
      id: "mem-2",
      type: "user_preference",
      title: "Info médica",
      content: "Detalhes de saúde",
      tags: ["medical", "private"],
      source: "user" as const,
      confidence: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveMemory(item);
    expect(mockIndexBrainItemInBackground).not.toHaveBeenCalled();
  });

  it("deleteMemory chama deleteVectorInBackground", async () => {
    const { deleteMemory } = await import("../memory");
    await deleteMemory("mem-1");
    expect(mockDeleteVectorInBackground).toHaveBeenCalledWith("mem-1");
  });

  it("saveMemory funciona mesmo com background indexing", async () => {
    const { saveMemory } = await import("../memory");
    const item = {
      id: "mem-3",
      type: "pattern",
      title: "Padrão",
      content: "Conteúdo",
      tags: [],
      source: "user" as const,
      confidence: 0.7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await saveMemory(item);
    expect(result).not.toBeNull();
    expect(mockIndexBrainItemInBackground).toHaveBeenCalled();
  });
});
