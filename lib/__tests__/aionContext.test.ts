import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLoadProfile = vi.hoisted(() => vi.fn());
const mockGetLatestDailyInsight = vi.hoisted(() => vi.fn());
const mockGetRecords = vi.hoisted(() => vi.fn());
const mockRetrieveRelevantBrainContext = vi.hoisted(() => vi.fn());
const mockSemanticSearch = vi.hoisted(() => vi.fn());
const mockGetSystemPrompt = vi.hoisted(() => vi.fn());

vi.mock("@/lib/aionProfile", () => ({
  loadProfile: mockLoadProfile,
}));

vi.mock("@/lib/aion/patterns/runPatternAnalysis", () => ({
  getLatestDailyInsight: mockGetLatestDailyInsight,
}));

vi.mock("@/lib/storage", () => ({
  getRecords: mockGetRecords,
}));

vi.mock("@/lib/aion/brain/retrieval", () => ({
  retrieveRelevantBrainContext: mockRetrieveRelevantBrainContext,
}));

vi.mock("@/lib/aion/vector/semanticIndex", () => ({
  semanticSearch: mockSemanticSearch,
}));

vi.mock("@/lib/aion/systemPrompt", () => ({
  getSystemPrompt: mockGetSystemPrompt,
}));

vi.mock("@/lib/settings", () => ({
  getLocalStorage: vi.fn(() => null),
}));

function makeProfile(overrides?: Record<string, unknown>) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    userName: "Teste",
    energyPattern: [],
    behaviorTriggers: [],
    activeProjects: [{ name: "Projeto X", lastInteraction: "2026-05-19" }],
    categorySpending: [],
    consistentHabits: [],
    abandonedHabits: [],
    currentGoal: "Organizar finanças",
    lastFinancialReview: null,
    lastGoalReview: null,
    ...overrides,
  };
}

function makeDailyInsight() {
  return {
    date: "2026-05-19",
    summary: "Dia produtivo com foco em tarefas",
    financial: [
      {
        type: "spending_anomaly" as const,
        category: "alimentação",
        description: "Gastos acima da média com alimentação",
        currentValue: 150,
        severity: "medium" as const,
      },
    ],
    productivity: [
      {
        type: "completion_rate" as const,
        description: "80% das tarefas concluídas",
        value: 0.8,
      },
    ],
    habits: [],
    topPriority: "Revisar orçamento mensal",
    suggestion: "Que tal revisar seus gastos do mês?",
  };
}

function makeBrainItem(overrides?: Record<string, unknown>) {
  return {
    id: "brain-1",
    type: "user_preference" as const,
    title: "Preferência de horário",
    content: "Usuário prefere trabalhar pela manhã",
    tags: ["produtividade", "horário"],
    source: "user" as const,
    confidence: 0.9,
    createdAt: "2026-05-19",
    updatedAt: "2026-05-19",
    ...overrides,
  };
}

let mod: typeof import("@/lib/aionContext");

async function loadModule() {
  vi.resetModules();
  mod = await import("@/lib/aionContext");
  return mod;
}

