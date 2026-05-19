import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPipeline = vi.fn();

vi.mock("@huggingface/transformers", () => ({
  pipeline: mockPipeline,
}));

const mockData = new Float32Array([0.1, 0.2, 0.3, 0.4]);

async function resetModules() {
  vi.resetModules();
  const mod = await import("../embed");
  return mod;
}

function expectCloseTo(actual: number[], expected: number[], precision = 5) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], precision));
}

describe("loadEmbeddingModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("carrega modelo com sucesso", async () => {
    mockPipeline.mockResolvedValue(
      vi.fn(async () => ({ data: mockData, dims: [1, 384], size: 384 }))
    );

    const { loadEmbeddingModel } = await resetModules();
    const result = await loadEmbeddingModel();

    expect(result).toBe(true);
    expect(mockPipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  });

  it("usa cache singleton e não recarrega", async () => {
    mockPipeline.mockResolvedValue(
      vi.fn(async () => ({ data: mockData, dims: [1, 384], size: 384 }))
    );

    const { loadEmbeddingModel } = await resetModules();
    await loadEmbeddingModel();
    await loadEmbeddingModel();

    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it("retorna false se modelo falha ao carregar", async () => {
    mockPipeline.mockRejectedValue(new Error("falha no download"));

    const { loadEmbeddingModel } = await resetModules();
    const result = await loadEmbeddingModel();

    expect(result).toBe(false);
  });

  it("não quebra o app se modelo falha", async () => {
    mockPipeline.mockRejectedValue(new Error("falha no download"));

    const { loadEmbeddingModel, generateEmbedding } = await resetModules();
    await loadEmbeddingModel();
    const emb = await generateEmbedding("teste");

    expect(emb).toEqual([]);
  });
});

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna embedding para texto válido", async () => {
    const mockFn = vi.fn(async () => ({
      data: mockData,
      dims: [1, 384],
      size: 384,
    }));
    mockPipeline.mockResolvedValue(mockFn);

    const { generateEmbedding } = await resetModules();
    const result = await generateEmbedding("teste");

    expectCloseTo(result, [0.1, 0.2, 0.3, 0.4]);
    expect(mockFn).toHaveBeenCalledWith("teste", {
      pooling: "mean",
      normalize: true,
    });
  });

  it("retorna [] para texto vazio", async () => {
    const { generateEmbedding } = await resetModules();
    expect(await generateEmbedding("")).toEqual([]);
    expect(await generateEmbedding("   ")).toEqual([]);
  });

  it("não quebra se modelo falhar", async () => {
    mockPipeline.mockRejectedValue(new Error("falha"));

    const { generateEmbedding } = await resetModules();
    const result = await generateEmbedding("teste");

    expect(result).toEqual([]);
  });

  it("não quebra se pipeline retornar erro na execução", async () => {
    const mockFn = vi.fn(async () => {
      throw new Error("erro na inferência");
    });
    mockPipeline.mockResolvedValue(mockFn);

    const { generateEmbedding } = await resetModules();
    const result = await generateEmbedding("teste");

    expect(result).toEqual([]);
  });
});

describe("generateBatchEmbeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna embeddings para múltiplos textos", async () => {
    const mockFn = vi.fn(async (text: string) => ({
      data: new Float32Array(text === "a" ? [0.1, 0.2] : [0.3, 0.4]),
      dims: [1, 2],
      size: 2,
    }));
    mockPipeline.mockResolvedValue(mockFn);

    const { generateBatchEmbeddings } = await resetModules();
    const result = await generateBatchEmbeddings(["a", "b"]);

    expect(result).toHaveLength(2);
    expectCloseTo(result[0], [0.1, 0.2]);
    expectCloseTo(result[1], [0.3, 0.4]);
  });

  it("retorna [] para lista vazia", async () => {
    const { generateBatchEmbeddings } = await resetModules();
    expect(await generateBatchEmbeddings([])).toEqual([]);
  });

  it("continua mesmo se um item falhar", async () => {
    const mockFn = vi.fn(async (text: string) => {
      if (text === "falha") throw new Error("erro");
      return { data: new Float32Array([0.5, 0.6]), dims: [1, 2], size: 2 };
    });
    mockPipeline.mockResolvedValue(mockFn);

    const { generateBatchEmbeddings } = await resetModules();
    const result = await generateBatchEmbeddings(["ok", "falha", "ok2"]);

    expect(result).toHaveLength(3);
    expectCloseTo(result[0], [0.5, 0.6]);
    expect(result[1]).toEqual([]);
    expectCloseTo(result[2], [0.5, 0.6]);
  });
});

describe("getModelStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna idle antes do carregamento", async () => {
    const { getModelStatus } = await resetModules();
    expect(getModelStatus()).toBe("idle");
  });

  it("retorna ready após carregamento bem-sucedido", async () => {
    mockPipeline.mockResolvedValue(
      vi.fn(async () => ({ data: mockData, dims: [1, 384], size: 384 }))
    );

    const { loadEmbeddingModel, getModelStatus } = await resetModules();
    await loadEmbeddingModel();
    expect(getModelStatus()).toBe("ready");
  });

  it("retorna error após falha", async () => {
    mockPipeline.mockRejectedValue(new Error("falha"));

    const { loadEmbeddingModel, getModelStatus } = await resetModules();
    await loadEmbeddingModel();
    expect(getModelStatus()).toBe("error");
  });
});
