import { describe, it, expect } from "vitest";
import type { CortexRecord } from "../types";
import type { AionProfile } from "../aionProfile";

function makeRecord(overrides: Partial<CortexRecord> = {}): CortexRecord {
  return {
    id: "test-1",
    type: "task",
    title: "Tarefa de teste",
    description: "",
    priority: "medium",
    project: null,
    amount: null,
    category: null,
    dueDate: null,
    nextAction: "",
    status: "pending",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function todayISO(offsetDays = 0, hours = 12): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setUTCHours(hours, 0, 0, 0);
  return d.toISOString();
}

const defaultProfile: AionProfile = {
  version: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  userName: "João",
  energyPattern: [],
  behaviorTriggers: [],
  activeProjects: [],
  categorySpending: [],
  consistentHabits: [],
  abandonedHabits: [],
  currentGoal: "Aprender TypeScript",
  lastFinancialReview: null,
  lastGoalReview: null,
};

describe("analyzeFinancialPatterns", () => {
  it("retorna vazio sem registros de despesa", async () => {
    const { analyzeFinancialPatterns } = await import("@/lib/aion/patternDetector");
    const records = [makeRecord({ type: "task" })];
    expect(analyzeFinancialPatterns(records)).toEqual([]);
  });

  it("retorna vazio com menos de 2 despesas", async () => {
    const { analyzeFinancialPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "expense", amount: 50, category: "alimentação", createdAt: todayISO(-10) }),
    ];
    expect(analyzeFinancialPatterns(records)).toEqual([]);
  });

  it("detecta anomalia de gastos (aumento)", async () => {
    const { analyzeFinancialPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "expense", amount: 30, category: "alimentação", createdAt: todayISO(-10) }),
      makeRecord({ type: "expense", amount: 25, category: "alimentação", createdAt: todayISO(-9) }),
      makeRecord({ type: "expense", amount: 80, category: "alimentação", createdAt: todayISO(-1) }),
      makeRecord({ type: "expense", amount: 90, category: "alimentação", createdAt: todayISO(0) }),
    ];
    const insights = analyzeFinancialPatterns(records);
    const anomaly = insights.find((i) => i.type === "spending_anomaly" && i.category === "alimentação");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("high");
    expect(anomaly!.changePercent).toBeGreaterThan(0);
  });

  it("detecta anomalia de gastos (queda)", async () => {
    const { analyzeFinancialPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "expense", amount: 100, category: "transporte", createdAt: todayISO(-10) }),
      makeRecord({ type: "expense", amount: 120, category: "transporte", createdAt: todayISO(-9) }),
      makeRecord({ type: "expense", amount: 30, category: "transporte", createdAt: todayISO(-1) }),
      makeRecord({ type: "expense", amount: 20, category: "transporte", createdAt: todayISO(0) }),
    ];
    const insights = analyzeFinancialPatterns(records);
    const anomaly = insights.find((i) => i.type === "spending_anomaly" && i.category === "transporte");
    expect(anomaly).toBeDefined();
    expect(anomaly!.changePercent).toBeLessThan(0);
  });

  it("detecta despesa recorrente", async () => {
    const { analyzeFinancialPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "expense", amount: 89.90, category: "assinaturas", createdAt: todayISO(-60) }),
      makeRecord({ type: "expense", amount: 89.90, category: "assinaturas", createdAt: todayISO(-30) }),
      makeRecord({ type: "expense", amount: 89.90, category: "assinaturas", createdAt: todayISO(0) }),
    ];
    const insights = analyzeFinancialPatterns(records);
    const recurring = insights.find((i) => i.type === "recurring_expense");
    expect(recurring).toBeDefined();
    expect(recurring!.currentValue).toBe(89.9);
  });

  it("detecta alerta de orçamento", async () => {
    const { analyzeFinancialPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "expense", amount: 300, category: "saúde", createdAt: todayISO(-10) }),
      makeRecord({ type: "expense", amount: 250, category: "saúde", createdAt: todayISO(-5) }),
      makeRecord({ type: "expense", amount: 350, category: "saúde", createdAt: todayISO(0) }),
    ];
    const insights = analyzeFinancialPatterns(records);
    const alert = insights.find((i) => i.type === "budget_alert" && i.category === "saúde");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("medium");
  });

  it("combina múltiplos tipos de insight", async () => {
    const { analyzeFinancialPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "expense", amount: 50, category: "alimentação", createdAt: todayISO(-10) }),
      makeRecord({ type: "expense", amount: 45, category: "alimentação", createdAt: todayISO(-9) }),
      makeRecord({ type: "expense", amount: 100, category: "alimentação", createdAt: todayISO(-1) }),
      makeRecord({ type: "expense", amount: 600, category: "aluguel", createdAt: todayISO(-30) }),
      makeRecord({ type: "expense", amount: 600, category: "aluguel", createdAt: todayISO(0) }),
    ];
    const insights = analyzeFinancialPatterns(records);
    expect(insights.length).toBeGreaterThanOrEqual(2);
  });
});

