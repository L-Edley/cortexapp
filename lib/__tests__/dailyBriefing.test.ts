import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetRecords = vi.hoisted(() => vi.fn());
const mockGetTopPendingTasks = vi.hoisted(() => vi.fn());
const mockGetSpentToday = vi.hoisted(() => vi.fn());
const mockGetLatestEntries = vi.hoisted(() => vi.fn());
const mockLoadProfile = vi.hoisted(() => vi.fn());
const mockGetLatestDailyInsight = vi.hoisted(() => vi.fn());

const mockStorage = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
    get length() { return store.size; },
    key: vi.fn((_: number) => null),
  };
});

vi.mock("@/lib/storageProvider", () => ({
  getRecords: mockGetRecords,
  getTopPendingTasks: mockGetTopPendingTasks,
  getSpentToday: mockGetSpentToday,
  getLatestEntries: mockGetLatestEntries,
}));

vi.mock("@/lib/aionProfile", () => ({
  loadProfile: mockLoadProfile,
}));

vi.mock("@/lib/aion/patterns/runPatternAnalysis", () => ({
  getLatestDailyInsight: mockGetLatestDailyInsight,
}));

vi.stubGlobal("localStorage", mockStorage);
vi.stubGlobal("window", {});

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let mod: typeof import("@/lib/dailyBriefing");

async function loadModule() {
  vi.resetModules();
  mockStorage.clear();
  mod = await import("@/lib/dailyBriefing");
  return mod;
}

describe("shouldShowBriefing", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadModule();
  });

  it("retorna true se ainda não exibiu hoje", async () => {
    expect(mod.shouldShowBriefing()).toBe(true);
  });

  it("retorna false se já exibiu hoje", async () => {
    mod.markBriefingShown();
    expect(mod.shouldShowBriefing()).toBe(false);
  });

  it("retorna true se último briefing foi ontem", async () => {
    mockStorage.setItem("aion_briefing_date", yesterdayStr());
    expect(mod.shouldShowBriefing()).toBe(true);
  });

  it("retorna false se último briefing foi hoje", async () => {
    mockStorage.setItem("aion_briefing_date", todayStr());
    expect(mod.shouldShowBriefing()).toBe(false);
  });

  it("não quebra em SSR (window undefined)", async () => {
    vi.stubGlobal("window", undefined);
    expect(mod.shouldShowBriefing()).toBe(false);
    vi.stubGlobal("window", {});
  });
});

describe("markBriefingShown", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadModule();
  });

  it("salva a data atual no localStorage", async () => {
    mod.markBriefingShown();
    expect(mockStorage.setItem).toHaveBeenCalledWith("aion_briefing_date", todayStr());
  });

  it("não quebra em SSR", async () => {
    vi.stubGlobal("window", undefined);
    expect(() => mod.markBriefingShown()).not.toThrow();
    vi.stubGlobal("window", {});
  });
});

describe("generateBriefing", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoadProfile.mockResolvedValue({
      version: 1,
      updatedAt: new Date().toISOString(),
      userName: "Teste",
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
    mockGetLatestDailyInsight.mockReturnValue(null);
    mockGetRecords.mockReturnValue([]);
    mockGetTopPendingTasks.mockReturnValue([]);
    mockGetSpentToday.mockReturnValue(0);
    await loadModule();
  });

  it("funciona sem registros", async () => {
    const briefing = await mod.generateBriefing();

    expect(briefing).toBeDefined();
    expect(briefing.date).toBe(todayStr());
    expect(briefing.greeting).toBeTruthy();
    expect(briefing.summary).toContain("Nenhuma tarefa");
    expect(briefing.priorities).toEqual([]);
    expect(briefing.habits).toEqual([]);
    expect(briefing.insights).toEqual([]);
    expect(briefing.question).toBeTruthy();
    expect(briefing.generatedAt).toBeTruthy();
  });

  it("usa tarefas prioritárias", async () => {
    mockGetRecords.mockReturnValue([
      { id: "1", type: "task", title: "Pagar aluguel", status: "pending", priority: "high" },
      { id: "2", type: "task", title: "Comprar presente", status: "pending", priority: "medium" },
      { id: "3", type: "task", title: "Estudar TypeScript", status: "pending", priority: "low" },
    ] as any);
    mockGetTopPendingTasks.mockReturnValue([
      { id: "1", type: "task", title: "Pagar aluguel", status: "pending", priority: "high" },
      { id: "2", type: "task", title: "Comprar presente", status: "pending", priority: "medium" },
      { id: "3", type: "task", title: "Estudar TypeScript", status: "pending", priority: "low" },
    ] as any);

    const briefing = await mod.generateBriefing();

    expect(briefing.summary).toContain("tarefas");
    expect(briefing.priorities.length).toBeGreaterThanOrEqual(1);
    expect(briefing.priorities[0]).toContain("Pagar");
  });

  it("usa insight diário se existir", async () => {
    mockGetLatestDailyInsight.mockReturnValue({
      date: todayStr(),
      summary: "Dia produtivo",
      financial: [
        {
          type: "spending_anomaly",
          category: "alimentação",
          description: "Gastos em alimentação aumentaram 50%",
          currentValue: 150,
          severity: "medium",
        },
      ],
      productivity: [
        {
          type: "completion_rate",
          description: "80% das tarefas concluídas",
          value: 80,
        },
      ],
      habits: [],
      topPriority: "Revisar orçamento",
      suggestion: "Que tal revisar seus gastos?",
    });

    const briefing = await mod.generateBriefing();

    expect(briefing.insights.length).toBeGreaterThan(0);
    expect(briefing.insights.some((i) => i.includes("alimentação"))).toBe(true);
  });

  it("inclui nome do usuário na saudação", async () => {
    mockLoadProfile.mockResolvedValue({
      version: 1,
      updatedAt: new Date().toISOString(),
      userName: "Eduardo",
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

    const briefing = await mod.generateBriefing();
    expect(briefing.greeting).toContain("Eduardo");
  });

  it("inclui gastos financeiros quando existem", async () => {
    mockGetSpentToday.mockReturnValue(150.5);

    const briefing = await mod.generateBriefing();

    expect(briefing.financial).toBeDefined();
    expect(briefing.financial).toContain("150");
  });

  it("inclui hábitos consistentes do perfil", async () => {
    mockLoadProfile.mockResolvedValue({
      version: 1,
      updatedAt: new Date().toISOString(),
      userName: "Teste",
      energyPattern: [],
      behaviorTriggers: [],
      activeProjects: [],
      categorySpending: [],
      consistentHabits: [
        { name: "Acordar cedo", consistency: 0.85, lastDate: todayStr() },
        { name: "Meditar", consistency: 0.7, lastDate: todayStr() },
      ],
      abandonedHabits: [],
      currentGoal: "",
      lastFinancialReview: null,
      lastGoalReview: null,
    });

    const briefing = await mod.generateBriefing();

    expect(briefing.habits.length).toBeGreaterThan(0);
    expect(briefing.habits.some((h) => h.includes("Acordar"))).toBe(true);
  });

  it("não quebra em SSR", async () => {
    vi.stubGlobal("window", undefined);
    await expect(mod.generateBriefing()).resolves.toBeDefined();
    vi.stubGlobal("window", {});
  });
});
