// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";

// Mock dependent modules
vi.mock("@/lib/storageProvider", () => ({
  saveRecord: vi.fn(),
  getRecords: vi.fn(() => []),
}));

vi.mock("@/lib/aionProfile", () => ({
  loadProfile: vi.fn(async () => ({
    version: 1,
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
  })),
  analyzeAndUpdateProfile: vi.fn(async () => ({})),
}));

vi.mock("@/lib/aion/patterns", () => ({
  runPatternAnalysis: vi.fn(async () => ({})),
  buildEnhancedProfileContext: vi.fn(() => ""),
}));

vi.mock("@/lib/dailyBriefing", () => ({
  shouldShowBriefing: vi.fn(() => true),
  generateBriefing: vi.fn(async () => ({
    greeting: "Olá João!",
    summary: "Resumo do dia.",
    financial: "",
    priorities: [],
    habits: [],
    insights: [],
    suggestion: "Faça uma caminhada.",
    question: "Tudo bem?",
  })),
  markBriefingShown: vi.fn(),
}));

vi.mock("@/lib/aionAlerts", () => ({
  checkAllAlerts: vi.fn(async () => {
    throw new Error("Erro de simulação de alertas");
  }),
  getUnshownAlerts: vi.fn(() => []),
  markAlertShown: vi.fn(),
}));

const mockRunAionScheduledJobs = vi.fn(async () => {
  return [];
});

vi.mock("@/lib/aionScheduler", () => ({
  runAionScheduledJobs: () => mockRunAionScheduledJobs(),
}));

vi.mock("@/components/VoiceCenter", () => ({
  default: () => null,
}));

import CommandCenter from "../CommandCenter";

describe("CommandCenter Alertas e Scheduler Integridade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAionScheduledJobs.mockResolvedValue([]);
  });

  it("não bloqueia o briefing se o sistema de alertas falhar", async () => {
    render(createElement(CommandCenter));

    // O briefing ainda deve ser exibido com sucesso
    await waitFor(() => {
      expect(screen.getByText(/Olá João!/)).toBeTruthy();
      expect(screen.getByText(/Resumo do dia./)).toBeTruthy();
    });
  });

  it("CommandCenter continua renderizando se scheduler falhar", async () => {
    mockRunAionScheduledJobs.mockRejectedValueOnce(new Error("Erro de simulação do scheduler"));
    render(createElement(CommandCenter));

    // O briefing ainda deve ser exibido com sucesso, provando que o erro do scheduler não bloqueou o app
    await waitFor(() => {
      expect(screen.getByText(/Olá João!/)).toBeTruthy();
      expect(screen.getByText(/Resumo do dia./)).toBeTruthy();
    });
  });
});
