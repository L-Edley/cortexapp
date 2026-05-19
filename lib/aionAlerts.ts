import type { CortexRecord } from "@/lib/types";
import type { AionProfile } from "@/lib/aionProfile";
import { getRecords } from "@/lib/storageProvider";
import { loadProfile } from "@/lib/aionProfile";
import { generateRecordId } from "@/lib/id";


const ALERTS_STORAGE_KEY = "aion_alerts";

export type AionAlertType =
  | "FINANCEIRO_ALTO"
  | "HABITO_ABANDONADO"
  | "PROJETO_INATIVO"
  | "META_EM_RISCO"
  | "TAREFA_VENCENDO"
  | "PADRAO_POSITIVO";

export type AionAlertUrgency = "low" | "medium" | "high";

export type AionAlert = {
  id: string;
  type: AionAlertType;
  title: string;
  description: string;
  urgency: AionAlertUrgency;
  suggestedAction?: string;
  createdAt: string;
  shown: boolean;
  sourceId?: string;
};

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function loadAlerts(): AionAlert[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AionAlert[];
  } catch {
    return [];
  }
}

function persistAlerts(alerts: AionAlert[]): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    /* SSR-safe */
  }
}

function hasDuplicate(
  existing: AionAlert[],
  type: AionAlertType,
  sourceId?: string
): boolean {
  return existing.some(
    (a) => a.type === type && a.sourceId === sourceId && !a.shown
  );
}

/* ──────────── Individual checks ──────────── */

function categorizeExpense(title: string): string | null {
  const lower = title.toLowerCase();
  if (lower.includes("almoço") || lower.includes("almoco") || lower.includes("lanche") || lower.includes("mercado") || lower.includes("restaurante") || lower.includes("comida") || lower.includes("supermercado")) return "alimentação";
  if (lower.includes("uber") || lower.includes("gasolina") || lower.includes("ônibus") || lower.includes("onibus") || lower.includes("transporte") || lower.includes("combustível") || lower.includes("combustivel")) return "transporte";
  if (lower.includes("luz") || lower.includes("água") || lower.includes("agua") || lower.includes("internet") || lower.includes("aluguel") || lower.includes("boleto") || lower.includes("telefone")) return "contas";
  if (lower.includes("remédio") || lower.includes("remedio") || lower.includes("farmácia") || lower.includes("farmacia") || lower.includes("consulta") || lower.includes("médico") || lower.includes("medico")) return "saúde";
  if (lower.includes("streaming") || lower.includes("netflix") || lower.includes("spotify") || lower.includes("assinatura")) return "assinaturas";
  if (lower.includes("curso") || lower.includes("livro") || lower.includes("educação") || lower.includes("educacao")) return "educação";
  return null;
}

function getCategorySpending(
  records: CortexRecord[]
): Map<string, { total: number; count: number }> {
  const map = new Map<string, { total: number; count: number }>();
  const expenses = records.filter(
    (r) => r.type === "expense" && r.amount !== null && r.amount > 0
  );

  for (const r of expenses) {
    const cat = r.category || categorizeExpense(r.title) || "geral";
    const existing = map.get(cat) ?? { total: 0, count: 0 };
    existing.total += r.amount!;
    existing.count += 1;
    map.set(cat, existing);
  }

  return map;
}

function checkFinancialAlert(
  records: CortexRecord[],
  existing: AionAlert[]
): AionAlert | null {
  const today = todayISO();
  const todayExpenses = records.filter(
    (r) => r.type === "expense" && r.amount !== null && r.amount > 0 && r.createdAt.startsWith(today)
  );

  if (todayExpenses.length === 0) return null;

  const categoryMap = getCategorySpending(records);

  for (const r of todayExpenses) {
    const cat = r.category || categorizeExpense(r.title) || "geral";
    const stats = categoryMap.get(cat);
    if (!stats || stats.count <= 1) continue;

    const average = stats.total / stats.count;
    if (r.amount! > average * 1.5) {
      const sourceId = `finance-${today}-${cat}`;
      if (hasDuplicate(existing, "FINANCEIRO_ALTO", sourceId)) continue;

      return {
        id: generateRecordId("expense"),
        type: "FINANCEIRO_ALTO",
        title: `Gasto alto em ${cat}`,
        description: `Hoje você gastou ${formatMoney(r.amount!)} em ${cat}, acima da média de ${formatMoney(average)} (${Math.round((r.amount! / average - 1) * 100)}% maior).`,
        urgency: "medium",
        suggestedAction: `Revisar gastos em ${cat} e ver se há alternativa.`,
        createdAt: new Date().toISOString(),
        shown: false,
        sourceId,
      };
    }
  }

  return null;
}

