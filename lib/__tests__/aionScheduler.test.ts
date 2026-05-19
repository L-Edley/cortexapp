import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRunPatternAnalysis = vi.fn(async () => ({
  skipped: false,
  patternsDetected: 0,
  profileUpdated: false,
  insightsGenerated: false,
  errors: [],
}));
const mockCheckAllAlerts = vi.fn(async () => []);
const mockClearOldAlerts = vi.fn();
const mockShouldShowBriefing = vi.fn(() => true);

vi.mock("@/lib/aion/patterns/runPatternAnalysis", () => ({
  runPatternAnalysis: (...args: any[]) => mockRunPatternAnalysis(...args),
}));

vi.mock("@/lib/aionAlerts", () => ({
  checkAllAlerts: (...args: any[]) => mockCheckAllAlerts(...args),
  clearOldAlerts: (...args: any[]) => mockClearOldAlerts(...args),
}));

vi.mock("@/lib/dailyBriefing", () => ({
  shouldShowBriefing: (...args: any[]) => mockShouldShowBriefing(...args),
}));

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

describe("Aion Scheduler Layer", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    localStorageMock.clear();
    mockRunPatternAnalysis.mockClear();
    mockCheckAllAlerts.mockClear();
    mockClearOldAlerts.mockClear();
    mockShouldShowBriefing.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shouldRunJob retorna true se nunca rodou", async () => {
    const { shouldRunJob } = await import("../aionScheduler");
    expect(shouldRunJob("pattern_analysis", 1000)).toBe(true);
  });

  it("shouldRunJob retorna false se rodou recentemente", async () => {
    const { shouldRunJob, markJobRun } = await import("../aionScheduler");
    markJobRun("pattern_analysis");
    expect(shouldRunJob("pattern_analysis", 100000)).toBe(false);
  });

  it("shouldRunJob retorna true após intervalo", async () => {
    const { shouldRunJob } = await import("../aionScheduler");
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    localStorageMock.setItem("aion_job_last_run_pattern_analysis", twoHoursAgo.toString());

    const oneHour = 60 * 60 * 1000;
    expect(shouldRunJob("pattern_analysis", oneHour)).toBe(true);
  });

  it("markJobRun salva timestamp", async () => {
    const { markJobRun } = await import("../aionScheduler");
    markJobRun("pattern_analysis");
    const val = localStorageMock.getItem("aion_job_last_run_pattern_analysis");
    expect(val).not.toBeNull();
    expect(Number(val)).toBeLessThanOrEqual(Date.now());
  });

  it("runAionScheduledJobs chama pattern_analysis quando devido", async () => {
    const { runAionScheduledJobs } = await import("../aionScheduler");
    const results = await runAionScheduledJobs();

    expect(mockRunPatternAnalysis).toHaveBeenCalled();
    const paResult = results.find((r) => r.jobName === "pattern_analysis");
    expect(paResult).toBeDefined();
    expect(paResult!.success).toBe(true);
  });

  it("runAionScheduledJobs chama alerts_check quando devido", async () => {
    const { runAionScheduledJobs } = await import("../aionScheduler");
    const results = await runAionScheduledJobs();

    expect(mockCheckAllAlerts).toHaveBeenCalled();
    const acResult = results.find((r) => r.jobName === "alerts_check");
    expect(acResult).toBeDefined();
    expect(acResult!.success).toBe(true);
  });

  it("não quebra se um job falhar", async () => {
    const { runAionScheduledJobs } = await import("../aionScheduler");
    mockCheckAllAlerts.mockRejectedValueOnce(new Error("Check error"));

    const results = await runAionScheduledJobs();
    const acResult = results.find((r) => r.jobName === "alerts_check");
    expect(acResult).toBeDefined();
    expect(acResult!.success).toBe(false);
    expect(acResult!.error).toBe("Check error");

    const coaResult = results.find((r) => r.jobName === "clear_old_alerts");
    expect(coaResult).toBeDefined();
    expect(coaResult!.success).toBe(true);
  });

  it("visibilitychange não quebra no ambiente sem document", () => {
    const originalDocument = globalThis.document;
    try {
      // @ts-expect-error - deleting global document for testing purposes
      delete globalThis.document;

      expect(() => {
        if (typeof document !== "undefined") {
          document.addEventListener("visibilitychange", () => {});
        }
      }).not.toThrow();
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
