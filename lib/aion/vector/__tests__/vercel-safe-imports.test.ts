import { describe, it, expect } from "vitest";

describe("server-safe.ts - barrel para server", () => {
  it("exporta cosineSimilarity sem importar transformers", async () => {
    const mod = await import("../server-safe");
    expect(typeof mod.cosineSimilarity).toBe("function");
    expect(typeof mod.dotProduct).toBe("function");
    expect(typeof mod.normalizeVector).toBe("function");
  });

  it("NÃO exporta generateEmbedding nem semanticSearch", async () => {
    const mod: Record<string, unknown> = await import("../server-safe");
    expect(mod.generateEmbedding).toBeUndefined();
    expect(mod.semanticSearch).toBeUndefined();
    expect(mod.loadEmbeddingModel).toBeUndefined();
    expect(mod.indexRecord).toBeUndefined();
  });
});

describe("aionContext.ts - server sem clientContext desliga busca semântica", () => {
  it("buildSessionContext sem clientContext seta serverSemanticDisabled", async () => {
    const { buildSessionContext } = await import("@/lib/aionContext");
    const ctx = await buildSessionContext("teste", {
      contextPolicy: { loadSemanticSearch: true } as any,
    });

    expect(ctx.serverSemanticDisabled).toBe(true);
    expect(ctx.semanticResults).toEqual([]);
    expect(ctx.relevantBrainItems).toEqual([]);
  });

  it("buildSessionContext com clientContext usa dados do cliente", async () => {
    const { buildSessionContext } = await import("@/lib/aionContext");
    const ctx = await buildSessionContext("teste", {
      clientContext: {
        semanticResults: [{ id: "r1", score: 0.9, text: "teste", type: "note", tags: [] }],
        brainItems: [{ id: "b1", title: "memoria", content: "conteudo", type: "user_preference", tags: [], source: "user", confidence: 0.9, createdAt: "", updatedAt: "" }],
      } as any,
      contextPolicy: { loadSemanticSearch: true } as any,
    });

    expect(ctx.clientContextUsed).toBe(true);
    expect(ctx.semanticResults).toHaveLength(1);
    expect(ctx.semanticResults[0].id).toBe("r1");
    expect(ctx.relevantBrainItems).toHaveLength(1);
    expect(ctx.relevantBrainItems[0].id).toBe("b1");
  });
});

describe("index.ts - barrel exporta só server-safe", () => {
  it("exporta cosineSimilarity mas não generateEmbedding", async () => {
    const mod: Record<string, unknown> = await import("../index");
    expect(typeof mod.cosineSimilarity).toBe("function");
    expect(mod.generateEmbedding).toBeUndefined();
    expect(mod.semanticSearch).toBeUndefined();
    expect(mod.loadEmbeddingModel).toBeUndefined();
  });
});
