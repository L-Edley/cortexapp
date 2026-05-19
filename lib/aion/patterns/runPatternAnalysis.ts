import type { AionProfile } from "../../aionProfile";
import type { DailyInsight, PatternAnalysis } from "../patternDetector";
import { getRecords } from "../../storage";
import { loadProfile, updateProfile, formatProfileForContext } from "../../aionProfile";
import { analyzePatterns, updateProfileWithPatterns } from "../patternDetector";
import { saveKnowledge } from "../brain/knowledge";

const STORAGE_KEY_LAST_ANALYSIS = "aion_last_pattern_analysis";
const STORAGE_KEY_LATEST_INSIGHT = "aion_latest_daily_insight";
const ANALYSIS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type PatternAnalysisResult = {
  skipped: boolean;
  reason?: string;
  patternsDetected: number;
  profileUpdated: boolean;
  insightsGenerated: boolean;
  errors: string[];
};

export function shouldRunPatternAnalysis(force = false): boolean {
  if (force) return true;
  if (typeof window === "undefined") return false;
  const lastRun = localStorage.getItem(STORAGE_KEY_LAST_ANALYSIS);
  if (!lastRun) return true;
  return Date.now() - Number(lastRun) >= ANALYSIS_COOLDOWN_MS;
}

function storeLatestInsight(insight: DailyInsight): void {
  try {
    localStorage.setItem(STORAGE_KEY_LATEST_INSIGHT, JSON.stringify(insight));
  } catch {
  }
}

export function getLatestDailyInsight(): DailyInsight | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LATEST_INSIGHT);
    if (!raw) return null;
    return JSON.parse(raw) as DailyInsight;
  } catch {
    return null;
  }
}

function summarizeInsightsForKnowledge(analysis: PatternAnalysis): string {
  const parts: string[] = [];
  if (analysis.financial.length > 0) {
    const top = analysis.financial
      .slice(0, 2)
      .map((f) => f.description)
      .join("; ");
    parts.push(`Financeiro: ${top}`);
  }
  if (analysis.productivity.length > 0) {
    const top = analysis.productivity
      .slice(0, 2)
      .map((p) => p.description)
      .join("; ");
    parts.push(`Produtividade: ${top}`);
  }
  if (analysis.habits.length > 0) {
    const top = analysis.habits
      .slice(0, 2)
      .map((h) => h.description)
      .join("; ");
    parts.push(`Hábitos: ${top}`);
  }
  return parts.join("\n");
}

export async function runPatternAnalysis(
  options?: { force?: boolean }
): Promise<PatternAnalysisResult> {
  const result: PatternAnalysisResult = {
    skipped: false,
    patternsDetected: 0,
    profileUpdated: false,
    insightsGenerated: false,
    errors: [],
  };

  if (typeof window === "undefined") {
    result.skipped = true;
    result.reason = "server_side";
    return result;
  }

  if (!shouldRunPatternAnalysis(options?.force ?? false)) {
    result.skipped = true;
    result.reason = "already_run_recently";
    return result;
  }

  try {
    const records = getRecords();
    if (records.length === 0) {
      result.skipped = true;
      result.reason = "no_records";
      return result;
    }

    const analysis = analyzePatterns(records);
    result.patternsDetected =
      analysis.financial.length +
      analysis.productivity.length +
      analysis.habits.length;

    storeLatestInsight(analysis.dailyInsight);
    result.insightsGenerated = true;

    try {
      const profile = await loadProfile();
      const updated = updateProfileWithPatterns(profile, analysis);
      await updateProfile({
        energyPattern: updated.energyPattern,
        behaviorTriggers: updated.behaviorTriggers,
        activeProjects: updated.activeProjects,
        categorySpending: updated.categorySpending,
        consistentHabits: updated.consistentHabits,
        abandonedHabits: updated.abandonedHabits,
        lastFinancialReview: updated.lastFinancialReview,
        lastGoalReview: updated.lastGoalReview,
      });
      result.profileUpdated = true;
    } catch (err) {
      result.errors.push(
        `profile_update: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    try {
      if (result.patternsDetected > 0) {
        const knowledgeSummary = summarizeInsightsForKnowledge(analysis);
        await saveKnowledge({
          id: `pattern-analysis-${Date.now()}`,
          type: "pattern",
          title: "Análise de padrões",
          content: knowledgeSummary,
          tags: ["pattern", "analysis", "automated"],
          source: "system",
          confidence: 0.8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      result.errors.push(
        `knowledge_save: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    localStorage.setItem(STORAGE_KEY_LAST_ANALYSIS, String(Date.now()));
  } catch (err) {
    result.errors.push(
      `analysis: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}

export function buildEnhancedProfileContext(profile: AionProfile): string {
  const base = formatProfileForContext(profile);
  const insight = getLatestDailyInsight();
  if (!insight) return base;

  const parts: string[] = [base, "", "PADRÕES DETECTADOS:"];
  if (insight.financial.length > 0) {
    parts.push(
      "Financeiro: " +
        insight.financial
          .slice(0, 2)
          .map((f) => f.description)
          .join(" | ")
    );
  }
  if (insight.productivity.length > 0) {
    parts.push(
      "Produtividade: " +
        insight.productivity
          .slice(0, 2)
          .map((p) => p.description)
          .join(" | ")
    );
  }
  if (insight.habits.length > 0) {
    parts.push(
      "Hábitos: " +
        insight.habits
          .slice(0, 2)
          .map((h) => h.description)
          .join(" | ")
    );
  }
  parts.push("Sugestão: " + insight.suggestion);

  return parts.join("\n");
}
