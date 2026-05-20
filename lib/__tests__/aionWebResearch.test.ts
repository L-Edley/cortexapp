import { describe, it, expect, vi, beforeEach } from "vitest";
import { shouldUseWebResearch, runWebResearch, classifyQueryForWebResearch, summarizeWebSources } from "../aionWebResearch";
import { classifyLearningNeed } from "../aionKnowledgeGap";

const mockCallWithFallback = vi.hoisted(() => vi.fn());
const mockGetCachedSearch = vi.hoisted(() => vi.fn());
const mockSaveCachedSearch = vi.hoisted(() => vi.fn());
const mockSaveKnowledge = vi.hoisted(() => vi.fn());

vi.mock("@/lib/aionLLM", () => ({
  callWithFallback: mockCallWithFallback,
}));

vi.mock("@/lib/aion/brain/searchCache", () => ({
  getCachedSearch: mockGetCachedSearch,
  saveCachedSearch: mockSaveCachedSearch,
}));

vi.mock("@/lib/aion/brain/knowledge", () => ({
  saveKnowledge: mockSaveKnowledge,
}));

vi.mock("@/lib/aion/brain/brainStore", () => ({
  generateId: vi.fn(() => "test-id-123"),
  getBrainDB: vi.fn(),
  isBrainAvailable: vi.fn(() => true),
}));

function setWebProvider(provider: string) {
  process.env.WEB_SEARCH_PROVIDER = provider;
}

function clearWebProvider() {
  delete process.env.WEB_SEARCH_PROVIDER;
  delete process.env.TAVILY_API_KEY;
}

describe("shouldUseWebResearch", () => {
  it("fresh_info precisa de web research", () => {
    expect(shouldUseWebResearch("preço do dólar hoje", "fresh_info")).toBe(true);
  });

  it("trend precisa de web research", () => {
    expect(shouldUseWebResearch("novidades sobre IA", "trend")).toBe(true);
  });

  it("stable_knowledge não precisa de web por padrão", () => {
    expect(shouldUseWebResearch("o que é PWA", "stable_knowledge")).toBe(false);
  });

  it("task/memory/ignore não usa web", () => {
    expect(shouldUseWebResearch("salve que sou dev", "personal_memory")).toBe(false);
    expect(shouldUseWebResearch("bom dia", "ignore")).toBe(false);
    expect(shouldUseWebResearch("", "ignore")).toBe(false);
  });

  it("project_decision não usa web", () => {
    expect(shouldUseWebResearch("decidimos usar Dexie", "project_decision")).toBe(false);
  });

  it("Official Doctrine não usa web", () => {
    expect(shouldUseWebResearch("obsidian e o banco principal", "already_known")).toBe(false);
  });

  it("strategic_analysis não usa web por padrão", () => {
    expect(shouldUseWebResearch("como estruturar Night Research", "strategic_analysis")).toBe(false);
  });
});

describe("classifyQueryForWebResearch", () => {
  it("classifica fresh_info para queries de hoje/agora", () => {
    expect(classifyQueryForWebResearch("preço do dólar hoje")).toBe("fresh_info");
    expect(classifyQueryForWebResearch("cotação do Bitcoin")).toBe("fresh_info");
  });

  it("classifica trend para novidades/tendências", () => {
    expect(classifyQueryForWebResearch("novidades sobre IA agents")).toBe("trend");
    expect(classifyQueryForWebResearch("tendências de front-end")).toBe("trend");
  });

  it("classifica project_opportunity para oportunidades", () => {
    expect(classifyQueryForWebResearch("oportunidade de mercado em IA")).toBe("project_opportunity");
  });

  it("default para stable_knowledge", () => {
    expect(classifyQueryForWebResearch("o que é TypeScript")).toBe("stable_knowledge");
  });
});

