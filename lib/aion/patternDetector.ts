import type { CortexRecord } from "../types";
import type { AionProfile, EnergyPattern, BehaviorTrigger, ActiveProject, CategorySpending, HabitInfo } from "../aionProfile";

export type FinancialInsight = {
  type: "spending_anomaly" | "recurring_expense" | "category_trend" | "budget_alert";
  category: string;
  description: string;
  currentValue: number;
  previousValue?: number;
  changePercent?: number;
  severity: "low" | "medium" | "high";
};

export type ProductivityInsight = {
  type: "completion_rate" | "peak_time" | "task_throughput" | "priority_balance";
  description: string;
  value: number;
  previousValue?: number;
};

export type HabitInsight = {
  type: "streak" | "consistency_trend" | "emerging_habit" | "declining_habit";
  habitName: string;
  description: string;
  currentStreak?: number;
  consistency: number;
};

export type DailyInsight = {
  date: string;
  summary: string;
  financial: FinancialInsight[];
  productivity: ProductivityInsight[];
  habits: HabitInsight[];
  topPriority: string;
  suggestion: string;
};

export type PatternAnalysis = {
  financial: FinancialInsight[];
  productivity: ProductivityInsight[];
  habits: HabitInsight[];
  dailyInsight: DailyInsight;
};

type ExpensesByCategory = {
  total: number;
  count: number;
  amounts: number[];
  dates: string[];
};

function getDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round(Math.abs(da - db) / (24 * 60 * 60 * 1000));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

export function analyzeFinancialPatterns(records: CortexRecord[]): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const expenses = records.filter(
    (r) => r.type === "expense" && r.amount !== null && r.amount > 0
  );

  if (expenses.length < 2) return insights;

  const byCategory = new Map<string, ExpensesByCategory>();
  for (const r of expenses) {
    const cat = r.category || "geral";
    const existing = byCategory.get(cat) ?? { total: 0, count: 0, amounts: [], dates: [] };
    existing.total += r.amount!;
    existing.count += 1;
    existing.amounts.push(r.amount!);
    existing.dates.push(r.createdAt);
    byCategory.set(cat, existing);
  }

  const now = Date.now();
  const mid = now - 7 * 24 * 60 * 60 * 1000;

  for (const [category, data] of byCategory) {
    const recent: number[] = [];
    const past: number[] = [];
    for (let i = 0; i < data.dates.length; i++) {
      const t = new Date(data.dates[i]).getTime();
      if (t >= mid) {
        recent.push(data.amounts[i]);
      } else {
        past.push(data.amounts[i]);
      }
    }

    if (recent.length > 0 && past.length > 0) {
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const pastAvg = past.reduce((a, b) => a + b, 0) / past.length;
      const change = pastAvg > 0 ? (recentAvg - pastAvg) / pastAvg : 1;
      const absChange = Math.abs(change);

      if (absChange > 0.3) {
        const isIncrease = change > 0;
        insights.push({
          type: "spending_anomaly",
          category,
          description: isIncrease
            ? `Gastos em ${category} aumentaram ${(absChange * 100).toFixed(0)}% (${formatMoney(recentAvg)} vs ${formatMoney(pastAvg)} antes)`
            : `Gastos em ${category} caíram ${(absChange * 100).toFixed(0)}% (${formatMoney(recentAvg)} vs ${formatMoney(pastAvg)} antes)`,
          currentValue: Math.round(recentAvg * 100) / 100,
          previousValue: Math.round(pastAvg * 100) / 100,
          changePercent: Math.round(change * 100),
          severity: absChange > 0.5 ? "high" : absChange > 0.3 ? "medium" : "low",
        });
      }
    }

    const recurring = findRecurringExpenses(data.amounts, data.dates, category);
    insights.push(...recurring);

    if (data.count >= 3) {
      const avg = data.total / data.count;
      if (avg > 200) {
        insights.push({
          type: "budget_alert",
          category,
          description: `Média de ${formatMoney(avg)} em ${category} — ${data.count} registros`,
          currentValue: Math.round(avg * 100) / 100,
          severity: avg > 500 ? "high" : "medium",
        });
      }
    }
  }

  return insights;
}

