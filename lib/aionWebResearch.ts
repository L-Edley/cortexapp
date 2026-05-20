import type { LearningNeed } from "./aionKnowledgeGap";
import { getConfiguredProvider, type AionWebSource } from "./aionWebSearchProvider";
import { callWithFallback } from "@/lib/aionLLM";
import { getCachedSearch, saveCachedSearch } from "@/lib/aion/brain/searchCache";
import { saveKnowledge } from "@/lib/aion/brain/knowledge";
import { generateId } from "@/lib/aion/brain/brainStore";

// ─── Types ───

export type WebResearchLearningType = "fresh_info" | "trend" | "stable_knowledge" | "project_opportunity";

export interface AionWebResearchResult {
  query: string;
  summary: string;
  sources: AionWebSource[];
  fetchedAt: string;
  confidence: number;
  learningType: WebResearchLearningType;
  webResearchUsed: boolean;
  webSearchProvider: string;
  sourcesCount: number;
  cacheHit: boolean;
  webResearchSkippedReason?: string;
}

export interface AionWebResearchOptions {
  maxSources?: number;
  forceFresh?: boolean;
}

// ─── Helpers ───

function getExpiryForType(type: WebResearchLearningType): string {
  const now = new Date();
  switch (type) {
    case "fresh_info":
      now.setHours(now.getHours() + 4);
      break;
    case "trend":
      now.setDate(now.getDate() + 15);
      break;
    case "project_opportunity":
      now.setDate(now.getDate() + 30);
      break;
    default:
      now.setDate(now.getDate() + 90);
  }
  return now.toISOString();
}

// ─── Main Functions ───

export function shouldUseWebResearch(input: string, learningNeed: LearningNeed): boolean {
  if (!input || input.trim().length === 0) return false;

  switch (learningNeed) {
    case "fresh_info":
    case "trend":
      return true;
    case "stable_knowledge":
      // stable_knowledge pode usar LLM puro por padrão
      return false;
    case "strategic_analysis":
      // Análise estratégica pode se beneficiar, mas não é obrigatório
      return false;
    default:
      // project_decision, personal_memory, already_known, ignore → não usa web
      return false;
  }
}

export async function runWebResearch(
  query: string,
  options?: AionWebResearchOptions
): Promise<AionWebResearchResult> {
  const now = new Date().toISOString();
  const learningType = classifyQueryForWebResearch(query);
  const emptyResult: AionWebResearchResult = {
    query,
    summary: "",
    sources: [],
    fetchedAt: now,
    confidence: 0,
    learningType,
    webResearchUsed: false,
    webSearchProvider: "none",
    sourcesCount: 0,
    cacheHit: false,
  };

  // 1. Check cache (unless forceFresh)
  if (!options?.forceFresh) {
    try {
      const cached = await getCachedSearch(query);
      if (cached) {
        return {
          ...emptyResult,
          summary: cached,
          webResearchUsed: true,
          webSearchProvider: "cache",
          sourcesCount: 0,
          cacheHit: true,
          confidence: 0.9,
        };
      }
    } catch {
      // cache unavailable
    }
  }

  // 2. Check if a web search provider is configured
  const provider = getConfiguredProvider();
  if (!provider) {
    return {
      ...emptyResult,
      webResearchSkippedReason: "Nenhum provedor de busca web configurado (WEB_SEARCH_PROVIDER=none). Defina TAVILY_API_KEY, BRAVE_SEARCH_API_KEY ou SERPER_API_KEY.",
    };
  }

  // 3. Run web search
  try {
    const maxSources = options?.maxSources ?? 5;
    const searchResult = await provider.search(query, { maxResults: maxSources });

    if (!searchResult.sources || searchResult.sources.length === 0) {
      return {
        ...emptyResult,
        webResearchUsed: true,
        webSearchProvider: provider.name,
        sourcesCount: 0,
        webResearchSkippedReason: "A busca não retornou resultados.",
      };
    }

    // 4. Use LLM to summarize sources
    const summary = await summarizeWebSources(query, searchResult.sources);

    // 5. Save result
    const result: AionWebResearchResult = {
      query,
      summary,
      sources: searchResult.sources,
      fetchedAt: now,
      confidence: 0.85,
      learningType,
      webResearchUsed: true,
      webSearchProvider: provider.name,
      sourcesCount: searchResult.sources.length,
      cacheHit: false,
    };

    await saveWebResearchResult(result);
    return result;
  } catch (err: any) {
    return {
      ...emptyResult,
      webResearchUsed: true,
      webSearchProvider: provider.name,
      sourcesCount: 0,
      webResearchSkippedReason: `Erro na busca web: ${err?.message || "desconhecido"}`,
    };
  }
}

export function classifyQueryForWebResearch(query: string): WebResearchLearningType {
  const normalized = query.toLowerCase();
  if (/\b(hoje|agora|atual|pre[cç]o\s+atual|cota[cç][aã]o|clima)\b/i.test(normalized)) {
    return "fresh_info";
  }
  if (/\b(novidades|tend[eê]ncias|futuro|not[ií]cias)\b/i.test(normalized)) {
    return "trend";
  }
  if (/\b(oportunidade|mercado|investir|lan[cç]amento)\b/i.test(normalized)) {
    return "project_opportunity";
  }
  return "stable_knowledge";
}

export async function summarizeWebSources(
  query: string,
  sources: AionWebSource[]
): Promise<string> {
  if (sources.length === 0) return "";

  const sourcesText = sources
    .map(
      (s, i) =>
        `${i + 1}. "${s.title}"\n   URL: ${s.url}\n   Resumo: ${s.snippet || "Sem resumo"}${s.sourceName ? `\n   Fonte: ${s.sourceName}` : ""}`
    )
    .join("\n\n");

  const systemPrompt = `Você é um assistente de pesquisa que resume fontes da web de forma objetiva e estratégica.
Sempre cite as fontes usando o número entre parênteses, ex: (1) (2).
Seja conciso (máximo 4 parágrafos).
Responda em português do Brasil.`;

  const userPrompt = `Pesquisa: "${query}"

FONTES ENCONTRADAS:
${sourcesText}

Com base APENAS nas fontes acima, forneça um resumo objetivo.`;

  try {
    const result = await callWithFallback(userPrompt, systemPrompt);
    return result?.text || "Não foi possível resumir as fontes.";
  } catch {
    // If LLM fails, return a concatenation of snippets
    return sources
      .map((s) => `${s.title}: ${s.snippet || "Sem resumo"}`)
      .join("\n");
  }
}

export async function saveWebResearchResult(result: AionWebResearchResult): Promise<boolean> {
  if (!result.summary || result.summary.length < 10) return false;
  if (!result.webResearchUsed) return false;

  const expiresAt = getExpiryForType(result.learningType);

  // Save to searchCache for quick lookup
  try {
    await saveCachedSearch(
      result.query,
      result.summary,
      ["web_research", result.learningType],
      expiresAt
    );
  } catch {
    // cache save failure is non-critical
  }

  // Save to knowledge for trend/project_opportunity
  if (result.learningType === "trend" || result.learningType === "project_opportunity") {
    try {
      await saveKnowledge({
        id: generateId(),
        type: "research",
        title: result.query.slice(0, 80),
        content: result.summary,
        tags: [result.learningType, "web_research", ...result.sources.map((s) => s.sourceName || "web").filter(Boolean)],
        source: "web",
        confidence: result.confidence,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt,
      });
    } catch {
      // non-critical
    }
  }

  return true;
}
