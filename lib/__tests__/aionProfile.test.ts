import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CortexRecord } from "@/lib/types";

const mockGetRecords = vi.hoisted(() => vi.fn(() => []));

vi.mock("@/lib/storage", () => ({
  getRecords: mockGetRecords,
}));

vi.mock("@/lib/obsidian/client", () => ({
  readVaultFile: vi.fn(async () => null),
  writeVaultFile: vi.fn(async () => undefined),
}));

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

describe("defaultProfile", () => {
  it("retorna estrutura padrão", async () => {
    const { defaultProfile } = await import("@/lib/aionProfile");
    const p = defaultProfile();
    expect(p.version).toBe(1);
    expect(p.userName).toBe("");
    expect(p.energyPattern).toEqual([]);
    expect(p.behaviorTriggers).toEqual([]);
    expect(p.activeProjects).toEqual([]);
    expect(p.categorySpending).toEqual([]);
    expect(p.consistentHabits).toEqual([]);
    expect(p.abandonedHabits).toEqual([]);
    expect(p.currentGoal).toBe("");
    expect(p.lastFinancialReview).toBeNull();
    expect(p.lastGoalReview).toBeNull();
    expect(p.updatedAt).toBeTruthy();
  });
});

describe("serializeProfile / parseProfile round-trip", () => {
  it("preserva todos os campos após serializar e parsear", async () => {
    const { defaultProfile, loadProfile } = await import("@/lib/aionProfile");

    const { readVaultFile } = await import("@/lib/obsidian/client");
    const original = defaultProfile();
    original.version = 2;
    original.userName = "João";
    original.currentGoal = "Aprender TypeScript";
    original.energyPattern = [
      { period: "manhã", label: "focado" },
      { period: "tarde", label: "produtivo" },
    ];
    original.activeProjects = [
      { name: "Cortex", lastInteraction: "2026-05-19T10:00:00.000Z" },
    ];
    original.categorySpending = [
      { category: "alimentação", average: 45.5, count: 3 },
    ];

    const { serializeProfile, parseProfile } = await import("@/lib/aionProfile");
    const yaml = serializeProfile(original);

    vi.mocked(readVaultFile).mockResolvedValue(yaml);
    const parsed = await loadProfile();

    expect(parsed.version).toBe(2);
    expect(parsed.userName).toBe("João");
    expect(parsed.currentGoal).toBe("Aprender TypeScript");
    expect(parsed.energyPattern).toHaveLength(2);
    expect(parsed.energyPattern[0].period).toBe("manhã");
    expect(parsed.energyPattern[0].label).toBe("focado");
    expect(parsed.activeProjects).toHaveLength(1);
    expect(parsed.activeProjects[0].name).toBe("Cortex");
    expect(parsed.categorySpending).toHaveLength(1);
    expect(parsed.categorySpending[0].category).toBe("alimentação");
    expect(parsed.categorySpending[0].average).toBe(45.5);
  });

  it("lida com valores null", async () => {
    const { serializeProfile, parseProfile } = await import("@/lib/aionProfile");
    const { readVaultFile } = await import("@/lib/obsidian/client");

    const profile = (await import("@/lib/aionProfile")).defaultProfile();
    profile.lastFinancialReview = null;
    profile.lastGoalReview = null;

    const yaml = serializeProfile(profile);
    vi.mocked(readVaultFile).mockResolvedValue(yaml);
    const parsed = await (await import("@/lib/aionProfile")).loadProfile();

    expect(parsed.lastFinancialReview).toBeNull();
    expect(parsed.lastGoalReview).toBeNull();
  });

  it("carrega profile vazio como default", async () => {
    const { readVaultFile } = await import("@/lib/obsidian/client");
    vi.mocked(readVaultFile).mockResolvedValue(null);

    const { loadProfile } = await import("@/lib/aionProfile");
    const p = await loadProfile();
    expect(p.version).toBe(1);
    expect(p.userName).toBe("");
  });
});

describe("formatProfileForContext", () => {
  it("formata profile completo", async () => {
    const { defaultProfile, formatProfileForContext } = await import("@/lib/aionProfile");
    const p = defaultProfile();
    p.userName = "Maria";
    p.currentGoal = "Organizar finanças";
    p.energyPattern = [{ period: "manhã", label: "focado" }];
    p.activeProjects = [{ name: "Site", lastInteraction: "2026-05-19T10:00:00.000Z" }];
    p.categorySpending = [{ category: "mercado", average: 200.0, count: 2 }];
    p.lastFinancialReview = "2026-05-01T00:00:00.000Z";

    const ctx = formatProfileForContext(p);
    expect(ctx).toContain("Maria");
    expect(ctx).toContain("Organizar finanças");
    expect(ctx).toContain("manhã");
    expect(ctx).toContain("Site");
    expect(ctx).toContain("R$ 200.00");
    expect(ctx).toContain("2026-05-01");
    expect(ctx).toContain("Versão do perfil: 1");
  });

  it("profile vazio retorna apenas cabeçalho e versão", async () => {
    const { defaultProfile, formatProfileForContext } = await import("@/lib/aionProfile");
    const ctx = formatProfileForContext(defaultProfile());
    expect(ctx).toContain("PERFIL DO USUÁRIO");
    expect(ctx).toContain("Versão do perfil: 1");
  });
});

describe("detectEnergyPatterns", () => {
  it("detecta período mais ativo", async () => {
    const { detectEnergyPatterns } = await import("@/lib/aionProfile");
    const records = [
      makeRecord({ createdAt: "2026-05-19T08:00:00.000Z" }),
      makeRecord({ createdAt: "2026-05-19T09:00:00.000Z" }),
      makeRecord({ createdAt: "2026-05-19T14:00:00.000Z" }),
    ];
    const patterns = detectEnergyPatterns(records);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.period === "manhã")).toBe(true);
    expect(patterns.some((p) => p.period === "tarde")).toBe(true);
  });

  it("retorna vazio sem registros", async () => {
    const { detectEnergyPatterns } = await import("@/lib/aionProfile");
    expect(detectEnergyPatterns([])).toEqual([]);
  });
});

