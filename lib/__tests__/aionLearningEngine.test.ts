import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLearningEngine } from "../aionLearningEngine";
import { classifyLearningNeed, shouldUseLearningEngine } from "../aionKnowledgeGap";
import {
  shouldSaveLearning,
  checkLearningCache,
  learnFromProviderResponse,
} from "../aionLearningEngine.client";

const mockCallWithFallback = vi.hoisted(() => vi.fn());
const mockSaveKnowledge = vi.hoisted(() => vi.fn());
const mockSaveMemory = vi.hoisted(() => vi.fn());
const mockSaveCachedSearch = vi.hoisted(() => vi.fn());
const mockGetCachedSearch = vi.hoisted(() => vi.fn());

const mockShouldUseWebResearch = vi.hoisted(() => vi.fn(() => false));
const mockRunWebResearch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/aionWebResearch", () => ({
  shouldUseWebResearch: mockShouldUseWebResearch,
  runWebResearch: mockRunWebResearch,
  classifyQueryForWebResearch: vi.fn(),
  summarizeWebSources: vi.fn(),
}));

vi.mock("@/lib/aionLLM", () => ({
  callWithFallback: mockCallWithFallback,
}));

vi.mock("@/lib/aion/brain/knowledge", () => ({
  saveKnowledge: mockSaveKnowledge,
}));

vi.mock("@/lib/aion/brain/memory", () => ({
  saveMemory: mockSaveMemory,
}));

vi.mock("@/lib/aion/brain/searchCache", () => ({
  saveCachedSearch: mockSaveCachedSearch,
  getCachedSearch: mockGetCachedSearch,
}));

vi.mock("@/lib/aionWebSearchProvider", () => ({
  getConfiguredProvider: vi.fn(() => ({ name: "manual_mock", search: vi.fn() })),
}));

