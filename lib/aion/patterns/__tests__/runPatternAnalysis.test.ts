import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetRecords = vi.hoisted(() => vi.fn(() => []));
const mockLoadProfile = vi.hoisted(() => vi.fn());
const mockUpdateProfile = vi.hoisted(() => vi.fn());
const mockSaveKnowledge = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage", () => ({
  getRecords: mockGetRecords,
}));

vi.mock("@/lib/aionProfile", () => ({
  loadProfile: mockLoadProfile,
  updateProfile: mockUpdateProfile,
  formatProfileForContext: vi.fn(() => "PERFIL DO USUÁRIO:\nVersão do perfil: 1\nAtualizado em: 2026-05-19"),
}));

vi.mock("@/lib/aion/brain/knowledge", () => ({
  saveKnowledge: mockSaveKnowledge,
}));

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(() => null),
  length: 0,
};

describe("shouldRunPatternAnalysis", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna true se nunca rodou", async () => {
    const { shouldRunPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue(null);
    expect(shouldRunPatternAnalysis()).toBe(true);
  });

  it("retorna false se rodou recentemente (<24h)", async () => {
    const { shouldRunPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue(String(Date.now() - 1000));
    expect(shouldRunPatternAnalysis()).toBe(false);
  });

  it("retorna true se rodou há mais de 24h", async () => {
    const { shouldRunPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue(String(Date.now() - 25 * 60 * 60 * 1000));
    expect(shouldRunPatternAnalysis()).toBe(true);
  });

  it("retorna true com force=true independente do timestamp", async () => {
    const { shouldRunPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue(String(Date.now() - 1000));
    expect(shouldRunPatternAnalysis(true)).toBe(true);
  });

  it("retorna false no server (sem window)", async () => {
    vi.unstubAllGlobals();
    const { shouldRunPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    expect(shouldRunPatternAnalysis()).toBe(false);
  });
});

describe("getLatestDailyInsight", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna null se não houver insight salvo", async () => {
    const { getLatestDailyInsight } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue(null);
    expect(getLatestDailyInsight()).toBeNull();
  });

  it("retorna o insight salvo", async () => {
    const { getLatestDailyInsight } = await import("@/lib/aion/patterns/runPatternAnalysis");
    const insight = {
      date: "2026-05-19",
      summary: "Hoje: 2 tarefas, 1 gasto.",
      financial: [],
      productivity: [],
      habits: [{ type: "streak", habitName: "meditar", description: "meditar: 3 dias", consistency: 0.5, currentStreak: 3 }],
      topPriority: "Tarefa urgente",
      suggestion: "Foco em concluir tarefas.",
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(insight));
    const loaded = getLatestDailyInsight();
    expect(loaded).not.toBeNull();
    expect(loaded!.date).toBe("2026-05-19");
    expect(loaded!.habits).toHaveLength(1);
  });

  it("retorna null se JSON for inválido", async () => {
    const { getLatestDailyInsight } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue("invalid json{{{");
    expect(getLatestDailyInsight()).toBeNull();
  });
});