describe("analyzeProductivityPatterns", () => {
  it("retorna vazio sem tarefas", async () => {
    const { analyzeProductivityPatterns } = await import("@/lib/aion/patternDetector");
    expect(analyzeProductivityPatterns([])).toEqual([]);
  });

  it("retorna vazio com apenas despesas", async () => {
    const { analyzeProductivityPatterns } = await import("@/lib/aion/patternDetector");
    const records = [makeRecord({ type: "expense", amount: 10 })];
    expect(analyzeProductivityPatterns(records)).toEqual([]);
  });

  it("calcula taxa de conclusão", async () => {
    const { analyzeProductivityPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "T1", status: "done", createdAt: todayISO(0, 10) }),
      makeRecord({ type: "task", title: "T2", status: "done", createdAt: todayISO(0, 11) }),
      makeRecord({ type: "task", title: "T3", status: "pending" }),
      makeRecord({ type: "task", title: "T4", status: "pending" }),
    ];
    const insights = analyzeProductivityPatterns(records);
    const rate = insights.find((i) => i.type === "completion_rate");
    expect(rate).toBeDefined();
    expect(rate!.value).toBe(50);
  });

  it("detecta horário de pico", async () => {
    const { analyzeProductivityPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "T1", status: "done", createdAt: todayISO(0, 14) }),
      makeRecord({ type: "task", title: "T2", status: "done", createdAt: todayISO(0, 15) }),
      makeRecord({ type: "task", title: "T3", status: "done", createdAt: todayISO(0, 15) }),
    ];
    const insights = analyzeProductivityPatterns(records);
    const peak = insights.find((i) => i.type === "peak_time");
    expect(peak).toBeDefined();
    expect(peak!.description).toContain("tarde");
  });

  it("calcula throughput médio de tarefas", async () => {
    const { analyzeProductivityPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "T1", status: "done", createdAt: todayISO(-2, 10) }),
      makeRecord({ type: "task", title: "T2", status: "done", createdAt: todayISO(-2, 11) }),
      makeRecord({ type: "task", title: "T3", status: "done", createdAt: todayISO(-1, 10) }),
      makeRecord({ type: "task", title: "T4", status: "done", createdAt: todayISO(0, 10) }),
    ];
    const insights = analyzeProductivityPatterns(records);
    const throughput = insights.find((i) => i.type === "task_throughput");
    expect(throughput).toBeDefined();
    expect(throughput!.value).toBeGreaterThan(0);
  });

  it("reporta distribuição de prioridades", async () => {
    const { analyzeProductivityPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "T1", priority: "high" }),
      makeRecord({ type: "task", title: "T2", priority: "high" }),
      makeRecord({ type: "task", title: "T3", priority: "medium" }),
      makeRecord({ type: "task", title: "T4", priority: "low" }),
    ];
    const insights = analyzeProductivityPatterns(records);
    const balance = insights.find((i) => i.type === "priority_balance");
    expect(balance).toBeDefined();
    expect(balance!.description).toContain("50%");
    expect(balance!.description).toContain("25%");
  });
});

