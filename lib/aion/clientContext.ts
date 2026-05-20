import type { AionClientContext } from "./types";

let _retrievalModule: any;
async function getRetrieval() {
  if (!_retrievalModule) {
    _retrievalModule = await import("./brain/retrieval");
  }
  return _retrievalModule;
}

let _semanticModule: any;
async function getSemantic() {
  if (!_semanticModule) {
    _semanticModule = await import("./vector/semanticIndex");
  }
  return _semanticModule;
}

/**
 * Prepara o contexto do cliente de forma segura no navegador.
 * Busca no Dexie (busca semântica e memórias locais) e sanitiza os resultados antes de enviar para a API.
 */
export async function prepareClientAionContext(message: string): Promise<AionClientContext> {
  const isEnabled = process.env.NEXT_PUBLIC_SEMANTIC_MEMORY_ENABLED !== "false";
  
  if (!isEnabled || typeof window === "undefined") {
    return {
      source: "client-dexie",
      semanticResults: [],
      brainItems: [],
    };
  }

  try {
    // 1. Busca semântica local
    const { semanticSearch } = await getSemantic();
    const rawSemantic = await semanticSearch(message, { topK: 3 });
    const semanticResults = rawSemantic.map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      type: item.type,
      text: item.text,
      title: (item as any).title || "",
      tags: item.tags || [],
      score: (item as any).score ?? 0,
    }));

    // 2. Recuperação de itens do cérebro (Dexie)
    const { retrieveRelevantBrainContext } = await getRetrieval();
    const rawBrain = await retrieveRelevantBrainContext(message);
    const brainItems = rawBrain.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content,
      tags: item.tags,
      confidence: item.confidence,
    }));

    return {
      source: "client-dexie",
      semanticResults,
      brainItems,
    };
  } catch (error) {
    console.warn("[AION CLIENT CONTEXT] Falha ao preparar contexto do cliente:", error);
    return {
      source: "client-dexie",
      semanticResults: [],
      brainItems: [],
    };
  }
}