function findRecurringExpenses(
  amounts: number[],
  dates: string[],
  category: string
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const seen = new Map<string, { count: number; lastDate: string }>();

  for (let i = 0; i < amounts.length; i++) {
    const key = `${category}_${amounts[i]}`;
    const existing = seen.get(key) ?? { count: 0, lastDate: "" };
    existing.count += 1;
    if (dates[i] > existing.lastDate) existing.lastDate = dates[i];
    seen.set(key, existing);
  }

  for (const [key, data] of seen) {
    if (data.count >= 2) {
      const amount = Number(key.split("_").pop()!);
      const daysSinceLast = daysBetween(data.lastDate, todayISO());
      insights.push({
        type: "recurring_expense",
        category,
        description: `${formatMoney(amount)} em ${category} aparece ${data.count}x (último há ${daysSinceLast} dias)`,
        currentValue: amount,
        severity: data.count >= 4 ? "high" : "medium",
      });
    }
  }

  return insights;
}

export function analyzeProductivityPatterns(records: CortexRecord[]): ProductivityInsight[] {
  const insights: ProductivityInsight[] = [];
  const tasks = records.filter((r) => r.type === "task");
  const doneTasks = tasks.filter((r) => r.status === "done");

  if (tasks.length === 0) return insights;

  const completionRate = doneTasks.length / tasks.length;
  insights.push({
    type: "completion_rate",
    description: `${doneTasks.length} de ${tasks.length} tarefas concluídas (${(completionRate * 100).toFixed(0)}%)`,
    value: Math.round(completionRate * 100),
  });

  if (doneTasks.length >= 2) {
    const hourCounts: Record<number, number> = {};
    for (const t of doneTasks) {
      const hour = new Date(t.createdAt).getUTCHours();
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
    }
    const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
    let peakPeriod = "manhã";
    if (sorted.length > 0) {
      const peakHour = Number(sorted[0][0]);
      if (peakHour >= 5 && peakHour <= 11) peakPeriod = "manhã";
      else if (peakHour >= 12 && peakHour <= 17) peakPeriod = "tarde";
      else if (peakHour >= 18 && peakHour <= 23) peakPeriod = "noite";
      else peakPeriod = "madrugada";
    }
    insights.push({
      type: "peak_time",
      description: `Maior produtividade no período da ${peakPeriod} (${sorted[0]?.[1] ?? 0} tarefas concluídas)`,
      value: Number(sorted[0]?.[0] ?? 0),
    });
  }

  const dates = new Set(doneTasks.map((t) => getDateOnly(t.createdAt)));
  const throughput = dates.size > 0 ? doneTasks.length / dates.size : 0;
  insights.push({
    type: "task_throughput",
    description: `Média de ${throughput.toFixed(1)} tarefas/dia em ${dates.size} dias`,
    value: Math.round(throughput * 10) / 10,
  });

  const priorityCounts = { high: 0, medium: 0, low: 0 };
  for (const t of tasks) {
    if (t.priority === "high") priorityCounts.high++;
    else if (t.priority === "low") priorityCounts.low++;
    else priorityCounts.medium++;
  }
  const total = tasks.length;
  if (total > 0) {
    const highPct = Math.round((priorityCounts.high / total) * 100);
    const medPct = Math.round((priorityCounts.medium / total) * 100);
    const lowPct = Math.round((priorityCounts.low / total) * 100);
    insights.push({
      type: "priority_balance",
      description: `Distribuição: ${highPct}% alta · ${medPct}% média · ${lowPct}% baixa`,
      value: priorityCounts.high,
    });
  }

  return insights;
}

