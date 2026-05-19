import type { AionProfile } from "@/lib/aionProfile";
import type { DailyInsight } from "@/lib/aion/patternDetector";
import { getRecords, getTopPendingTasks, getSpentToday } from "@/lib/storageProvider";
import { loadProfile } from "@/lib/aionProfile";
import { getLatestDailyInsight } from "@/lib/aion/patterns/runPatternAnalysis";

const BRIEFING_STORAGE_KEY = "aion_briefing_date";

export type DailyBriefing = {
  id: string;
  date: string;
  greeting: string;
  summary: string;
  financial?: string;
  priorities: string[];
  habits: string[];
  insights: string[];
  suggestion?: string;
  question?: string;
  generatedAt: string;
};

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatMoney(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

function extractBriefingInsights(dailyInsight: DailyInsight | null): string[] {
  if (!dailyInsight) return [];
  const insights: string[] = [];
  const fi = dailyInsight.financial;
  const pi = dailyInsight.productivity;
  const hi = dailyInsight.habits;

  for (const f of fi.slice(0, 2)) {
    insights.push(f.description);
  }
  for (const p of pi.slice(0, 2)) {
    insights.push(p.description);
  }
  for (const h of hi.slice(0, 2)) {
    insights.push(h.description);
  }
  return insights;
}

function generateSuggestion(
  pendingTasks: number,
  totalSpentToday: number,
  profile: AionProfile | null,
  dailyInsight: DailyInsight | null
): string | undefined {
  if (pendingTasks > 3) {
    return "Que tal focar nas 3 tarefas mais urgentes primeiro?";
  }
  if (pendingTasks > 0 && pendingTasks <= 3) {
    return "Comece pelo mais importante e elimine uma tarefa de cada vez.";
  }
  if (totalSpentToday > 0 && profile?.categorySpending && profile.categorySpending.length > 0) {
    const top = profile.categorySpending[0];
    return `Seus maiores gastos são em ${top.category}. Que tal revisar?`;
  }
  if (dailyInsight?.suggestion && dailyInsight.suggestion !== "Bom trabalho! Continue mantendo o ritmo.") {
    return dailyInsight.suggestion;
  }
  if (pendingTasks === 0) {
    return "Parece que está com o dia livre. Que tal planejar algo novo?";
  }
  return undefined;
}

function generateQuestion(
  profile: AionProfile | null,
  pendingTasks: number
): string | undefined {
  if (!profile?.currentGoal && pendingTasks === 0) {
    return "Qual seu objetivo principal hoje?";
  }
  if (profile?.currentGoal) {
    return `Como posso ajudar com "${profile.currentGoal}" hoje?`;
  }
  if (pendingTasks > 0) {
    return "Quer definir prazos para essas tarefas?";
  }
  return "O que vamos fazer hoje?";
}

export function shouldShowBriefing(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const lastDate = localStorage.getItem(BRIEFING_STORAGE_KEY);
    if (!lastDate) return true;
    return lastDate !== todayStr();
  } catch {
    return false;
  }
}

export function markBriefingShown(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BRIEFING_STORAGE_KEY, todayStr());
  } catch {
    /* SSR-safe */
  }
}

export async function generateBriefing(): Promise<DailyBriefing> {
  const today = todayStr();
  const greeting = generateGreeting();
  const profile = await loadProfile();
  const dailyInsight = getLatestDailyInsight();
  const records = getRecords();
  const topTasks = getTopPendingTasks(3);
  const totalSpentToday = getSpentToday();

  const pendingTasks = records.filter(
    (r) => r.type === "task" && r.status === "pending"
  ).length;

  const userName = profile?.userName?.trim() || "";
  const greetingText = userName
    ? `${greeting}, ${userName}!`
    : `${greeting}!`;

  const summaryParts: string[] = [];
  if (pendingTasks > 0) {
    summaryParts.push(`${pendingTasks} tarefa${pendingTasks > 1 ? "s" : ""} pendente${pendingTasks > 1 ? "s" : ""}`);
  }
  if (totalSpentToday > 0) {
    summaryParts.push(`${formatMoney(totalSpentToday)} em gastos hoje`);
  }

  const taskSummary = pendingTasks > 0
    ? `${summaryParts.join(" e ")}`
    : "Nenhuma tarefa pendente hoje";

  const priorities = topTasks.map((t) => t.title);

  const habits: string[] = [];
  if (profile) {
    for (const h of profile.consistentHabits.slice(0, 3)) {
      habits.push(`${h.name} (${Math.round(h.consistency * 100)}% consistência)`);
    }
  }

  const insights = extractBriefingInsights(dailyInsight);

  const suggestion = generateSuggestion(
    pendingTasks,
    totalSpentToday,
    profile,
    dailyInsight
  );

  const question = generateQuestion(profile, pendingTasks);

  const financialSummary = totalSpentToday > 0
    ? `Gastos hoje: ${formatMoney(totalSpentToday)}`
    : undefined;

  return {
    id: `briefing-${today}`,
    date: today,
    greeting: greetingText,
    summary: taskSummary,
    financial: financialSummary,
    priorities,
    habits,
    insights,
    suggestion,
    question,
    generatedAt: new Date().toISOString(),
  };
}
