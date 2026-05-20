import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWorldRadar, researchTopic } from "../aionWorldRadar";
import { getDefaultResearchTopics, shouldCheckTopic, updateResearchTopic } from "../aionResearchTopics";
import * as LearningEngine from "../aionLearningEngine";

const mockAskProviderForLearning = vi.spyOn(LearningEngine, "askProviderForLearning");
const mockLearnFromProviderResponse = vi.spyOn(LearningEngine, "learnFromProviderResponse");

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
    mockAskProviderForLearning.mockResolvedValue({ text: "Resultado da pesquisa", providerUsed: "groq" });
    mockLearnFromProviderResponse.mockResolvedValue(true);
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

      // Sem lastCheckedAt, deve checar
      expect(shouldCheckTopic(topic)).toBe(true);

      // Com lastCheckedAt recente (1 dia atrás)
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      expect(shouldCheckTopic({ ...topic, lastCheckedAt: ontem.toISOString() })).toBe(false);

      // Com lastCheckedAt antigo (8 dias atrás)
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
    it("researchTopic chama provider, salva e atualiza lastCheckedAt", async () => {
      const topic = getDefaultResearchTopics()[0];
      const result = await researchTopic(topic);

      expect(result.success).toBe(true);
      expect(result.learningSaved).toBe(true);
      expect(mockAskProviderForLearning).toHaveBeenCalledWith(topic.query, expect.any(String));
      expect(mockLearnFromProviderResponse).toHaveBeenCalled();
      expect(updateResearchTopic).toHaveBeenCalledWith(topic.id, { lastCheckedAt: expect.any(String) });
    });

    it("runWorldRadar respeita o maxTopics", async () => {
      // Force all true for testing
      const results = await runWorldRadar({ forceAll: true, maxTopics: 2 });
      expect(results.length).toBe(2);
      expect(mockAskProviderForLearning).toHaveBeenCalledTimes(2);
    });

    it("runWorldRadar ignora tópicos manuais via shouldCheckTopic", async () => {
      const topicManual = { ...getDefaultResearchTopics()[0], frequency: "manual" as const, enabled: true };
      expect(shouldCheckTopic(topicManual)).toBe(false);
    });
  });
});
