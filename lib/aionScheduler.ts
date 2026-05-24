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

export async function runAionScheduledJobs(_options?: { force?: boolean }): Promise<AionJobResult[]> {
  console.log("[SCHEDULER] Jobs migrados para AION Core — scheduler local desligado");
  return [];
}
