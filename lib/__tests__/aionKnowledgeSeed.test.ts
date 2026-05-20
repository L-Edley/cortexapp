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

const mockGetLocalStorage = vi.fn();
const mockSetLocalStorage = vi.fn();
const mockRemoveLocalStorage = vi.fn();

vi.mock("@/lib/settings", () => ({
  getLocalStorage: mockGetLocalStorage,
  setLocalStorage: mockSetLocalStorage,
  removeLocalStorage: mockRemoveLocalStorage,
}));

vi.mock("@/lib/aion/brain/brainStore", () => ({
  getBrainDB: vi.fn(async () => mockDb),
  isBrainAvailable: vi.fn(() => true),
  generateId: vi.fn(() => "test-id-123"),
  isBrowser: vi.fn(() => true),
}));

describe("Aion Knowledge Seed System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocalStorage.mockReturnValue(null);
  });

  it("getDefaultKnowledgeSeed retorna um conjunto completo de sementes com as tags esperadas", async () => {
    const { getDefaultKnowledgeSeed } = await import("../aionKnowledgeSeed");
    const seeds = getDefaultKnowledgeSeed();
    
    expect(seeds.length).toBeGreaterThan(5);
    expect(seeds[0].source).toBe("system_seed");
    expect(seeds[0].confidence).toBe(1);
    
    // Verifica presença de tags fundamentais
    const allTags = seeds.flatMap(s => s.tags);
    expect(allTags).toContain("cortex");
    expect(allTags).toContain("architecture");
    expect(allTags).toContain("strategy");
    expect(allTags).toContain("providers");
    expect(allTags).toContain("offline-first");
    expect(allTags).toContain("supabase");
    expect(allTags).toContain("obsidian");
  });

  it("seedAionKnowledgeBase salva os conhecimentos se ainda não estiver seedado", async () => {
    const { seedAionKnowledgeBase } = await import("../aionKnowledgeSeed");
    
    mockTable.put.mockResolvedValue(true);
    
    const success = await seedAionKnowledgeBase();
    expect(success).toBe(true);
    expect(mockTable.put).toHaveBeenCalled();
    expect(mockSetLocalStorage).toHaveBeenCalledWith("aion_knowledge_seeded", "true");
    expect(mockIndexBrainItemInBackground).toHaveBeenCalled();
  });

  it("seedAionKnowledgeBase não duplica se já foi seedado", async () => {
    const { seedAionKnowledgeBase } = await import("../aionKnowledgeSeed");
    
    mockGetLocalStorage.mockReturnValue("true");
    
    const success = await seedAionKnowledgeBase();
    expect(success).toBe(true);
    expect(mockTable.put).not.toHaveBeenCalled();
    expect(mockSetLocalStorage).not.toHaveBeenCalled();
  });

  it("resetAionKnowledgeSeed remove a flag e limpa os itens seedados", async () => {
    const { resetAionKnowledgeSeed } = await import("../aionKnowledgeSeed");
    
    mockTable.toArray.mockResolvedValue([
      { id: "seed-1", source: "system_seed" },
      { id: "know-1", source: "user" }
    ]);
    mockTable.delete.mockResolvedValue(true);
    
    const success = await resetAionKnowledgeSeed();
    expect(success).toBe(true);
    expect(mockRemoveLocalStorage).toHaveBeenCalledWith("aion_knowledge_seeded");
    expect(mockTable.delete).toHaveBeenCalledWith("seed-1");
    expect(mockTable.delete).not.toHaveBeenCalledWith("know-1");
  });

  it("não quebra o app se o Brain falhar ou não estiver disponível", async () => {
    const brainStore = await import("@/lib/aion/brain/brainStore");
    vi.spyOn(brainStore, "isBrainAvailable").mockReturnValue(false);
    
    const { seedAionKnowledgeBase } = await import("../aionKnowledgeSeed");
    const success = await seedAionKnowledgeBase();
    
    expect(success).toBe(false); // Retorna falso mas não lança erro (crash)
  });
});
