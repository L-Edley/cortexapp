import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLearningEngine, shouldSaveLearning, classifyProviderLearning } from "../aionLearningEngine";
import { classifyLearningNeed, detectKnowledgeGap, shouldUseLearningEngine } from "../aionKnowledgeGap";

const mockCallWithFallback = vi.hoisted(() => vi.fn());
const mockSaveKnowledge = vi.hoisted(() => vi.fn());
const mockSaveMemory = vi.hoisted(() => vi.fn());
const mockSaveCachedSearch = vi.hoisted(() => vi.fn());
const mockGetCachedSearch = vi.hoisted(() => vi.fn());

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

  describe("Learning Engine Execution", () => {
    it("cache válido evita chamada ao provider", async () => {
      mockGetCachedSearch.mockResolvedValueOnce("Resposta do cache");
      const result = await runLearningEngine("novidades sobre IA");
      
      expect(result?.source).toBe("cache");
      expect(result?.reply).toBe("Resposta do cache");
      expect(mockCallWithFallback).not.toHaveBeenCalled();
    });

    it("fresh_info chama provider e salva no searchCache", async () => {
      mockGetCachedSearch.mockResolvedValueOnce(null); // Cache miss
      mockCallWithFallback.mockResolvedValueOnce({ text: "Dólar está a 5 reais", providerUsed: "groq" });
      mockSaveCachedSearch.mockResolvedValueOnce(true);

      const result = await runLearningEngine("preço atual do dólar");
      expect(result?.source).toBe("provider");
      expect(result?.learningSaved).toBe(true);
      expect(result?.learningType).toBe("fresh_info");
      expect(mockSaveCachedSearch).toHaveBeenCalledWith(
        "preço atual do dólar",
        "Dólar está a 5 reais",
        ["fresh_info", "learning_engine"],
        expect.any(String) // expiresAt date
      );
      expect(mockSaveKnowledge).not.toHaveBeenCalled();
    });

    it("strategic_analysis salva permanentemente em knowledge", async () => {
      mockCallWithFallback.mockResolvedValueOnce({ text: "Use Workers", providerUsed: "groq" });
      const result = await runLearningEngine("como estruturar Night Research?");
      
      expect(result?.learningType).toBe("strategic_analysis");
      expect(mockSaveKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "decision",
          tags: ["strategy", "analysis", "learning_engine"],
        })
      );
    });

    it("project_decision salva em memory", async () => {
      mockCallWithFallback.mockResolvedValueOnce({ text: "Perfeito, vou usar Dexie.", providerUsed: "groq" });
      const result = await runLearningEngine("decidimos usar Dexie");
      
      expect(result?.learningType).toBe("project_decision");
      expect(mockSaveMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "project_context",
          tags: ["decision", "learning_engine"],
        })
      );
    });

    it("trend salva em knowledge temporariamente (expiresAt)", async () => {
      mockGetCachedSearch.mockResolvedValueOnce(null);
      mockCallWithFallback.mockResolvedValueOnce({ text: "Novas libs em alta", providerUsed: "groq" });
      
      const result = await runLearningEngine("tendências de front-end");
      expect(result?.learningType).toBe("trend");
      
      expect(mockSaveKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "research",
          tags: ["trend", "learning_engine"],
          expiresAt: expect.any(String) // TTL exists
        })
      );
    });
  });
});