describe("analyzeHabitPatterns", () => {
  it("retorna vazio sem tarefas concluídas", async () => {
    const { analyzeHabitPatterns } = await import("@/lib/aion/patternDetector");
    const records = [makeRecord({ type: "task", status: "pending" })];
    expect(analyzeHabitPatterns(records)).toEqual([]);
  });

  it("retorna vazio com menos de 2 conclusões", async () => {
    const { analyzeHabitPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: todayISO(0) }),
    ];
    expect(analyzeHabitPatterns(records)).toEqual([]);
  });

  it("detecta sequência (streak) de hábito", async () => {
    const { analyzeHabitPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: todayISO(-2, 8) }),
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: todayISO(-1, 8) }),
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: todayISO(0, 8) }),
    ];
    const insights = analyzeHabitPatterns(records);
    const streak = insights.find((i) => i.type === "streak");
    expect(streak).toBeDefined();
    expect(streak!.currentStreak).toBeGreaterThanOrEqual(3);
  });

  it("detecta hábito emergente", async () => {
    const { analyzeHabitPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Beber água", status: "done", createdAt: todayISO(0, 9) }),
      makeRecord({ type: "task", title: "Beber água", status: "done", createdAt: todayISO(-1, 9) }),
    ];
    const insights = analyzeHabitPatterns(records);
    const emerging = insights.find((i) => i.type === "emerging_habit");
    expect(emerging).toBeDefined();
    expect(emerging!.habitName).toBe("beber água");
  });

  it("detecta hábito em declínio", async () => {
    const { analyzeHabitPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Correr", status: "done", createdAt: todayISO(-25, 7) }),
      makeRecord({ type: "task", title: "Correr", status: "done", createdAt: todayISO(-23, 7) }),
      makeRecord({ type: "task", title: "Correr", status: "done", createdAt: todayISO(-20, 7) }),
    ];
    const insights = analyzeHabitPatterns(records);
    const declining = insights.find((i) => i.type === "declining_habit");
    expect(declining).toBeDefined();
    expect(declining!.habitName).toBe("correr");
  });

  it("detecta tendência de consistência", async () => {
    const { analyzeHabitPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Ler", status: "done", createdAt: todayISO(-20, 8) }),
      makeRecord({ type: "task", title: "Ler", status: "done", createdAt: todayISO(-18, 8) }),
      makeRecord({ type: "task", title: "Ler", status: "done", createdAt: todayISO(-2, 8) }),
      makeRecord({ type: "task", title: "Ler", status: "done", createdAt: todayISO(-1, 8) }),
      makeRecord({ type: "task", title: "Ler", status: "done", createdAt: todayISO(0, 8) }),
    ];
    const insights = analyzeHabitPatterns(records);
    const trend = insights.find((i) => i.type === "consistency_trend");
    expect(trend).toBeDefined();
  });

  it("ignora case no título do hábito", async () => {
    const { analyzeHabitPatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: todayISO(-2, 8) }),
      makeRecord({ type: "task", title: "meditar", status: "done", createdAt: todayISO(-1, 8) }),
      makeRecord({ type: "task", title: "MEDITAR", status: "done", createdAt: todayISO(0, 8) }),
    ];
    const insights = analyzeHabitPatterns(records);
    const meditar = insights.filter((i) => i.habitName === "meditar");
    expect(meditar.length).toBeGreaterThanOrEqual(1);
  });
});

