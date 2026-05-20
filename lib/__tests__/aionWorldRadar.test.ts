import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWorldRadar, researchTopic } from "../aionWorldRadar";
import { getDefaultResearchTopics, shouldCheckTopic, updateResearchTopic } from "../aionResearchTopics";
import * as aionWebResearch from "../aionWebResearch";

const mockRunWebResearch = vi.fn();
vi.spyOn(aionWebResearch, "runWebResearch").mockImplementation(mockRunWebResearch);

vi.mock("@/lib/aionResearchTopics", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getEnabledResearchTopics: vi.fn(() => actual.getDefaultResearchTopics()),
    updateResearchTopic: vi.fn(),
  };
});

describe("Aion World Radar Base", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunWebResearch.mockResolvedValue({
      query: "test query",
      sources: [{ title: "Mock Source", url: "https://mock.com", snippet: "Mock snippet" }],
      summary: "Resumo web research",
      fetchedAt: new Date().toISOString(),
      confidence: 0.85,
      cacheHit: false,
      webResearchUsed: true,
      webSearchProvider: "manual_mock",
      sourcesCount: 1,
      webResearchSkippedReason: null,
      learningType: "trend",
    });
  });

  describe("Topic Management", () => {
    it("cria tópicos padrão com categorias corretas", () => {
      const defaultTopics = getDefaultResearchTopics();
      expect(defaultTopics.length).toBeGreaterThan(5);
      expect(defaultTopics.some(t => t.title === "IA agents")).toBe(true);
      expect(defaultTopics.some(t => t.title === "Next.js")).toBe(true);
    });

    it("shouldCheckTopic respeita frequencia weekly", () => {
      const topic = getDefaultResearchTopics().find(t => t.frequency === "weekly")!;
      expect(topic).toBeDefined();

      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      expect(shouldCheckTopic(topic)).toBe(true);
      expect(shouldCheckTopic({ ...topic, lastCheckedAt: ontem.toISOString() })).toBe(false);

      const passado = new Date();
      passado.setDate(passado.getDate() - 8);
      expect(shouldCheckTopic({ ...topic, lastCheckedAt: passado.toISOString() })).toBe(true);
    });

    it("shouldCheckTopic respeita frequencia daily", () => {
      const topic = { ...getDefaultResearchTopics()[0], frequency: "daily" as const };

      const dozeHorasAtras = new Date();
      dozeHorasAtras.setHours(dozeHorasAtras.getHours() - 12);
      expect(shouldCheckTopic({ ...topic, lastCheckedAt: dozeHorasAtras.toISOString() })).toBe(false);

      const vinteCincoHorasAtras = new Date();
      vinteCincoHorasAtras.setHours(vinteCincoHorasAtras.getHours() - 25);
      expect(shouldCheckTopic({ ...topic, lastCheckedAt: vinteCincoHorasAtras.toISOString() })).toBe(true);
    });
  });

  describe("Execution", () => {
    it("researchTopic chama web research, salva e atualiza lastCheckedAt", async () => {
      const topic = getDefaultResearchTopics()[0];
      const result = await researchTopic(topic);

      expect(result.success).toBe(true);
      expect(result.learningSaved).toBe(true);
      expect(mockRunWebResearch).toHaveBeenCalledWith(topic.query);
      expect(updateResearchTopic).toHaveBeenCalledWith(topic.id, { lastCheckedAt: expect.any(String) });
    });

    it("researchTopic retorna falha honesta quando web research é skipped", async () => {
      mockRunWebResearch.mockResolvedValueOnce({
        query: "",
        sources: [],
        summary: "",
        fetchedAt: new Date().toISOString(),
        confidence: 0,
        cacheHit: false,
        webResearchUsed: false,
        webSearchProvider: "none",
        sourcesCount: 0,
        webResearchSkippedReason: "Nenhum provedor de busca web configurado",
        learningType: "fresh_info",
      });

      const topic = getDefaultResearchTopics()[0];
      const result = await researchTopic(topic);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Nenhum provedor de busca web configurado");
    });

    it("researchTopic retorna erro quando web research não retorna summary", async () => {
      mockRunWebResearch.mockResolvedValueOnce({
        query: "",
        sources: [],
        summary: "",
        fetchedAt: new Date().toISOString(),
        confidence: 0,
        cacheHit: false,
        webResearchUsed: true,
        webSearchProvider: "manual_mock",
        sourcesCount: 0,
        webResearchSkippedReason: null,
        learningType: "trend",
      });

      const topic = getDefaultResearchTopics()[0];
      const result = await researchTopic(topic);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Empty research result");
    });

    it("researchTopic inclui debug info no resultado", async () => {
      const topic = getDefaultResearchTopics()[0];
      const result = await researchTopic(topic);

      expect(result.debug).toBeDefined();
      expect(result.debug?.webResearchUsed).toBe(true);
      expect(result.debug?.webSearchProvider).toBe("manual_mock");
      expect(result.debug?.sourcesCount).toBe(1);
    });

    it("runWorldRadar respeita o maxTopics", async () => {
      const results = await runWorldRadar({ forceAll: true, maxTopics: 2 });
      expect(results.length).toBe(2);
      expect(mockRunWebResearch).toHaveBeenCalledTimes(2);
    });

    it("runWorldRadar ignora tópicos manuais via shouldCheckTopic", async () => {
      const topicManual = { ...getDefaultResearchTopics()[0], frequency: "manual" as const, enabled: true };
      expect(shouldCheckTopic(topicManual)).toBe(false);
    });
  });
});
