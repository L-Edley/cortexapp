type FeatureExtractionPipeline = (
  texts: string | string[],
  options?: {
    pooling?: "mean" | "cls" | "max";
    normalize?: boolean;
  }
) => Promise<{ data: Float32Array; dims: number[]; size: number }>;

let model: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<void> | null = null;
let modelStatus: "idle" | "loading" | "ready" | "error" = "idle";

const isServer = typeof window === "undefined" && process.env.NODE_ENV !== "test";

export function getModelStatus(): typeof modelStatus {
  return modelStatus;
}

export async function loadEmbeddingModel(): Promise<boolean> {
  if (isServer) {
    return false;
  }

  if (model) return true;
  if (loadingPromise) {
    await loadingPromise;
    return model !== null;
  }

  modelStatus = "loading";

  loadingPromise = (async () => {
    try {
      const { pipeline } = await import("@huggingface/transformers");
      model = (await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      )) as unknown as FeatureExtractionPipeline;
      modelStatus = "ready";
    } catch (err) {
      console.warn("[EMBED] Falha ao carregar modelo de embeddings:", err);
      model = null;
      modelStatus = "error";
    }
  })();

  await loadingPromise;
  loadingPromise = null;
  return model !== null;
}

async function getModel(): Promise<FeatureExtractionPipeline | null> {
  if (isServer) {
    return null;
  }
  if (model) return model;
  const loaded = await loadEmbeddingModel();
  return loaded ? model : null;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (isServer) {
    return [];
  }
  if (!text || text.trim().length === 0) return [];

  const m = await getModel();
  if (!m) return [];

  try {
    const result = await m(text, { pooling: "mean", normalize: true });
    return Array.from(result.data);
  } catch (err) {
    console.warn("[EMBED] Falha ao gerar embedding:", err);
    return [];
  }
}

export async function generateBatchEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (isServer) {
    return texts.map(() => []);
  }
  if (texts.length === 0) return [];

  const m = await getModel();
  if (!m) return texts.map(() => []);

  const results: number[][] = [];

  for (const text of texts) {
    try {
      if (!text || text.trim().length === 0) {
        results.push([]);
        continue;
      }
      const result = await m(text, { pooling: "mean", normalize: true });
      results.push(Array.from(result.data));
    } catch (err) {
      console.warn("[EMBED] Falha ao gerar embedding em lote:", err);
      results.push([]);
    }
  }

  return results;
}