describe("buildSessionContext", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSystemPrompt.mockReturnValue("Você é Aion, secretária executiva.");
    await loadModule();
  });

  it("retorna contexto mesmo com fontes vazias", async () => {
    mockLoadProfile.mockRejectedValue(new Error("no profile"));
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockRejectedValue(
      new Error("no brain")
    );
    mockSemanticSearch.mockRejectedValue(new Error("no vector"));

    const ctx = await mod.buildSessionContext("test message");

    expect(ctx.profile).toBeNull();
    expect(ctx.dailyInsight).toBeNull();
    expect(ctx.recentRecords).toEqual([]);
    expect(ctx.relevantBrainItems).toEqual([]);
    expect(ctx.semanticResults).toEqual([]);
    expect(ctx.currentDateTime).toBeTruthy();
    expect(ctx.systemState.totalRecords).toBe(0);
  });

  it("falha em semanticSearch não quebra contexto", async () => {
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockSemanticSearch.mockRejectedValue(new Error("vector store error"));

    const ctx = await mod.buildSessionContext("test");

    expect(ctx.profile).toBeTruthy();
    expect(ctx.semanticResults).toEqual([]);
    expect(ctx.relevantBrainItems).toEqual([]);
  });

  it("falha em retrieveRelevantBrainContext não quebra contexto", async () => {
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockRejectedValue(
      new Error("indexeddb error")
    );
    mockSemanticSearch.mockResolvedValue([]);

    const ctx = await mod.buildSessionContext("test");

    expect(ctx.profile).toBeTruthy();
    expect(ctx.relevantBrainItems).toEqual([]);
    expect(ctx.semanticResults).toEqual([]);
  });

  it("não envia embeddings no contexto", async () => {
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([makeBrainItem()]);
    mockSemanticSearch.mockResolvedValue([
      {
        sourceId: "src-1",
        text: "resultado semântico",
        type: "note",
      },
    ]);

    const ctx = await mod.buildSessionContext("test");

    for (const item of ctx.relevantBrainItems) {
      expect(item).not.toHaveProperty("embedding");
    }
    for (const result of ctx.semanticResults) {
      expect(result).not.toHaveProperty("embedding");
    }
  });

  it("limita registros recentes a 5", async () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      id: `rec-${i}`,
      type: "task" as const,
      title: `Tarefa ${i}`,
      priority: "medium" as const,
      project: null,
      amount: null,
      category: null,
      dueDate: null,
      nextAction: "",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    }));

    mockLoadProfile.mockRejectedValue(new Error("no profile"));
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockRejectedValue(
      new Error("no brain")
    );
    mockSemanticSearch.mockRejectedValue(new Error("no vector"));

    const ctx = await mod.buildSessionContext("test", {
      recentRecords: records,
    });

    expect(ctx.recentRecords.length).toBeLessThanOrEqual(5);
  });

  it("limita brainItems a 3", async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeBrainItem({ id: `brain-${i}`, title: `Item ${i}` })
    );

    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue(items);
    mockSemanticSearch.mockResolvedValue([]);

    const ctx = await mod.buildSessionContext("test");

    expect(ctx.relevantBrainItems.length).toBeLessThanOrEqual(3);
  });

  it("carrega profile e patterns corretamente", async () => {
    const profile = makeProfile({
      energyPattern: [
        { period: "manhã", label: "focado" },
        { period: "tarde", label: "produtivo" },
      ],
      behaviorTriggers: [
        { trigger: "cansaço", context: "ao final do dia", count: 5 },
      ],
    });

    mockLoadProfile.mockResolvedValue(profile);
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockSemanticSearch.mockResolvedValue([]);

    const ctx = await mod.buildSessionContext("test");

    expect(ctx.profile?.userName).toBe("Teste");
    expect(ctx.profile?.currentGoal).toBe("Organizar finanças");
    expect(ctx.patterns.energyPattern.length).toBe(2);
    expect(ctx.patterns.behaviorTriggers.length).toBe(1);
    expect(ctx.patterns.activeProjects.length).toBe(1);
  });

  it("carrega dailyInsight quando disponível", async () => {
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(makeDailyInsight());
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockSemanticSearch.mockResolvedValue([]);

    const ctx = await mod.buildSessionContext("test");

    expect(ctx.dailyInsight).toBeTruthy();
    expect(ctx.dailyInsight?.summary).toContain("Dia produtivo");
    expect(ctx.dailyInsight?.financial.length).toBe(1);
    expect(ctx.dailyInsight?.topPriority).toBe("Revisar orçamento mensal");
  });
});

describe("buildContextDebug", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSystemPrompt.mockReturnValue("Você é Aion.");
    mockLoadProfile.mockRejectedValue(new Error("no profile"));
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockRejectedValue(
      new Error("no brain")
    );
    mockSemanticSearch.mockRejectedValue(new Error("no vector"));
    await loadModule();
  });

  it("retorna contextUsed=true quando há dados", async () => {
    const ctx = await mod.buildSessionContext("test");
    ctx.profile = makeProfile() as any;
    ctx.recentRecords = [{ id: "1" } as any];
    ctx.relevantBrainItems = [makeBrainItem() as any];
    ctx.semanticResults = [{ sourceId: "s1" } as any];
    ctx.dailyInsight = makeDailyInsight() as any;

    const debug = mod.buildContextDebug(ctx);
    expect(debug.contextUsed).toBe(true);
    expect(debug.profileUsed).toBe(true);
    expect(debug.dailyInsightUsed).toBe(true);
    expect(debug.recentRecordsUsed).toBe(1);
    expect(debug.brainItemsUsed).toBe(1);
    expect(debug.semanticResultsUsed).toBe(1);
  });

  it("retorna contextUsed=false quando vazio", async () => {
    const ctx = await mod.buildSessionContext("test");

    const debug = mod.buildContextDebug(ctx);
    expect(debug.contextUsed).toBe(false);
    expect(debug.profileUsed).toBe(false);
    expect(debug.dailyInsightUsed).toBe(false);
    expect(debug.recentRecordsUsed).toBe(0);
    expect(debug.brainItemsUsed).toBe(0);
    expect(debug.semanticResultsUsed).toBe(0);
  });
});

