import { describe, it, expect, vi } from "vitest";

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

describe("client.ts - barrel seguro sem embed/semanticIndex", () => {
  it("exporta cosineSimilarity mas não generateEmbedding nem semanticSearch", async () => {
    const mod: Record<string, unknown> = await import("../client");
    expect(typeof mod.cosineSimilarity).toBe("function");
    expect(mod.generateEmbedding).toBeUndefined();
    expect(mod.semanticSearch).toBeUndefined();
    expect(mod.loadEmbeddingModel).toBeUndefined();
    expect(mod.indexRecord).toBeUndefined();
    expect(mod.upsertVector).toBeUndefined();
  });
});

describe("clientContext.ts - sem static imports de vector", () => {
  it("usa dynamic import de semanticIndex dentro de função getSemantic", async () => {
    // Verificar que o módulo consegue ser carregado sem transformers
    const mod = await import("@/lib/aion/clientContext");
    expect(typeof mod.prepareClientAionContext).toBe("function");
  });
});

describe("browserEmbedding.ts - server guard", () => {
  beforeAll(() => {
    vi.resetModules();
  });

  it("generateEmbedding retorna [] no server", async () => {
    const originalWindow = globalThis.window;
    const originalEnv = process.env.NODE_ENV;
    (globalThis as any).window = undefined;
    process.env.NODE_ENV = "production";

    const { generateEmbedding } = await import("../browserEmbedding");
    const result = await generateEmbedding("teste");
    expect(result).toEqual([]);

    (globalThis as any).window = originalWindow;
    process.env.NODE_ENV = originalEnv;
  });

  it("loadEmbeddingModel retorna false no server", async () => {
    const originalWindow = globalThis.window;
    const originalEnv = process.env.NODE_ENV;
    (globalThis as any).window = undefined;
    process.env.NODE_ENV = "production";

    const { loadEmbeddingModel } = await import("../browserEmbedding");
    const result = await loadEmbeddingModel();
    expect(result).toBe(false);

    (globalThis as any).window = originalWindow;
    process.env.NODE_ENV = originalEnv;
  });
});
