import { runPatternAnalysis } from "@/lib/aion/patterns/runPatternAnalysis";
import { checkAllAlerts, clearOldAlerts } from "@/lib/aionAlerts";
import { shouldShowBriefing } from "@/lib/dailyBriefing";

export type AionJobName =
  | "pattern_analysis"
  | "daily_briefing"
  | "alerts_check"
  | "clear_old_alerts"
  | "semantic_maintenance";

export interface AionJobResult {
  jobName: AionJobName;
  success: boolean;
  error?: string;
  timestamp: string;
}

export const JOB_INTERVALS: Record<AionJobName, number> = {
  pattern_analysis: 24 * 60 * 60 * 1000, // 24 hours
  daily_briefing: 24 * 60 * 60 * 1000,   // 24 hours
  alerts_check: 2 * 60 * 60 * 1000,      // 2 hours
  clear_old_alerts: 24 * 60 * 60 * 1000,  // 24 hours
  semantic_maintenance: 24 * 60 * 60 * 1000, // 24 hours
};

export function shouldRunJob(jobName: AionJobName, intervalMs: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    const lastRun = localStorage.getItem(`aion_job_last_run_${jobName}`);
    if (!lastRun) return true;
    const lastRunMs = Number(lastRun);
    if (isNaN(lastRunMs)) return true;
    return Date.now() - lastRunMs >= intervalMs;
  } catch {
    return false;
  }
}

export function markJobRun(jobName: AionJobName): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`aion_job_last_run_${jobName}`, Date.now().toString());
  } catch {
    // Ignore errors to ensure UI stability
  }
}

export async function runAionScheduledJobs(options?: { force?: boolean }): Promise<AionJobResult[]> {
  if (typeof window === "undefined") return [];

  const results: AionJobResult[] = [];
  const force = options?.force ?? false;

  const jobsList: { name: AionJobName; run: () => Promise<void> }[] = [
    {
      name: "pattern_analysis",
      run: async () => {
        await runPatternAnalysis({ force: false });
      },
    },
    {
      name: "alerts_check",
      run: async () => {
        await checkAllAlerts();
      },
    },
    {
      name: "clear_old_alerts",
      run: async () => {
        clearOldAlerts(30);
      },
    },
    {
      name: "daily_briefing",
      run: async () => {
        // Safe check only, does not mark briefing shown in background
        shouldShowBriefing();
      },
    },
    {
      name: "semantic_maintenance",
      run: async () => {
        console.log("[SCHEDULER] Executing semantic maintenance...");
      },
    },
  ];

  for (const job of jobsList) {
    const interval = JOB_INTERVALS[job.name];
    if (force || shouldRunJob(job.name, interval)) {
      try {
        await job.run();
        markJobRun(job.name);
        results.push({
          jobName: job.name,
          success: true,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          jobName: job.name,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
        console.warn(`[SCHEDULER] Job "${job.name}" failed:`, err);
      }
    }
  }

  return results;
}