describe("buildSystemPrompt", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSystemPrompt.mockReturnValue("Você é Aion, secretária executiva.");
    await loadModule();
  });

  it("inclui perfil e padrões quando existem", async () => {
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockSemanticSearch.mockResolvedValue([]);

    const ctx = await mod.buildSessionContext("test");
    const prompt = mod.buildSystemPrompt(ctx);

    expect(prompt).toContain("Aion");
    expect(prompt).toContain("Projeto X");
    expect(prompt).toContain("Organizar finanças");
    expect(prompt).toContain("REGRAS DE TOM");
    // Tone rule instructs no ALL CAPS in responses
    expect(prompt).toContain("NUNCA use ALL CAPS");
  });

  it("inclui regra contra ALL CAPS nas regras de tom", async () => {
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockSemanticSearch.mockResolvedValue([]);

    const ctx = await mod.buildSessionContext("test");
    const prompt = mod.buildSystemPrompt(ctx);

    // The prompt should contain the instruction about not using ALL CAPS
    expect(prompt).toContain("NUNCA use ALL CAPS");
    // Ensure the LLM instruction text contains the ALL CAPS rule
    const llmInstruction = prompt.split("REGRAS DE TOM:")[1] || "";
    expect(llmInstruction).toContain("NUNCA use ALL CAPS");
  });

  it("inclui dailyInsight quando disponível", async () => {
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(makeDailyInsight());
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockSemanticSearch.mockResolvedValue([]);

    const ctx = await mod.buildSessionContext("test");
    const prompt = mod.buildSystemPrompt(ctx);

    expect(prompt).toContain("DAILY INSIGHT");
    expect(prompt).toContain("80% das tarefas concluídas");
    expect(prompt).toContain("Revisar orçamento mensal");
  });

  it("inclui tone rules no final", async () => {
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockSemanticSearch.mockResolvedValue([]);

    const ctx = await mod.buildSessionContext("test");
    const prompt = mod.buildSystemPrompt(ctx);

    expect(prompt).toContain("REGRAS DE TOM");
    expect(prompt).toContain("ALL CAPS");
    expect(prompt).toContain("Não invente dados");
  });
});

describe("buildQueryPrompt", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSystemPrompt.mockReturnValue("Você é Aion.");
    mockLoadProfile.mockResolvedValue(makeProfile());
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockSemanticSearch.mockResolvedValue([]);
    await loadModule();
  });

  it("inclui mensagem do usuário", async () => {
    const ctx = await mod.buildSessionContext("minha mensagem");
    const prompt = mod.buildQueryPrompt("minha mensagem", ctx);

    expect(prompt).toContain("minha mensagem");
    expect(prompt).toContain("MENSAGEM DO USUÁRIO");
  });

  it("inclui formato JSON esperado", async () => {
    const ctx = await mod.buildSessionContext("teste");
    const prompt = mod.buildQueryPrompt("teste", ctx);

    expect(prompt).toContain("reply");
    expect(prompt).toContain("voiceReply");
    expect(prompt).toContain("action");
    expect(prompt).toContain("JSON");
  });

  it("inclui conversationContext quando fornecido", async () => {
    const ctx = await mod.buildSessionContext("teste");
    const prompt = mod.buildQueryPrompt(
      "teste",
      ctx,
      "Usuário: oi\nAion: olá"
    );

    expect(prompt).toContain("CONVERSA RECENTE");
    expect(prompt).toContain("Usuário: oi");
  });

  it("inclui brain items quando existem", async () => {
    const ctx = await mod.buildSessionContext("teste", {
      clientContext: {
        brainItems: [makeBrainItem({ title: "Memória importante" })],
        semanticResults: [],
      } as any,
    });
    const prompt = mod.buildQueryPrompt("teste", ctx);

    expect(prompt).toContain("MEMÓRIAS RELEVANTES");
    expect(prompt).toContain("Memória importante");
  });

  it("inclui semantic results quando existem", async () => {
    const ctx = await mod.buildSessionContext("teste", {
      clientContext: {
        brainItems: [],
        semanticResults: [
          { sourceId: "s1", text: "documento relevante", type: "note", score: 0.9, tags: [] },
        ],
      } as any,
    });
    const prompt = mod.buildQueryPrompt("teste", ctx);

    expect(prompt).toContain("BUSCA SEMÂNTICA");
    expect(prompt).toContain("documento relevante");
  });
});