function checkHabitAbandoned(
  profile: AionProfile,
  existing: AionAlert[]
): AionAlert | null {
  const today = Date.now();
  const habits = [...(profile.consistentHabits || []), ...(profile.abandonedHabits || [])];

  for (const habit of habits) {
    const lastDate = new Date(habit.lastDate).getTime();
    const daysSince = Math.round((today - lastDate) / (24 * 60 * 60 * 1000));

    if (daysSince >= 7 && daysSince % 7 === 0) {
      const sourceId = `habit-${habit.name}`;
      if (hasDuplicate(existing, "HABITO_ABANDONADO", sourceId)) continue;

      const weeks = Math.floor(daysSince / 7);
      return {
        id: generateRecordId("note"),
        type: "HABITO_ABANDONADO",
        title: `Hábito "${habit.name}" abandonado`,
        description: `Faz ${daysSince} dias (${weeks} semana${weeks > 1 ? "s" : ""}) que você não registra "${habit.name}".`,
        urgency: daysSince >= 21 ? "high" : "medium",
        suggestedAction: `Que tal retomar "${habit.name}" hoje com uma pequena ação de 5 minutos?`,
        createdAt: new Date().toISOString(),
        shown: false,
        sourceId,
      };
    }
  }

  return null;
}

function checkProjectInactive(
  records: CortexRecord[],
  profile: AionProfile,
  existing: AionAlert[]
): AionAlert | null {
  const now = Date.now();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;

  for (const project of profile.activeProjects) {
    const lastInteraction = new Date(project.lastInteraction).getTime();
    if (lastInteraction > cutoff) continue;

    const daysSince = Math.round((now - lastInteraction) / (24 * 60 * 60 * 1000));
    if (daysSince < 7) continue;

    const sourceId = `project-${project.name}`;
    if (hasDuplicate(existing, "PROJETO_INATIVO", sourceId)) continue;

    const hasRecentRecord = records.some(
      (r) => r.project === project.name && new Date(r.createdAt).getTime() > cutoff
    );

    if (!hasRecentRecord) {
      return {
        id: generateRecordId("project_note"),
        type: "PROJETO_INATIVO",
        title: `Projeto "${project.name}" inativo`,
        description: `O projeto "${project.name}" está sem registros há ${daysSince} dias.`,
        urgency: daysSince >= 14 ? "high" : "low",
        suggestedAction: `Dedicar 10 minutos para revisar o andamento de "${project.name}".`,
        createdAt: new Date().toISOString(),
        shown: false,
        sourceId,
      };
    }
  }

  return null;
}

function checkGoalAtRisk(
  profile: AionProfile,
  records: CortexRecord[],
  existing: AionAlert[]
): AionAlert | null {
  if (!profile.currentGoal) return null;

  const sourceId = `goal-${profile.currentGoal}`;
  if (hasDuplicate(existing, "META_EM_RISCO", sourceId)) return null;

  const lastWeek = daysAgoISO(7);
  const recentTasks = records.filter(
    (r) => r.type === "task" && r.createdAt >= lastWeek
  );
  const doneInWeek = recentTasks.filter((r) => r.status === "done").length;
  const totalInWeek = recentTasks.length;

  if (totalInWeek >= 5 && doneInWeek / totalInWeek < 0.4) {
    return {
      id: generateRecordId("task"),
      type: "META_EM_RISCO",
      title: "Meta em risco",
      description: `Sua meta é "${profile.currentGoal}", mas só ${Math.round((doneInWeek / totalInWeek) * 100)}% das tarefas recentes foram concluídas (${doneInWeek} de ${totalInWeek}).`,
      urgency: "high",
      suggestedAction: `Revisar "${profile.currentGoal}" e dividir em passos menores.`,
      createdAt: new Date().toISOString(),
      shown: false,
      sourceId,
    };
  }

  return null;
}

