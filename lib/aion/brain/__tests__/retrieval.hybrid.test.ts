import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSemanticSearch = vi.fn();

vi.mock("@/lib/aion/vector/semanticIndex", () => ({
  semanticSearch: mockSemanticSearch,
}));

const mockMemoryTable = {
  put: vi.fn(),
  toArray: vi.fn(),
};
const mockKnowledgeTable = {
  put: vi.fn(),
  toArray: vi.fn(),
};

const mockDb = {
  table: vi.fn((name: string) =>
    name === "memories" ? mockMemoryTable : mockKnowledgeTable
  ),
};

vi.mock("@/lib/aion/brain/brainStore", () => ({
  getBrainDB: vi.fn(async () => mockDb),
  isBrainAvailable: vi.fn(() => true),
  isBrowser: vi.fn(() => true),
}));

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    type: "procedure",
    title: "Procedimento de teste",
    content: "Conteúdo que contém palavras relevantes para a busca semântica",
    tags: ["teste", "busca"],
    source: "user",
    confidence: 0.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("retrieval -- hybrid search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    mockMemoryTable.toArray.mockReset();
    mockMemoryTable.put.mockReset();
    mockKnowledgeTable.toArray.mockReset();
    mockKnowledgeTable.put.mockReset();
  });

  it("retorna resultados da busca keyword quando semantica retorna vazio", async () => {
    mockSemanticSearch.mockResolvedValue([]);
    mockMemoryTable.toArray.mockResolvedValue([]);
    mockKnowledgeTable.toArray.mockResolvedValue([makeItem()]);

    const { retrieveRelevantBrainContext } = await import("../retrieval");
    const result = await retrieveRelevantBrainContext("teste");

    expect(result.length).toBeGreaterThan(0);
  });

  it("retorna resultados quando semanticSearch falha", async () => {
    mockSemanticSearch.mockRejectedValue(new Error("semantic error"));
    mockMemoryTable.toArray.mockResolvedValue([]);
    mockKnowledgeTable.toArray.mockResolvedValue([makeItem()]);

    const { retrieveRelevantBrainContext } = await import("../retrieval");
    const result = await retrieveRelevantBrainContext("teste");

    expect(result.length).toBeGreaterThan(0);
  });

  it("não duplica item quando semântica retorna mesmo sourceId", async () => {
    mockSemanticSearch.mockResolvedValue([
      {
        id: "vec-1",
        sourceId: "item-1",
        type: "note",
        embedding: [0.1, 0.2],
        text: "teste",
        tags: ["teste"],
        sourceType: "brain_item",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        score: 0.95,
      },
    ]);

    mockMemoryTable.toArray.mockResolvedValue([]);
    mockKnowledgeTable.toArray.mockResolvedValue([makeItem()]);

    const { retrieveRelevantBrainContext } = await import("../retrieval");
    const result = await retrieveRelevantBrainContext("teste");

    const item1Count = result.filter((i: { id: string }) => i.id === "item-1").length;
    expect(item1Count).toBe(1);
  });

  it("respeita limite de 5 resultados", async () => {
    mockSemanticSearch.mockResolvedValue([]);
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({
        id: `item-${i}`,
        title: `Teste item ${i}`,
        content: `Conteúdo com palavra teste relevante para busca`,
        tags: ["teste"],
      })
    );
    mockMemoryTable.toArray.mockResolvedValue([]);
    mockKnowledgeTable.toArray.mockResolvedValue(items);

    const { retrieveRelevantBrainContext } = await import("../retrieval");
    const result = await retrieveRelevantBrainContext("teste");

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("inclui resultado semântico quando relevante", async () => {
    mockSemanticSearch.mockResolvedValue([
      {
        id: "vec-2",
        sourceId: "semantic-item",
        type: "note",
        embedding: [0.5, 0.6],
        text: "Conhecimento avançado sobre transformers e machine learning",
        tags: ["ia"],
        sourceType: "brain_item",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        score: 0.92,
      },
    ]);

    const items = [
      makeItem({ id: "item-1", title: "Busca", content: "teste keyword", tags: ["teste"] }),
      makeItem({
        id: "semantic-item",
        title: "Deep learning",
        content: "Conhecimento avançado sobre transformers e machine learning",
        tags: ["ia"],
      }),
    ];
    mockMemoryTable.toArray.mockResolvedValue([]);
    mockKnowledgeTable.toArray.mockResolvedValue(items);

    const { retrieveRelevantBrainContext } = await import("../retrieval");
    const result = await retrieveRelevantBrainContext("transformers machine learning");

    const ids = result.map((i: { id: string }) => i.id);
    expect(ids).toContain("semantic-item");
  });
});