describe("detectActiveProjects", () => {
  it("agrupa por project e ordena por data", async () => {
    const { detectActiveProjects } = await import("@/lib/aionProfile");
    const records = [
      makeRecord({ project: "Cortex", createdAt: "2026-05-18T10:00:00.000Z" }),
      makeRecord({ project: "Site", createdAt: "2026-05-19T10:00:00.000Z" }),
      makeRecord({ project: "Cortex", createdAt: "2026-05-19T08:00:00.000Z" }),
    ];
    const projects = detectActiveProjects(records);
    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe("Site");
  });

  it("ignora registros sem project", async () => {
    const { detectActiveProjects } = await import("@/lib/aionProfile");
    const records = [makeRecord({ project: null })];
    expect(detectActiveProjects(records)).toEqual([]);
  });
});

describe("detectCategorySpending", () => {
  it("calcula média por categoria", async () => {
    const { detectCategorySpending } = await import("@/lib/aionProfile");
    const records = [
      makeRecord({ type: "expense", amount: 100, category: "comida" }),
      makeRecord({ type: "expense", amount: 50, category: "comida" }),
      makeRecord({ type: "expense", amount: 30, category: "transporte" }),
    ];
    const spending = detectCategorySpending(records);
    expect(spending).toHaveLength(2);
    const comida = spending.find((s) => s.category === "comida");
    expect(comida?.average).toBe(75);
    expect(comida?.count).toBe(2);
  });

  it("ignora registros sem amount", async () => {
    const { detectCategorySpending } = await import("@/lib/aionProfile");
    const records = [makeRecord({ type: "expense", amount: null })];
    expect(detectCategorySpending(records)).toEqual([]);
  });
});

describe("detectBehaviorTriggers", () => {
  it("detecta triggers com base em palavras-chave", async () => {
    const { detectBehaviorTriggers } = await import("@/lib/aionProfile");
    const records = [
      makeRecord({ title: "Estou muito cansado hoje" }),
      makeRecord({ title: "Sem energia para nada" }),
      makeRecord({ title: "Reunião com cliente" }),
    ];
    const triggers = detectBehaviorTriggers(records);
    expect(triggers.length).toBeGreaterThanOrEqual(1);
    const cansaço = triggers.find((t) => t.trigger === "cansaço");
    expect(cansaço).toBeDefined();
    expect(cansaço!.count).toBe(2);
  });

  it("não detecta trigger com menos de 2 ocorrências", async () => {
    const { detectBehaviorTriggers } = await import("@/lib/aionProfile");
    const records = [makeRecord({ title: "Estou cansado" })];
    const triggers = detectBehaviorTriggers(records);
    const cansaço = triggers.find((t) => t.trigger === "cansaço");
    expect(cansaço).toBeUndefined();
  });
});

describe("detectHabits", () => {
  it("detecta hábitos consistentes e abandonados", async () => {
    const { detectHabits } = await import("@/lib/aionProfile");
    const now = new Date();
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const records = [
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: recent }),
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: recent }),
      makeRecord({ type: "task", title: "Meditar", status: "done", createdAt: recent }),
      makeRecord({ type: "task", title: "Correr", status: "done", createdAt: old }),
    ];
    const result = detectHabits(records);
    expect(result.consistent.length).toBeGreaterThanOrEqual(1);
    expect(result.abandoned.length).toBeGreaterThanOrEqual(1);
  });

  it("retorna vazio sem registros de tarefa concluída", async () => {
    const { detectHabits } = await import("@/lib/aionProfile");
    const records = [makeRecord({ type: "idea" })];
    const result = detectHabits(records);
    expect(result.consistent).toEqual([]);
    expect(result.abandoned).toEqual([]);
  });
});

describe("analyzeAndUpdateProfile", () => {
  beforeEach(() => {
    mockGetRecords.mockReturnValue([]);
  });

  it("não quebra com registros vazios", async () => {
    const { writeVaultFile } = await import("@/lib/obsidian/client");
    vi.mocked(writeVaultFile).mockResolvedValue(undefined);

    const { analyzeAndUpdateProfile } = await import("@/lib/aionProfile");
    const profile = await analyzeAndUpdateProfile();
    expect(profile.version).toBe(1);
  });

  it("analisa e atualiza com registros reais", async () => {
    const { writeVaultFile, readVaultFile } = await import("@/lib/obsidian/client");
    vi.mocked(writeVaultFile).mockResolvedValue(undefined);
    vi.mocked(readVaultFile).mockResolvedValue(null);

    mockGetRecords.mockReturnValue([
      makeRecord({ type: "expense", amount: 50, category: "comida", createdAt: "2026-05-19T08:00:00.000Z" }),
      makeRecord({ type: "expense", amount: 30, category: "comida", createdAt: "2026-05-19T09:00:00.000Z" }),
      makeRecord({ project: "Cortex", createdAt: "2026-05-19T10:00:00.000Z" }),
    ]);

    const { analyzeAndUpdateProfile } = await import("@/lib/aionProfile");
    const profile = await analyzeAndUpdateProfile();

    expect(profile.energyPattern.length).toBeGreaterThan(0);
    expect(profile.categorySpending.length).toBeGreaterThan(0);
    expect(profile.activeProjects.length).toBeGreaterThan(0);
    expect(profile.version).toBe(1);
    expect(profile.updatedAt).toBeTruthy();
  });
});