describe("Aion Knowledge Gap & Learning Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallWithFallback.mockResolvedValue({ text: "Mocked response", providerUsed: "groq" });
  });

  describe("Knowledge Gap Detection", () => {
    it("ignora saudações e short inputs", () => {
      expect(classifyLearningNeed("bom dia")).toBe("ignore");
      expect(shouldUseLearningEngine("bom dia")).toBe(false);
    });

    it("ignora comandos de tarefas/gastos", () => {
      expect(classifyLearningNeed("me lembra de pagar internet amanhã")).toBe("ignore");
      expect(classifyLearningNeed("gastei 5 reais em café")).toBe("ignore");
      expect(shouldUseLearningEngine("gastei 5 reais")).toBe(false);
    });

    it("classifica memorias pessoais para delegar ao router nativo sem groq", () => {
      expect(classifyLearningNeed("salve que sou desenvolvedor")).toBe("personal_memory");
      expect(shouldUseLearningEngine("salve que sou desenvolvedor")).toBe(false);
    });

    it("identifica doutrina oficial como already_known", () => {
      expect(classifyLearningNeed("obsidian e o banco principal")).toBe("already_known");
      expect(shouldUseLearningEngine("obsidian e o banco principal")).toBe(false);
    });

    it("detecta perguntas estratégicas", () => {
      expect(classifyLearningNeed("como estruturar Night Research?")).toBe("strategic_analysis");
      expect(shouldUseLearningEngine("como estruturar Night Research?")).toBe(true);
    });

    it("detecta perguntas de tendências e atualidades", () => {
      expect(classifyLearningNeed("novidades sobre agentes de IA")).toBe("trend");
      expect(classifyLearningNeed("preço atual do dólar")).toBe("fresh_info");
      expect(shouldUseLearningEngine("preço atual do dólar")).toBe(true);
    });

    it("detecta project decisions", () => {
      expect(classifyLearningNeed("decidimos usar o Dexie como banco local")).toBe("project_decision");
      expect(shouldUseLearningEngine("decidimos usar o Dexie como banco local")).toBe(true);
    });
  });

  describe("Security Filters", () => {
    it("não salva tokens, senhas ou cartões", () => {
      expect(shouldSaveLearning("qual é minha senha?", "sua senha é 12345")).toBe(false);
      expect(shouldSaveLearning("api_key do groq", "gsk_1234abcd")).toBe(false);
      expect(shouldSaveLearning("meu cartão", "seu cartão é 4111")).toBe(false);
      expect(shouldSaveLearning("qual o conceito de PWA?", "PWA é Progressive Web App...")).toBe(true);
    });
  });

  describe("Client Save Functions", () => {
    it("checkLearningCache retorna null quando não há cache", async () => {
      mockGetCachedSearch.mockResolvedValueOnce(null);
      const cached = await checkLearningCache("novidades sobre IA", "trend");
      expect(cached).toBeNull();
    });

    it("checkLearningCache retorna valor quando cache existe", async () => {
      mockGetCachedSearch.mockResolvedValueOnce("Resposta do cache");
      const cached = await checkLearningCache("novidades sobre IA", "trend");
      expect(cached).toBe("Resposta do cache");
    });

    it("learnFromProviderResponse salva fresh_info no searchCache", async () => {
      mockSaveCachedSearch.mockResolvedValueOnce(true);
      const saved = await learnFromProviderResponse("preço atual do dólar", "Dólar está a 5 reais", "fresh_info");

      expect(saved).toBe(true);
      expect(mockSaveCachedSearch).toHaveBeenCalledWith(
        "preço atual do dólar",
        "Dólar está a 5 reais",
        ["fresh_info", "learning_engine"],
        expect.any(String)
      );
      expect(mockSaveKnowledge).not.toHaveBeenCalled();
    });

    it("learnFromProviderResponse salva strategic_analysis em knowledge", async () => {
      mockSaveKnowledge.mockResolvedValueOnce(true);
      const saved = await learnFromProviderResponse("como estruturar Night Research?", "Use Workers", "strategic_analysis");

      expect(saved).toBe(true);
      expect(mockSaveKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "decision",
          tags: ["strategy", "analysis", "learning_engine"],
        })
      );
    });

    it("learnFromProviderResponse salva project_decision em memory", async () => {
      mockSaveMemory.mockResolvedValueOnce(true);
      const saved = await learnFromProviderResponse("decidimos usar Dexie", "Perfeito, vou usar Dexie.", "project_decision");

      expect(saved).toBe(true);
      expect(mockSaveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "project_context",
          tags: ["decision", "learning_engine"],
        })
      );
    });

    it("learnFromProviderResponse salva trend em knowledge com expiresAt", async () => {
      mockSaveKnowledge.mockResolvedValueOnce(true);
      const saved = await learnFromProviderResponse("tendências de front-end", "Novas libs em alta", "trend");

      expect(saved).toBe(true);
      expect(mockSaveKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "research",
          tags: ["trend", "learning_engine"],
          expiresAt: expect.any(String),
        })
      );
    });

    it("learnFromProviderResponse rejeita conteúdo sensível", async () => {
      const saved = await learnFromProviderResponse("qual é minha senha?", "sua senha é 12345", "fresh_info");
      expect(saved).toBe(false);
      expect(mockSaveCachedSearch).not.toHaveBeenCalled();
    });
  });

  describe("Server runLearningEngine", () => {
    it("delega ao LLM provider para stable_knowledge", async () => {
      mockCallWithFallback.mockResolvedValueOnce({ text: "PWA é Progressive Web App", providerUsed: "groq" });
      const result = await runLearningEngine("o que é PWA?");

      expect(result).not.toBeNull();
      expect(result?.reply).toBe("PWA é Progressive Web App");
      expect(result?.source).toBe("provider");
      expect(result?.learningSaved).toBe(false);
    });

    it("retorna fallback honesto quando web research não tem provider configurado para fresh_info", async () => {
      mockShouldUseWebResearch.mockReturnValueOnce(true);
      mockRunWebResearch.mockResolvedValueOnce({
        query: "preço atual do dólar",
        sources: [],
        summary: "",
        fetchedAt: new Date().toISOString(),
        confidence: 0,
        learningType: "fresh_info",
        webResearchUsed: false,
        webSearchProvider: "none",
        sourcesCount: 0,
        cacheHit: false,
        webResearchSkippedReason: "Nenhum provedor de busca web configurado",
      });

      const result = await runLearningEngine("preço atual do dólar");

      expect(result).not.toBeNull();
      expect(result?.debug?.webResearchSkippedReason).toContain("Nenhum provedor de busca web configurado");
      expect(result?.providerUsed).toBe("web-research");
    });

    it("usa web research para fresh_info quando provider configurado", async () => {
      mockShouldUseWebResearch.mockReturnValueOnce(true);
      mockRunWebResearch.mockResolvedValueOnce({
        query: "preço atual do dólar",
        sources: [{ title: "Fonte", url: "https://exemplo.com", snippet: "Dólar a 5,20" }],
        summary: "Dólar está a R$5,20 hoje.",
        fetchedAt: new Date().toISOString(),
        confidence: 0.85,
        learningType: "fresh_info",
        webResearchUsed: true,
        webSearchProvider: "manual_mock",
        sourcesCount: 1,
        cacheHit: false,
        webResearchSkippedReason: null,
      });

      const result = await runLearningEngine("preço atual do dólar");

      expect(result).not.toBeNull();
      expect(result?.reply).toBe("Dólar está a R$5,20 hoje.");
      expect(result?.source).toBe("provider");
      expect(result?.debug?.webResearchUsed).toBe(true);
    });

    it("usa LLM provider para strategic_analysis (sem web research)", async () => {
      mockCallWithFallback.mockResolvedValueOnce({ text: "Use Workers para tasks noturnas", providerUsed: "groq" });
      const result = await runLearningEngine("como estruturar Night Research?");

      expect(result).not.toBeNull();
      expect(result?.reply).toBe("Use Workers para tasks noturnas");
      expect(result?.providerUsed).toBe("groq");
    });

    it("retorna null quando LLM falha", async () => {
      mockCallWithFallback.mockResolvedValueOnce({ text: null, providerUsed: "none" });
      const result = await runLearningEngine("o que é PWA?");
      expect(result).toBeNull();
    });

    it("aplica guardrails anti-MMORPG quando detecta confusão de projeto", async () => {
      mockCallWithFallback.mockResolvedValueOnce({ text: "Night Research é uma skill de caçador noturno no MMORPG.", providerUsed: "groq" });
      const result = await runLearningEngine("o que é Night Research?");

      expect(result).not.toBeNull();
      expect(result?.reply).toContain("O Aion é a assistente inteligente do Cortex");
      expect(result?.providerUsed).toBe("grounding-guardrail");
    });
  });
});