describe("runWebResearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWebProvider();
    mockCallWithFallback.mockResolvedValue({ text: "Resumo das fontes: IA está avançando.", providerUsed: "groq" });
    mockGetCachedSearch.mockResolvedValue(null);
    mockSaveCachedSearch.mockResolvedValue(true);
    mockSaveKnowledge.mockResolvedValue(true);
  });

  it("sem provider configurado, retorna fallback honesto", async () => {
    const result = await runWebResearch("preço do dólar hoje");

    expect(result.webResearchUsed).toBe(false);
    expect(result.webSearchProvider).toBe("none");
    expect(result.webResearchSkippedReason).toContain("Nenhum provedor de busca web configurado");
    expect(result.summary).toBe("");
    expect(result.sources).toEqual([]);
  });

  it("cache válido evita chamada ao provider", async () => {
    mockGetCachedSearch.mockResolvedValueOnce("Resposta do cache");

    const result = await runWebResearch("novidades sobre IA");

    expect(result.cacheHit).toBe(true);
    expect(result.summary).toBe("Resposta do cache");
    expect(mockCallWithFallback).not.toHaveBeenCalled();
  });

  it("fresh_info com manual_mock provider faz pesquisa e salva", async () => {
    setWebProvider("manual_mock");
    mockCallWithFallback.mockResolvedValueOnce({ text: "Dólar está a R$5,20 hoje.", providerUsed: "groq" });

    const result = await runWebResearch("preço do dólar hoje");

    expect(result.webResearchUsed).toBe(true);
    expect(result.webSearchProvider).toBe("manual_mock");
    expect(result.sourcesCount).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
    expect(mockCallWithFallback).toHaveBeenCalled();
    expect(mockSaveCachedSearch).toHaveBeenCalled();
  });

  it("trend com manual_mock salva em knowledge também", async () => {
    setWebProvider("manual_mock");
    mockCallWithFallback.mockResolvedValueOnce({ text: "Novas tendências em agentes de IA.", providerUsed: "groq" });

    const result = await runWebResearch("novidades sobre agentes de IA");

    expect(result.webResearchUsed).toBe(true);
    expect(result.learningType).toBe("trend");
    expect(result.sourcesCount).toBeGreaterThan(0);
    expect(mockSaveCachedSearch).toHaveBeenCalled();
    // trend deve salvar em knowledge também
    expect(mockSaveKnowledge).toHaveBeenCalled();
  });

  it("fresh_info tem cacheHit false quando não há cache", async () => {
    setWebProvider("manual_mock");

    const result = await runWebResearch("preço do dólar");

    expect(result.cacheHit).toBe(false);
  });

  it("resultado contém sources quando provider retorna", async () => {
    setWebProvider("manual_mock");

    const result = await runWebResearch("preço do dólar hoje");

    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]).toHaveProperty("title");
    expect(result.sources[0]).toHaveProperty("url");
    expect(result.sources[0]).toHaveProperty("snippet");
  });

  it("não responde 'pesquisei' quando não houve web search", async () => {
    const result = await runWebResearch("preço do dólar hoje");

    expect(result.webResearchUsed).toBe(false);
    expect(result.summary).toBe("");
  });

  it("forceFresh ignora cache", async () => {
    setWebProvider("manual_mock");
    mockGetCachedSearch.mockResolvedValueOnce("Resposta velha do cache");

    const result = await runWebResearch("preço do dólar hoje", { forceFresh: true });

    expect(result.cacheHit).toBe(false);
    expect(mockGetCachedSearch).not.toHaveBeenCalled();
  });
});

describe("summarizeWebSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna string vazia para sources vazias", async () => {
    const result = await summarizeWebSources("teste", []);
    expect(result).toBe("");
  });

  it("chama LLM para resumir sources", async () => {
    mockCallWithFallback.mockResolvedValueOnce({ text: "Resumo conciso.", providerUsed: "groq" });

    const result = await summarizeWebSources("teste", [
      { title: "Fonte 1", url: "https://exemplo.com", snippet: "Conteúdo da fonte" },
    ]);

    expect(result).toBe("Resumo conciso.");
    expect(mockCallWithFallback).toHaveBeenCalled();
  });
});

describe("Integração com classifyLearningNeed", () => {
  it("classifyLearningNeed identifica fresh_info", () => {
    expect(classifyLearningNeed("preço atual do dólar")).toBe("fresh_info");
  });

  it("classifyLearningNeed identifica trend", () => {
    expect(classifyLearningNeed("novidades sobre agentes de IA")).toBe("trend");
  });

  it("shouldUseWebResearch e classifyLearningNeed combinam para trend", () => {
    const need = classifyLearningNeed("novidades sobre agentes de IA");
    expect(need).toBe("trend");
    expect(shouldUseWebResearch("novidades sobre agentes de IA", need)).toBe(true);
  });

  it("shouldUseWebResearch e classifyLearningNeed combinam para fresh_info", () => {
    const need = classifyLearningNeed("preço atual do dólar");
    expect(need).toBe("fresh_info");
    expect(shouldUseWebResearch("preço atual do dólar", need)).toBe(true);
  });

  it("task/memory não ativa web research mesmo com classifyLearningNeed", () => {
    expect(classifyLearningNeed("bom dia")).toBe("ignore");
    expect(shouldUseWebResearch("bom dia", "ignore")).toBe(false);
  });
});
