import { getProfile, updateProfile as coreUpdate, analyzeProfile } from "@/lib/aion/coreProxy";

export type EnergyPattern = {
  period: string;
  label: string;
};

export type BehaviorTrigger = {
  trigger: string;
  context: string;
  count: number;
};

export type ActiveProject = {
  name: string;
  lastInteraction: string;
};

export type CategorySpending = {
  category: string;
  average: number;
  count: number;
};

export type HabitInfo = {
  name: string;
  consistency: number;
  lastDate: string;
};

export type AionProfile = {
  version: number;
  updatedAt: string;
  userName: string;
  energyPattern: EnergyPattern[];
  behaviorTriggers: BehaviorTrigger[];
  activeProjects: ActiveProject[];
  categorySpending: CategorySpending[];
  consistentHabits: HabitInfo[];
  abandonedHabits: HabitInfo[];
  currentGoal: string;
  lastFinancialReview: string | null;
  lastGoalReview: string | null;
};

export function defaultProfile(): AionProfile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    userName: "",
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

function mapCoreProfile(data: Record<string, unknown>): AionProfile {
  return {
    version: (data.version as number) || 1,
    updatedAt: (data.updatedAt as string) || new Date().toISOString(),
    userName: (data.userName as string) || "",
    energyPattern: (data.energyPattern as EnergyPattern[]) || [],
    behaviorTriggers: (data.behaviorTriggers as BehaviorTrigger[]) || [],
    activeProjects: (data.activeProjects as ActiveProject[]) || [],
    categorySpending: (data.categorySpending as CategorySpending[]) || [],
    consistentHabits: (data.consistentHabits as HabitInfo[]) || [],
    abandonedHabits: (data.abandonedHabits as HabitInfo[]) || [],
    currentGoal: (data.currentGoal as string) || "",
    lastFinancialReview: (data.lastFinancialReview as string) || null,
    lastGoalReview: (data.lastGoalReview as string) || null,
  };
}

export async function loadProfile(): Promise<AionProfile> {
  const result = await getProfile();
  if (result?.profile) {
    return mapCoreProfile(result.profile);
  }
  return defaultProfile();
}

export async function updateProfile(patch: Partial<AionProfile>): Promise<void> {
  await coreUpdate({
    userName: patch.userName,
    currentGoal: patch.currentGoal,
  });
}

export async function analyzeAndUpdateProfile(): Promise<AionProfile> {
  const result = await analyzeProfile();
  if (result?.profile) {
    return mapCoreProfile(result.profile);
  }
  return defaultProfile();
}

export function formatProfileForContext(profile: AionProfile): string {
  const parts: string[] = ["PERFIL DO USUÁRIO:"];

  if (profile.userName) {
    parts.push(`Nome: ${profile.userName}`);
  }

  if (profile.energyPattern.length > 0) {
    const labels = profile.energyPattern.map((ep) => `${ep.period} (${ep.label})`).join(", ");
    parts.push(`Padrão de energia: ${labels}`);
  }

  if (profile.behaviorTriggers.length > 0) {
    const triggers = profile.behaviorTriggers
      .slice(0, 3)
      .map((bt) => `${bt.trigger} (${bt.count}x)`)
      .join(", ");
    parts.push(`Comportamentos frequentes: ${triggers}`);
  }

  if (profile.activeProjects.length > 0) {
    const projects = profile.activeProjects
      .slice(0, 3)
      .map((ap) => ap.name)
      .join(", ");
    parts.push(`Projetos ativos: ${projects}`);
  }

  if (profile.categorySpending.length > 0) {
    const topSpending = profile.categorySpending
      .slice(0, 3)
      .map((cs) => `${cs.category} (R$ ${cs.average.toFixed(2)})`)
      .join(", ");
    parts.push(`Média de gastos: ${topSpending}`);
  }

  if (profile.currentGoal) {
    parts.push(`Objetivo atual: ${profile.currentGoal}`);
  }

  if (profile.lastFinancialReview) {
    parts.push(`Última revisão financeira: ${profile.lastFinancialReview.slice(0, 10)}`);
  }

  if (profile.lastGoalReview) {
    parts.push(`Última revisão de metas: ${profile.lastGoalReview.slice(0, 10)}`);
  }

  parts.push(`Versão do perfil: ${profile.version}`);
  parts.push(`Atualizado em: ${profile.updatedAt.slice(0, 10)}`);

  return parts.join("\n");
}