function checkTaskDue(records: CortexRecord[], existing: AionAlert[]): AionAlert | null {
  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;

  const tasks = records.filter(
    (r) =>
      r.type === "task" &&
      r.status === "pending" &&
      r.dueDate !== null
  );

  for (const task of tasks) {
    let due: number;
    if (task.dueDate.includes("T")) {
      due = new Date(task.dueDate).getTime();
    } else {
      due = new Date(task.dueDate + "T23:59:59").getTime();
    }
    if (isNaN(due)) continue;

    if (due > now && due <= in24h) {
      const sourceId = `task-${task.id}`;
      if (hasDuplicate(existing, "TAREFA_VENCENDO", sourceId)) continue;

      const hoursLeft = Math.round((due - now) / (60 * 60 * 1000));
      return {
        id: generateRecordId("task"),
        type: "TAREFA_VENCENDO",
        title: `Tarefa vencendo: "${task.title}"`,
        description: `A tarefa "${task.title}" vence em ${hoursLeft} hora${hoursLeft > 1 ? "s" : ""}.`,
        urgency: hoursLeft <= 6 ? "high" : "medium",
        suggestedAction: `Concluir "${task.title}" agora ou reagendar.`,
        createdAt: new Date().toISOString(),
        shown: false,
        sourceId,
      };
    }
  }

  return null;
}

function checkPositivePattern(
  records: CortexRecord[],
  existing: AionAlert[]
): AionAlert | null {
  const today = todayISO();
  const todayTasks = records.filter(
    (r) => r.type === "task" && r.createdAt.startsWith(today)
  );
  const todayDone = todayTasks.filter((r) => r.status === "done");

  if (todayDone.length >= 3) {
    const sourceId = `positive-done-${today}`;
    if (hasDuplicate(existing, "PADRAO_POSITIVO", sourceId)) return null;

    const titles = todayDone.slice(0, 3).map((t) => `"${t.title}"`).join(", ");
    return {
      id: generateRecordId("daily_review"),
      type: "PADRAO_POSITIVO",
      title: "Dia produtivo!",
      description: `Você concluiu ${todayDone.length} tarefas hoje: ${titles}.`,
      urgency: "low",
      suggestedAction: "Mantenha o ritmo! Que tal revisar o que aprendeu hoje?",
      createdAt: new Date().toISOString(),
      shown: false,
      sourceId,
    };
  }

  const todayExpenses = records.filter(
    (r) => r.type === "expense" && r.createdAt.startsWith(today)
  );

  if (todayExpenses.length === 0 && todayTasks.some((t) => t.status === "done")) {
    const sourceId = `positive-nospend-${today}`;
    if (hasDuplicate(existing, "PADRAO_POSITIVO", sourceId)) return null;

    return {
      id: generateRecordId("daily_review"),
      type: "PADRAO_POSITIVO",
      title: "Sem gastos hoje",
      description: "Você não registrou nenhum gasto hoje. Bom controle financeiro!",
      urgency: "low",
      suggestedAction: "Que tal registrar um resumo do dia?",
      createdAt: new Date().toISOString(),
      shown: false,
      sourceId,
    };
  }

  return null;
}

function formatMoney(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

/* ──────────── Public API ──────────── */

export async function checkAllAlerts(): Promise<AionAlert[]> {
  const existing = loadAlerts();
  const newAlerts: AionAlert[] = [];

  try {
    const records = getRecords();
    const profile = await loadProfile();


    const checks: (AionAlert | null)[] = [
      checkFinancialAlert(records, existing),
      checkHabitAbandoned(profile, existing),
      checkProjectInactive(records, profile, existing),
      checkGoalAtRisk(profile, records, existing),
      checkTaskDue(records, existing),
      checkPositivePattern(records, existing),
    ];

    for (const alert of checks) {
      if (alert) {
        newAlerts.push(alert);
      }
    }
  } catch {
    /* Never block the UI */
  }

  if (newAlerts.length > 0) {
    const all = [...newAlerts, ...existing];
    persistAlerts(all);
  }

  return newAlerts;
}

export function getUnshownAlerts(): AionAlert[] {
  return loadAlerts().filter((a) => !a.shown);
}

export function markAlertShown(id: string): void {
  const alerts = loadAlerts();
  const idx = alerts.findIndex((a) => a.id === id);
  if (idx === -1) return;
  alerts[idx].shown = true;
  persistAlerts(alerts);
}

export function clearOldAlerts(days = 30): void {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const alerts = loadAlerts().filter((a) => {
    const created = new Date(a.createdAt).getTime();
    return created >= cutoff;
  });
  persistAlerts(alerts);
}
