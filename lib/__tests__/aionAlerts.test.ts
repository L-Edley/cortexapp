import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CortexRecord } from "../types";
import type { AionProfile } from "../aionProfile";
import type { AionAlert } from "../aionAlerts";

// Mock dependent modules
const mockGetRecords = vi.fn(() => [] as CortexRecord[]);
const mockLoadProfile = vi.fn(async () => defaultProfile());

vi.mock("@/lib/storageProvider", () => ({
  getRecords: () => mockGetRecords(),
}));

vi.mock("@/lib/aionProfile", () => ({
  loadProfile: () => mockLoadProfile(),
}));

vi.mock("@/lib/aion/patterns/runPatternAnalysis", () => ({
  getLatestDailyInsight: vi.fn(() => null),
  runPatternAnalysis: vi.fn(),
}));

function defaultProfile(): AionProfile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
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
}

function makeRecord(overrides: Partial<CortexRecord> = {}): CortexRecord {
  return {
    id: "test-rec-" + Math.random().toString(36).substr(2, 9),
    type: "task",
    title: "Test Record",
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

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// LocalStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn(() => null),
    length: 0,
  };
})();

describe("Aion Alerts System", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    localStorageMock.clear();
    mockGetRecords.mockReset();
    mockLoadProfile.mockReset();
    mockLoadProfile.mockResolvedValue(defaultProfile());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gasto alto gera FINANCEIRO_ALTO", async () => {
    const { checkAllAlerts } = await import("../aionAlerts");

    mockGetRecords.mockReturnValue([
      makeRecord({
        type: "expense",
        amount: 100,
        category: "alimentação",
        createdAt: todayISO(-5) + "T12:00:00.000Z",
      }),
      makeRecord({
        type: "expense",
        amount: 500,
        category: "alimentação",
        createdAt: todayISO() + "T12:00:00.000Z",
      }),
    ]);

    const alerts = await checkAllAlerts();
    const financialAlert = alerts.find((a) => a.type === "FINANCEIRO_ALTO");

    expect(financialAlert).toBeDefined();
    expect(financialAlert!.urgency).toBe("medium");
    expect(financialAlert!.description).toContain("alimentação");
  });

  it("hábito sem registro gera HABITO_ABANDONADO", async () => {
    const { checkAllAlerts } = await import("../aionAlerts");

    const profile = defaultProfile();
    // Add habit to consistent/abandoned list with lastDate 7 days ago
    const lastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    profile.consistentHabits = [{ name: "meditar", consistency: 0.8, lastDate }];

    mockLoadProfile.mockResolvedValue(profile);

    const alerts = await checkAllAlerts();
    const habitAlert = alerts.find((a) => a.type === "HABITO_ABANDONADO");

    expect(habitAlert).toBeDefined();
    expect(habitAlert!.title).toContain("meditar");
  });

  it("projeto inativo gera PROJETO_INATIVO", async () => {
    const { checkAllAlerts } = await import("../aionAlerts");

    const profile = defaultProfile();
    // Project last interaction was 10 days ago
    const lastInteraction = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    profile.activeProjects = [{ name: "cortex app", lastInteraction }];

    mockLoadProfile.mockResolvedValue(profile);
    mockGetRecords.mockReturnValue([]);

    const alerts = await checkAllAlerts();
    const projectAlert = alerts.find((a) => a.type === "PROJETO_INATIVO");

    expect(projectAlert).toBeDefined();
    expect(projectAlert!.title).toContain("cortex app");
  });

  it("tarefa vencendo gera TAREFA_VENCENDO", async () => {
    const { checkAllAlerts } = await import("../aionAlerts");

    const in12h = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    mockGetRecords.mockReturnValue([
      makeRecord({
        type: "task",
        title: "Pagar internet",
        status: "pending",
        dueDate: in12h,
      }),
    ]);

    const alerts = await checkAllAlerts();
    const taskAlert = alerts.find((a) => a.type === "TAREFA_VENCENDO");

    expect(taskAlert).toBeDefined();
    expect(taskAlert!.title).toContain("Pagar internet");
  });

  it("padrão positivo gera PADRAO_POSITIVO", async () => {
    const { checkAllAlerts } = await import("../aionAlerts");

    mockGetRecords.mockReturnValue([
      makeRecord({ type: "task", title: "Task 1", status: "done", createdAt: todayISO() + "T10:00:00.000Z" }),
      makeRecord({ type: "task", title: "Task 2", status: "done", createdAt: todayISO() + "T11:00:00.000Z" }),
      makeRecord({ type: "task", title: "Task 3", status: "done", createdAt: todayISO() + "T12:00:00.000Z" }),
    ]);

    const alerts = await checkAllAlerts();
    const positiveAlert = alerts.find((a) => a.type === "PADRAO_POSITIVO");

    expect(positiveAlert).toBeDefined();
    expect(positiveAlert!.title).toContain("Dia produtivo!");
  });

  it("não duplica alerta já existente", async () => {
    const { checkAllAlerts } = await import("../aionAlerts");

    const in12h = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    mockGetRecords.mockReturnValue([
      makeRecord({
        type: "task",
        title: "Pagar internet",
        status: "pending",
        dueDate: in12h,
      }),
    ]);

    // First check should generate the alert
    const firstRun = await checkAllAlerts();
    expect(firstRun.length).toBe(1);

    // Second check should not duplicate it
    const secondRun = await checkAllAlerts();
    expect(secondRun.length).toBe(0);
  });

  it("markAlertShown marca como exibido", async () => {
    const { checkAllAlerts, getUnshownAlerts, markAlertShown } = await import("../aionAlerts");

    const in12h = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    mockGetRecords.mockReturnValue([
      makeRecord({
        type: "task",
        title: "Pagar internet",
        status: "pending",
        dueDate: in12h,
      }),
    ]);

    const alerts = await checkAllAlerts();
    expect(alerts.length).toBe(1);

    const unshownBefore = getUnshownAlerts();
    expect(unshownBefore.length).toBe(1);

    markAlertShown(alerts[0].id);

    const unshownAfter = getUnshownAlerts();
    expect(unshownAfter.length).toBe(0);
  });

  it("clearOldAlerts remove alertas antigos", async () => {
    const { clearOldAlerts } = await import("../aionAlerts");

    const oldAlert: AionAlert = {
      id: "old-alert",
      type: "PADRAO_POSITIVO",
      title: "Old success",
      description: "You did something great 35 days ago",
      urgency: "low",
      createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
      shown: true,
    };

    localStorageMock.setItem("aion_alerts", JSON.stringify([oldAlert]));

    clearOldAlerts(30);

    const stored = JSON.parse(localStorageMock.getItem("aion_alerts") || "[]");
    expect(stored.length).toBe(0);
  });

  it("checkAllAlerts não quebra sem registros", async () => {
    const { checkAllAlerts } = await import("../aionAlerts");

    mockGetRecords.mockReturnValue([]);
    const alerts = await checkAllAlerts();
    expect(alerts).toEqual([]);
  });
});