describe("generateDailyInsight", () => {
  it("gera resumo sem registros hoje", async () => {
    const { generateDailyInsight } = await import("@/lib/aion/patternDetector");
    const insight = generateDailyInsight([], [], [], []);
    expect(insight.summary).toContain("Nenhum registro hoje");
    expect(insight.date).toBe(today());
  });

  it("inclui tarefas, gastos e ideias do dia", async () => {
    const { generateDailyInsight } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "T1", createdAt: todayISO(0, 9) }),
      makeRecord({ type: "expense", amount: 35, category: "café", createdAt: todayISO(0, 10) }),
      makeRecord({ type: "idea", title: "App novo", createdAt: todayISO(0, 11) }),
    ];
    const insight = generateDailyInsight(records, [], [], []);
    expect(insight.summary).toContain("tarefas");
    expect(insight.summary).toContain("gastos");
    expect(insight.summary).toContain("ideias");
  });

  it("extrai prioridade mais alta", async () => {
    const { generateDailyInsight } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Pagar contas", priority: "high", status: "pending", createdAt: todayISO(0, 9) }),
      makeRecord({ type: "task", title: "Comprar pão", priority: "medium", createdAt: todayISO(0, 10) }),
    ];
    const insight = generateDailyInsight(records, [], [], []);
    expect(insight.topPriority).toContain("Pagar contas");
  });

  it("sugere revisão de gastos com anomalia financeira", async () => {
    const { generateDailyInsight } = await import("@/lib/aion/patternDetector");
    const financial = [{
      type: "spending_anomaly" as const,
      category: "alimentação",
      description: "Gastos subiram",
      currentValue: 80,
      previousValue: 30,
      changePercent: 167,
      severity: "high" as const,
    }];
    const insight = generateDailyInsight([], financial, [], []);
    expect(insight.suggestion).toContain("alimentação");
  });

  it("sugere foco com baixa conclusão", async () => {
    const { generateDailyInsight } = await import("@/lib/aion/patternDetector");
    const productivity = [{
      type: "completion_rate" as const,
      description: "1 de 5 tarefas concluídas (20%)",
      value: 20,
    }];
    const insight = generateDailyInsight([], [], productivity, []);
    expect(insight.suggestion).toContain("Foco");
  });

  it("sugere retomar hábito em declínio", async () => {
    const { generateDailyInsight } = await import("@/lib/aion/patternDetector");
    const habits = [{
      type: "declining_habit" as const,
      habitName: "correr",
      description: "correr: sem registros há 15 dias",
      consistency: 0.3,
    }];
    const insight = generateDailyInsight([], [], [], habits);
    expect(insight.suggestion).toContain("correr");
  });

  it("elogia quando tudo está bem", async () => {
    const { generateDailyInsight } = await import("@/lib/aion/patternDetector");
    const insight = generateDailyInsight([], [], [], []);
    expect(insight.suggestion).toContain("Bom trabalho");
  });
});

describe("analyzePatterns", () => {
  it("executa todos os analisadores e retorna PatternAnalysis completo", async () => {
    const { analyzePatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "T1", priority: "high", status: "done", createdAt: todayISO(-2, 10) }),
      makeRecord({ type: "task", title: "T2", status: "done", createdAt: todayISO(-1, 11) }),
      makeRecord({ type: "task", title: "T3", status: "pending" }),
      makeRecord({ type: "expense", amount: 100, category: "alimentação", createdAt: todayISO(-10) }),
      makeRecord({ type: "expense", amount: 200, category: "alimentação", createdAt: todayISO(-1) }),
      makeRecord({ type: "idea", title: "Ideia legal", createdAt: todayISO(0, 14) }),
    ];
    const analysis = analyzePatterns(records);
    expect(analysis).toHaveProperty("financial");
    expect(analysis).toHaveProperty("productivity");
    expect(analysis).toHaveProperty("habits");
    expect(analysis).toHaveProperty("dailyInsight");
    expect(analysis.productivity.length).toBeGreaterThan(0);
  });
});

