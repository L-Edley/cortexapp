import { describe, it, expect, vi, beforeEach } from "vitest";
import { prepareClientAionContext } from "../clientContext";

// Mock dependencies
const mockSemanticSearch = vi.fn();
const mockRetrieveRelevantBrainContext = vi.fn();

vi.mock("../vector/client", () => ({
  semanticSearch: (msg: string, options?: any) => mockSemanticSearch(msg, options),
}));

vi.mock("../brain/retrieval", () => ({
  retrieveRelevantBrainContext: (msg: string) => mockRetrieveRelevantBrainContext(msg),
}));

describe("prepareClientAionContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default env setup
    process.env.NEXT_PUBLIC_SEMANTIC_MEMORY_ENABLED = "true";
    // Mock window to simulate browser environment
    vi.stubGlobal("window", {});
  });

  it("retorna contexto vazio se NEXT_PUBLIC_SEMANTIC_MEMORY_ENABLED estiver desabilitado", async () => {
    process.env.NEXT_PUBLIC_SEMANTIC_MEMORY_ENABLED = "false";

    const context = await prepareClientAionContext("Olá");

    expect(context).toEqual({
      source: "client-dexie",
      semanticResults: [],
      brainItems: [],
    });
    expect(mockSemanticSearch).not.toHaveBeenCalled();
    expect(mockRetrieveRelevantBrainContext).not.toHaveBeenCalled();
  });

  it("retorna contexto vazio se window for undefined (execução no server)", async () => {
    vi.stubGlobal("window", undefined);

    const context = await prepareClientAionContext("Olá");

    expect(context).toEqual({
      source: "client-dexie",
      semanticResults: [],
      brainItems: [],
    });
    expect(mockSemanticSearch).not.toHaveBeenCalled();
    expect(mockRetrieveRelevantBrainContext).not.toHaveBeenCalled();
  });

  it("executa busca semântica e do cérebro com sucesso no browser", async () => {
    mockSemanticSearch.mockResolvedValue([
      {
        id: "1",
        sourceId: "src-1",
        sourceType: "memory",
        type: "concept",
        text: "Texto recuperado",
        title: "Título 1",
        tags: ["tag1"],
        score: 0.95,
      },
    ]);

    mockRetrieveRelevantBrainContext.mockResolvedValue([
      {
        id: "brain-1",
        type: "fact",
        title: "Brain Title",
        content: "Conteúdo relevante",
        tags: ["tag2"],
        confidence: 0.9,
      },
    ]);

    const context = await prepareClientAionContext("Olá");

    expect(context).toEqual({
      source: "client-dexie",
      semanticResults: [
        {
          id: "1",
          sourceId: "src-1",
          sourceType: "memory",
          type: "concept",
          text: "Texto recuperado",
          title: "Título 1",
          tags: ["tag1"],
          score: 0.95,
        },
      ],
      brainItems: [
        {
          id: "brain-1",
          type: "fact",
          title: "Brain Title",
          content: "Conteúdo relevante",
          tags: ["tag2"],
          confidence: 0.9,
        },
      ],
    });

    expect(mockSemanticSearch).toHaveBeenCalledWith("Olá", { topK: 3 });
    expect(mockRetrieveRelevantBrainContext).toHaveBeenCalledWith("Olá");
  });

  it("recupera elegantemente com contexto vazio se houver erro nas chamadas", async () => {
    mockSemanticSearch.mockRejectedValue(new Error("Dexie query failed"));

    const context = await prepareClientAionContext("Olá");

    expect(context).toEqual({
      source: "client-dexie",
      semanticResults: [],
      brainItems: [],
    });
  });
});