describe("runPatternAnalysis", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    vi.clearAllMocks();
    mockLoadProfile.mockResolvedValue({
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      userName: "João",
      energyPattern: [],
      behaviorTriggers: [],
      activeProjects: [],
      categorySpending: [],
      consistentHabits: [],
      abandonedHabits: [],
      currentGoal: "",
      lastFinancialReview: null,
      lastGoalReview: null,
    });
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSaveKnowledge.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carrega registros e atualiza perfil", async () => {
    const { runPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    mockGetRecords.mockReturnValue([
      { type: "task", title: "T1", status: "done", createdAt: new Date().toISOString(), priority: "medium", id: "1", description: "", project: null, amount: null, category: null, dueDate: null, nextAction: "", rawInput: null },
      { type: "task", title: "T2", status: "done", createdAt: new Date().toISOString(), priority: "medium", id: "2", description: "", project: null, amount: null, category: null, dueDate: null, nextAction: "", rawInput: null },
    ]);

    const result = await runPatternAnalysis({ force: true });

    expect(result.skipped).toBe(false);
    expect(result.profileUpdated).toBe(true);
    expect(result.insightsGenerated).toBe(true);
    expect(mockUpdateProfile).toHaveBeenCalled();
  });

  it("não roda se lastPatternAnalysisAt for recente", async () => {
    const { runPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue(String(Date.now() - 1000));

    const result = await runPatternAnalysis();

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already_run_recently");
    expect(mockGetRecords).not.toHaveBeenCalled();
  });

  it("roda com force=true mesmo se recente", async () => {
    const { runPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue(String(Date.now() - 1000));
    mockGetRecords.mockReturnValue([
      { type: "task", title: "T1", status: "done", createdAt: new Date().toISOString(), priority: "medium", id: "1", description: "", project: null, amount: null, category: null, dueDate: null, nextAction: "", rawInput: null },
    ]);

    const result = await runPatternAnalysis({ force: true });

    expect(result.skipped).toBe(false);
    expect(result.profileUpdated).toBe(true);
  });

  it("erro em updateProfile não quebra tudo", async () => {
    const { runPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    mockGetRecords.mockReturnValue([
      { type: "task", title: "T1", status: "done", createdAt: new Date().toISOString(), priority: "medium", id: "1", description: "", project: null, amount: null, category: null, dueDate: null, nextAction: "", rawInput: null },
    ]);
    mockUpdateProfile.mockRejectedValue(new Error("vault offline"));

    const result = await runPatternAnalysis({ force: true });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("vault offline");
    expect(result.insightsGenerated).toBe(true);
  });

  it("não quebra com registros vazios", async () => {
    const { runPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    mockGetRecords.mockReturnValue([]);

    const result = await runPatternAnalysis({ force: true });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no_records");
  });

  it("não roda no servidor", async () => {
    vi.unstubAllGlobals();
    const { runPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");

    const result = await runPatternAnalysis();

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("server_side");
  });

  it("salva knowledge quando há padrões", async () => {
    const { runPatternAnalysis } = await import("@/lib/aion/patterns/runPatternAnalysis");
    mockGetRecords.mockReturnValue([
      { type: "expense", amount: 50, category: "comida", createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), priority: "medium", id: "1", title: "almoço", description: "", project: null, dueDate: null, nextAction: "", status: "pending", rawInput: null },
      { type: "expense", amount: 80, category: "comida", createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), priority: "medium", id: "2", title: "jantar", description: "", project: null, dueDate: null, nextAction: "", status: "pending", rawInput: null },
      { type: "expense", amount: 90, category: "comida", createdAt: new Date().toISOString(), priority: "medium", id: "3", title: "lanche", description: "", project: null, dueDate: null, nextAction: "", status: "pending", rawInput: null },
    ]);
    mockLoadProfile.mockResolvedValue({
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      userName: "",
      energyPattern: [],
      behaviorTriggers: [],
      activeProjects: [],
      categorySpending: [],
      consistentHabits: [],
      abandonedHabits: [],
      currentGoal: "",
      lastFinancialReview: null,
      lastGoalReview: null,
    });

    await runPatternAnalysis({ force: true });

    expect(mockSaveKnowledge).toHaveBeenCalled();
    const call = mockSaveKnowledge.mock.calls[0][0];
    expect(call.type).toBe("pattern");
    expect(call.tags).toContain("pattern");
  });
});

describe("buildEnhancedProfileContext", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna perfil base quando não há insight salvo", async () => {
    const { buildEnhancedProfileContext } = await import("@/lib/aion/patterns/runPatternAnalysis");
    localStorageMock.getItem.mockReturnValue(null);
    const profile = {
      version: 1,
      updatedAt: "2026-05-19T00:00:00.000Z",
      userName: "João",
      energyPattern: [],
      behaviorTriggers: [],
      activeProjects: [],
      categorySpending: [],
      consistentHabits: [],
      abandonedHabits: [],
      currentGoal: "",
      lastFinancialReview: null,
      lastGoalReview: null,
    };
    const ctx = buildEnhancedProfileContext(profile);
    expect(ctx).toContain("PERFIL DO USUÁRIO");
    expect(ctx).not.toContain("PADRÕES DETECTADOS");
  });

  it("inclui seção de padrões quando há insight salvo", async () => {
    const { buildEnhancedProfileContext } = await import("@/lib/aion/patterns/runPatternAnalysis");
    const insight = {
      date: "2026-05-19",
      summary: "Hoje: 3 tarefas.",
      financial: [{ type: "spending_anomaly", category: "comida", description: "Gastos em comida subiram 50%", currentValue: 80, severity: "medium" }],
      productivity: [{ type: "completion_rate", description: "2 de 4 concluídas (50%)", value: 50 }],
      habits: [{ type: "streak", habitName: "meditar", description: "meditar: 3 dias", consistency: 0.5, currentStreak: 3 }],
      topPriority: "Revisar projeto",
      suggestion: "Rever gastos em comida.",
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(insight));
    const profile = {
      version: 1,
      updatedAt: "2026-05-19T00:00:00.000Z",
      userName: "",
      energyPattern: [],
      behaviorTriggers: [],
      activeProjects: [],
      categorySpending: [],
      consistentHabits: [],
      abandonedHabits: [],
      currentGoal: "",
      lastFinancialReview: null,
      lastGoalReview: null,
    };
    const ctx = buildEnhancedProfileContext(profile);
    expect(ctx).toContain("PADRÕES DETECTADOS");
    expect(ctx).toContain("Financeiro");
    expect(ctx).toContain("Produtividade");
    expect(ctx).toContain("Hábitos");
    expect(ctx).toContain("Sugestão");
  });

  it("inclui apenas seções com dados", async () => {
    const { buildEnhancedProfileContext } = await import("@/lib/aion/patterns/runPatternAnalysis");
    const insight = {
      date: "2026-05-19",
      summary: "Hoje: 1 gasto.",
      financial: [],
      productivity: [],
      habits: [{ type: "declining_habit", habitName: "correr", description: "correr: sem registros há 15 dias", consistency: 0.2 }],
      topPriority: "Nenhuma",
      suggestion: "Retomar correr.",
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(insight));
    const profile = {
      version: 1,
      updatedAt: "2026-05-19T00:00:00.000Z",
      userName: "",
      energyPattern: [],
      behaviorTriggers: [],
      activeProjects: [],
      categorySpending: [],
      consistentHabits: [],
      abandonedHabits: [],
      currentGoal: "",
      lastFinancialReview: null,
      lastGoalReview: null,
    };
    const ctx = buildEnhancedProfileContext(profile);
    expect(ctx).toContain("PADRÕES DETECTADOS");
    expect(ctx).toContain("Hábitos");
    expect(ctx).not.toContain("Financeiro:");
    expect(ctx).not.toContain("Produtividade:");
  });
});