describe("updateProfileWithPatterns", () => {
  it("atualiza energyPattern com horário de pico", async () => {
    const { updateProfileWithPatterns, analyzePatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "T1", status: "done", createdAt: todayISO(0, 14) }),
      makeRecord({ type: "task", title: "T2", status: "done", createdAt: todayISO(0, 15) }),
    ];
    const analysis = analyzePatterns(records);
    const updated = updateProfileWithPatterns(defaultProfile, analysis);
    const hasTarde = updated.energyPattern.some((e) => e.period === "tarde");
    expect(hasTarde).toBe(true);
  });

  it("atualiza categorySpending com anomalias financeiras", async () => {
    const { updateProfileWithPatterns, analyzePatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "expense", amount: 30, category: "lazer", createdAt: todayISO(-10) }),
      makeRecord({ type: "expense", amount: 80, category: "lazer", createdAt: todayISO(-1) }),
      makeRecord({ type: "expense", amount: 90, category: "lazer", createdAt: todayISO(0) }),
    ];
    const analysis = analyzePatterns(records);
    const updated = updateProfileWithPatterns(defaultProfile, analysis);
    expect(updated.categorySpending.length).toBeGreaterThanOrEqual(1);
    const lazer = updated.categorySpending.find((cs) => cs.category === "lazer");
    expect(lazer).toBeDefined();
    expect(lazer!.average).toBeGreaterThan(0);
  });

  it("adiciona hábitos consistentes de streaks", async () => {
    const { updateProfileWithPatterns, analyzePatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: todayISO(-2, 8) }),
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: todayISO(-1, 8) }),
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: todayISO(0, 8) }),
    ];
    const analysis = analyzePatterns(records);
    const updated = updateProfileWithPatterns(defaultProfile, analysis);
    expect(updated.consistentHabits.length).toBeGreaterThanOrEqual(1);
    const meditar = updated.consistentHabits.find((h) => h.name === "meditar");
    expect(meditar).toBeDefined();
  });

  it("adiciona hábitos abandonados", async () => {
    const { updateProfileWithPatterns, analyzePatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "Correr", status: "done", createdAt: todayISO(-20, 7) }),
      makeRecord({ type: "task", title: "Correr", status: "done", createdAt: todayISO(-18, 7) }),
    ];
    const analysis = analyzePatterns(records);
    const updated = updateProfileWithPatterns(defaultProfile, analysis);
    expect(updated.abandonedHabits.length).toBeGreaterThanOrEqual(1);
    const correr = updated.abandonedHabits.find((h) => h.name === "correr");
    expect(correr).toBeDefined();
  });

  it("atualiza lastFinancialReview quando há dados financeiros", async () => {
    const { updateProfileWithPatterns, analyzePatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "expense", amount: 30, category: "lazer", createdAt: todayISO(-10) }),
      makeRecord({ type: "expense", amount: 80, category: "lazer", createdAt: todayISO(-1) }),
      makeRecord({ type: "expense", amount: 90, category: "lazer", createdAt: todayISO(0) }),
    ];
    const analysis = analyzePatterns(records);
    const updated = updateProfileWithPatterns({ ...defaultProfile, lastFinancialReview: null }, analysis);
    expect(updated.lastFinancialReview).not.toBeNull();
  });

  it("atualiza lastGoalReview quando há dados de produtividade", async () => {
    const { updateProfileWithPatterns, analyzePatterns } = await import("@/lib/aion/patternDetector");
    const records = [
      makeRecord({ type: "task", title: "T1", status: "done", createdAt: todayISO(0, 10) }),
      makeRecord({ type: "task", title: "T2", status: "done", createdAt: todayISO(0, 11) }),
    ];
    const analysis = analyzePatterns(records);
    const updated = updateProfileWithPatterns({ ...defaultProfile, lastGoalReview: null }, analysis);
    expect(updated.lastGoalReview).not.toBeNull();
  });

  it("preserva campos existentes do perfil", async () => {
    const { updateProfileWithPatterns, analyzePatterns } = await import("@/lib/aion/patternDetector");
    const records = [makeRecord({ type: "task", title: "T1", status: "done", createdAt: todayISO(0, 10) })];
    const analysis = analyzePatterns(records);
    const updated = updateProfileWithPatterns(defaultProfile, analysis);
    expect(updated.userName).toBe("João");
    expect(updated.currentGoal).toBe("Aprender TypeScript");
    expect(updated.version).toBe(1);
  });
});