export function analyzeHabitPatterns(records: CortexRecord[]): HabitInsight[] {
  const insights: HabitInsight[] = [];
  const doneTasks = records.filter(
    (r) => r.type === "task" && r.status === "done"
  );

  if (doneTasks.length < 2) return insights;

  const byTitle = new Map<string, { dates: string[] }>();
  for (const t of doneTasks) {
    const title = t.title.toLowerCase().trim();
    if (!title) continue;
    const existing = byTitle.get(title) ?? { dates: [] };
    const day = getDateOnly(t.createdAt);
    if (!existing.dates.includes(day)) {
      existing.dates.push(day);
    }
    byTitle.set(title, existing);
  }

  const now = Date.now();
  const halfWindow = 15 * 24 * 60 * 60 * 1000;

  for (const [name, data] of byTitle) {
    const sortedDates = data.dates.sort();
    const totalDays = sortedDates.length;
    if (totalDays < 2) continue;

    const daysSinceLast = (now - new Date(sortedDates[sortedDates.length - 1]).getTime()) / (24 * 60 * 60 * 1000);

    let currentStreak = 0;
    if (daysSinceLast < 3) {
      currentStreak = 1;
      for (let i = sortedDates.length - 1; i > 0; i--) {
        const diff = daysBetween(sortedDates[i], sortedDates[i - 1]);
        if (diff <= 2) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    const firstHalf = sortedDates.filter((d) => new Date(d).getTime() < now - halfWindow).length;
    const secondHalf = sortedDates.filter((d) => new Date(d).getTime() >= now - halfWindow).length;
    const consistency = Math.min(1, totalDays / 30);

    if (currentStreak >= 3) {
      insights.push({
        type: "streak",
        habitName: name,
        description: `${name}: sequência de ${currentStreak} dias seguidos`,
        currentStreak,
        consistency,
      });
    }

    if (firstHalf > 0 && secondHalf > firstHalf) {
      insights.push({
        type: "consistency_trend",
        habitName: name,
        description: `${name}: aumentando frequência (${secondHalf} vs ${firstHalf} na 1ª metade)`,
        consistency,
      });
    }

    if (secondHalf >= 2 && firstHalf === 0) {
      insights.push({
        type: "emerging_habit",
        habitName: name,
        description: `${name}: novo hábito emergente — ${secondHalf} registros recentes`,
        consistency,
      });
    }

    if (firstHalf > secondHalf && secondHalf === 0 && daysSinceLast > 7) {
      insights.push({
        type: "declining_habit",
        habitName: name,
        description: `${name}: hábito em declínio — sem registros há ${Math.round(daysSinceLast)} dias`,
        consistency,
      });
    }
  }

  return insights;
}

export function generateDailyInsight(
  records: CortexRecord[],
  financial: FinancialInsight[],
  productivity: ProductivityInsight[],
  habits: HabitInsight[]
): DailyInsight {
  const today = todayISO();
  const todayRecords = records.filter((r) => getDateOnly(r.createdAt) === today);
  const todayTasks = todayRecords.filter((r) => r.type === "task");
  const todayExpenses = todayRecords.filter(
    (r) => r.type === "expense" && r.amount !== null
  );
  const todayIdeas = todayRecords.filter((r) => r.type === "idea");

  const highPriority = todayTasks
    .filter((r) => r.priority === "high" && r.status === "pending")
    .slice(0, 3);
  const totalSpentToday = todayExpenses.reduce((s, r) => s + (r.amount ?? 0), 0);

  const parts: string[] = [];
  if (todayTasks.length > 0) {
    const done = todayTasks.filter((r) => r.status === "done").length;
    parts.push(`${todayTasks.length} tarefas (${done} concluídas)`);
  }
  if (todayExpenses.length > 0) {
    parts.push(`${todayExpenses.length} gastos (${formatMoney(totalSpentToday)})`);
  }
  if (todayIdeas.length > 0) {
    parts.push(`${todayIdeas.length} ideias`);
  }

  let summary = parts.length > 0
    ? `Hoje: ${parts.join(", ")}.`
    : "Nenhum registro hoje.";

  let topPriority = "Nenhuma prioridade urgente.";
  if (highPriority.length > 0) {
    topPriority = highPriority.map((t) => t.title).join(", ");
  }

  let suggestion = "";
  if (financial.length > 0) {
    const mostSevere = financial.find((f) => f.severity === "high") ?? financial[0];
    suggestion = `Rever gastos em ${mostSevere.category}. `;
  }
  if (productivity.length > 0) {
    const rate = productivity.find((p) => p.type === "completion_rate");
    if (rate && rate.value < 50) {
      suggestion += "Foco em concluir tarefas pendentes. ";
    }
  }
  if (habits.length > 0) {
    const declining = habits.filter((h) => h.type === "declining_habit");
    if (declining.length > 0) {
      suggestion += `Retomar ${declining[0].habitName}. `;
    }
  }
  if (!suggestion) {
    suggestion = "Bom trabalho! Continue mantendo o ritmo.";
  }

  return {
    date: today,
    summary,
    financial,
    productivity,
    habits,
    topPriority,
    suggestion: suggestion.trim(),
  };
}

export function analyzePatterns(records: CortexRecord[]): PatternAnalysis {
  const financial = analyzeFinancialPatterns(records);
  const productivity = analyzeProductivityPatterns(records);
  const habits = analyzeHabitPatterns(records);
  const dailyInsight = generateDailyInsight(records, financial, productivity, habits);

  return { financial, productivity, habits, dailyInsight };
}

export function updateProfileWithPatterns(
  profile: AionProfile,
  analysis: PatternAnalysis
): AionProfile {
  const now = new Date().toISOString();

  const hasFinancialData = analysis.financial.length > 0;
  const hasProductivityData = analysis.productivity.length > 0;

  const mergedEnergyPatterns: EnergyPattern[] = [
    ...profile.energyPattern,
  ];
  if (analysis.productivity.length > 0) {
    const peakInsight = analysis.productivity.find((p) => p.type === "peak_time");
    if (peakInsight) {
      let period = "manhã";
      let label = "focado";
      const hour = peakInsight.value;
      if (hour >= 5 && hour <= 11) { period = "manhã"; label = "focado"; }
      else if (hour >= 12 && hour <= 17) { period = "tarde"; label = "produtivo"; }
      else if (hour >= 18 && hour <= 23) { period = "noite"; label = "criativo"; }
      else { period = "madrugada"; label = "reflexivo"; }

      if (!mergedEnergyPatterns.some((e) => e.period === period)) {
        mergedEnergyPatterns.push({ period, label });
      }
    }
  }

  const mergedBehaviorTriggers: BehaviorTrigger[] = [
    ...profile.behaviorTriggers,
  ];

  const mergedActiveProjects: ActiveProject[] = [
    ...profile.activeProjects,
  ];
  const recentProjects = analysis.dailyInsight.topPriority;
  if (recentProjects && recentProjects !== "Nenhuma prioridade urgente.") {
    const projectNames = recentProjects.split(", ").map((s) => s.trim());
    for (const name of projectNames) {
      if (name && !mergedActiveProjects.some((p) => p.name === name)) {
        mergedActiveProjects.push({ name, lastInteraction: now });
      }
    }
  }

  const mergedCategorySpending: CategorySpending[] = [
    ...profile.categorySpending,
  ];
  for (const fi of analysis.financial) {
    if (fi.type === "spending_anomaly" || fi.type === "budget_alert") {
      const existing = mergedCategorySpending.find(
        (cs) => cs.category === fi.category
      );
      if (existing) {
        existing.average = Math.round((existing.average + fi.currentValue) / 2 * 100) / 100;
        existing.count += 1;
      } else {
        mergedCategorySpending.push({
          category: fi.category,
          average: fi.currentValue,
          count: 1,
        });
      }
    }
  }

  const mergedConsistentHabits: HabitInfo[] = [
    ...profile.consistentHabits,
  ];
  const mergedAbandonedHabits: HabitInfo[] = [
    ...profile.abandonedHabits,
  ];
  for (const hi of analysis.habits) {
    if (hi.type === "streak" || hi.type === "emerging_habit") {
      if (!mergedConsistentHabits.some((h) => h.name === hi.habitName)) {
        mergedConsistentHabits.push({
          name: hi.habitName,
          consistency: hi.consistency,
          lastDate: now,
        });
      }
    }
    if (hi.type === "declining_habit") {
      if (!mergedAbandonedHabits.some((h) => h.name === hi.habitName)) {
        mergedAbandonedHabits.push({
          name: hi.habitName,
          consistency: hi.consistency,
          lastDate: now,
        });
      }
    }
  }

  return {
    ...profile,
    energyPattern: mergedEnergyPatterns,
    behaviorTriggers: mergedBehaviorTriggers,
    activeProjects: mergedActiveProjects,
    categorySpending: mergedCategorySpending,
    consistentHabits: mergedConsistentHabits,
    abandonedHabits: mergedAbandonedHabits,
    lastFinancialReview: hasFinancialData ? now : profile.lastFinancialReview,
    lastGoalReview: hasProductivityData ? now : profile.lastGoalReview,
    updatedAt: now,
  };
}
