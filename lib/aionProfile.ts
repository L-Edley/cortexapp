import type { CortexRecord } from "./types";
import { getRecords } from "./storage";
import { readVaultFile, writeVaultFile } from "./obsidian/client";
import { getLocalStorage, setLocalStorage } from "./settings";

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

const PROFILE_PATH = "aion_memory/profile.yaml";
const PROFILE_STORAGE_KEY = "aion_profile";
const PROFILE_MIGRATED_KEY = "aion_profile_migrated";
const INITIAL_VERSION = 1;
const ANALYSIS_WINDOW = 30;

export function defaultProfile(): AionProfile {
  return {
    version: INITIAL_VERSION,
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

function yamlStr(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  const s = String(val);
  if (s === "") return '""';
  if (/[:\[\]{},"'\n#]/.test(s) || /^\s/.test(s) || /\s$/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

function serializeProfile(p: AionProfile): string {
  const lines: string[] = [];
  lines.push(`version: ${p.version}`);
  lines.push(`updatedAt: ${p.updatedAt}`);
  lines.push(`userName: ${yamlStr(p.userName)}`);
  lines.push(`currentGoal: ${yamlStr(p.currentGoal)}`);
  lines.push(`lastFinancialReview: ${yamlStr(p.lastFinancialReview)}`);
  lines.push(`lastGoalReview: ${yamlStr(p.lastGoalReview)}`);

  lines.push("energyPattern:");
  for (const ep of p.energyPattern) {
    lines.push(`  - period: ${ep.period}`);
    lines.push(`    label: ${ep.label}`);
  }

  lines.push("behaviorTriggers:");
  for (const bt of p.behaviorTriggers) {
    lines.push(`  - trigger: ${yamlStr(bt.trigger)}`);
    lines.push(`    context: ${yamlStr(bt.context)}`);
    lines.push(`    count: ${bt.count}`);
  }

  lines.push("activeProjects:");
  for (const ap of p.activeProjects) {
    lines.push(`  - name: ${yamlStr(ap.name)}`);
    lines.push(`    lastInteraction: ${ap.lastInteraction}`);
  }

  lines.push("categorySpending:");
  for (const cs of p.categorySpending) {
    lines.push(`  - category: ${yamlStr(cs.category)}`);
    lines.push(`    average: ${cs.average}`);
    lines.push(`    count: ${cs.count}`);
  }

  lines.push("consistentHabits:");
  for (const h of p.consistentHabits) {
    lines.push(`  - name: ${yamlStr(h.name)}`);
    lines.push(`    consistency: ${h.consistency}`);
    lines.push(`    lastDate: ${h.lastDate}`);
  }

  lines.push("abandonedHabits:");
  for (const h of p.abandonedHabits) {
    lines.push(`  - name: ${yamlStr(h.name)}`);
    lines.push(`    consistency: ${h.consistency}`);
    lines.push(`    lastDate: ${h.lastDate}`);
  }

  return lines.join("\n") + "\n";
}

type YamlBlock = {
  key: string;
  lines: string[];
};

function parseBlocks(raw: string): YamlBlock[] {
  const blocks: YamlBlock[] = [];
  let current: YamlBlock | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const topLevel = /^[a-zA-Z_][a-zA-Z0-9_]*:/.test(line) && !line.startsWith(" ");
    if (topLevel) {
      if (current) blocks.push(current);
      const colon = line.indexOf(":");
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      current = { key, lines: value ? [value] : [] };
      continue;
    }

    if (current) {
      current.lines.push(trimmed);
    }
  }
  if (current) blocks.push(current);

  return blocks;
}

function parseYamlValue(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

function parseArrayBlock(block: YamlBlock): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;

  for (const line of block.lines) {
    if (line.startsWith("- ")) {
      if (current) items.push(current);
      current = {};
      const rest = line.slice(2);
      const colon = rest.indexOf(":");
      if (colon !== -1) {
        const k = rest.slice(0, colon).trim();
        const v = parseYamlValue(rest.slice(colon + 1));
        current[k] = v;
      } else {
        items.push({ _val: parseYamlValue(rest) });
        current = null;
      }
    } else if (current && /^[a-zA-Z_]/.test(line)) {
      const colon = line.indexOf(":");
      if (colon !== -1) {
        const k = line.slice(0, colon).trim();
        const v = parseYamlValue(line.slice(colon + 1));
        current[k] = v;
      }
    }
  }
  if (current) items.push(current);

  return items;
}

function parseProfile(raw: string): AionProfile {
  const blocks = parseBlocks(raw);
  const profile = defaultProfile();

  for (const block of blocks) {
    switch (block.key) {
      case "version":
      case "updatedAt":
      case "userName":
      case "currentGoal":
      case "lastFinancialReview":
      case "lastGoalReview": {
        const val = block.lines[0] ?? "";
        (profile as Record<string, unknown>)[block.key] = parseYamlValue(val);
        break;
      }
      case "energyPattern":
      case "behaviorTriggers":
      case "activeProjects":
      case "categorySpending":
      case "consistentHabits":
      case "abandonedHabits": {
        const items = parseArrayBlock(block);
        (profile as Record<string, unknown>)[block.key] = items;
        break;
      }
    }
  }

  profile.version = Number(profile.version) || INITIAL_VERSION;
  return profile;
}

async function migrateProfileFromObsidian(): Promise<boolean> {
  try {
    const raw = await readVaultFile(PROFILE_PATH);
    if (!raw) return false;
    setLocalStorage(PROFILE_STORAGE_KEY, raw);
    setLocalStorage(PROFILE_MIGRATED_KEY, "true");
    return true;
  } catch {
    return false;
  }
}

export async function loadProfile(): Promise<AionProfile> {
  const migrated = getLocalStorage(PROFILE_MIGRATED_KEY);
  if (migrated) {
    const raw = getLocalStorage(PROFILE_STORAGE_KEY);
    if (raw) {
      try {
        return parseProfile(raw);
      } catch {
      }
    }
    return defaultProfile();
  }

  try {
    const raw = await readVaultFile(PROFILE_PATH);
    if (!raw) return defaultProfile();
    setLocalStorage(PROFILE_STORAGE_KEY, raw);
    setLocalStorage(PROFILE_MIGRATED_KEY, "true");
    return parseProfile(raw);
  } catch {
    return defaultProfile();
  }
}

export async function updateProfile(patch: Partial<AionProfile>): Promise<void> {
  const current = await loadProfile();
  const updated: AionProfile = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const yaml = serializeProfile(updated);
  setLocalStorage(PROFILE_STORAGE_KEY, yaml);
  setLocalStorage(PROFILE_MIGRATED_KEY, "true");
  writeVaultFile(PROFILE_PATH, yaml).catch(() => {});
}

function detectEnergyPatterns(records: CortexRecord[]): EnergyPattern[] {
  const hourCounts: Record<number, number> = {};
  for (const r of records) {
    const hour = new Date(r.createdAt).getUTCHours();
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
  }

  const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return [];

  const peakHour = Number(sorted[0][0]);
  const periods: EnergyPattern[] = [];

  const ranges: [number, number, string, string][] = [
    [5, 11, "manhã", "focado"],
    [12, 17, "tarde", "produtivo"],
    [18, 23, "noite", "criativo"],
    [0, 4, "madrugada", "reflexivo"],
  ];

  for (const [start, end, period, label] of ranges) {
    const count = Object.entries(hourCounts)
      .filter(([h]) => {
        const hour = Number(h);
        return hour >= start && hour <= end;
      })
      .reduce((s, [, c]) => s + c, 0);

    if (count > 0) {
      periods.push({ period, label });
    }
  }

  return periods;
}

function detectActiveProjects(records: CortexRecord[]): ActiveProject[] {
  const projMap = new Map<string, string>();

  for (const r of records) {
    if (r.project) {
      const existing = projMap.get(r.project);
      if (!existing || r.createdAt > existing) {
        projMap.set(r.project, r.createdAt);
      }
    }
  }

  return Array.from(projMap.entries())
    .map(([name, lastInteraction]) => ({ name, lastInteraction }))
    .sort((a, b) => b.lastInteraction.localeCompare(a.lastInteraction));
}

function detectCategorySpending(records: CortexRecord[]): CategorySpending[] {
  const expenses = records.filter(
    (r) => r.type === "expense" && r.amount !== null && r.amount > 0
  );

  const catMap = new Map<string, { total: number; count: number }>();

  for (const r of expenses) {
    const cat = r.category || "geral";
    const existing = catMap.get(cat) ?? { total: 0, count: 0 };
    existing.total += r.amount!;
    existing.count += 1;
    catMap.set(cat, existing);
  }

  return Array.from(catMap.entries())
    .map(([category, { total, count }]) => ({
      category,
      average: Math.round((total / count) * 100) / 100,
      count,
    }))
    .sort((a, b) => b.average - a.average);
}

function detectHabits(records: CortexRecord[]): {
  consistent: HabitInfo[];
  abandoned: HabitInfo[];
} {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const taskTitles = records
    .filter((r) => r.type === "task" && r.status === "done")
    .map((r) => ({
      title: r.title.toLowerCase().trim(),
      date: r.createdAt,
    }));

  const titleFrequency = new Map<string, { count: number; lastDate: string }>();
  for (const t of taskTitles) {
    const existing = titleFrequency.get(t.title) ?? { count: 0, lastDate: t.date };
    existing.count += 1;
    if (t.date > existing.lastDate) existing.lastDate = t.date;
    titleFrequency.set(t.title, existing);
  }

  const total = records.length || 1;
  const consistent: HabitInfo[] = [];
  const abandoned: HabitInfo[] = [];

  for (const [name, { count, lastDate }] of titleFrequency) {
    const consistency = Math.min(1, count / total);
    const daysSinceLast =
      (now - new Date(lastDate).getTime()) / (24 * 60 * 60 * 1000);

    if (consistency >= 0.2 && daysSinceLast < 14) {
      consistent.push({ name, consistency: Math.round(consistency * 100) / 100, lastDate });
    } else if (daysSinceLast >= 14) {
      abandoned.push({ name, consistency: Math.round(consistency * 100) / 100, lastDate });
    }
  }

  consistent.sort((a, b) => b.consistency - a.consistency);
  abandoned.sort((a, b) => a.lastDate.localeCompare(b.lastDate));

  return { consistent, abandoned };
}

function detectBehaviorTriggers(records: CortexRecord[]): BehaviorTrigger[] {
  const patterns: BehaviorTrigger[] = [];
  const lowerTitles = records.map((r) => ({
    title: (r.title || "").toLowerCase(),
    type: r.type,
    category: r.category,
  }));

  const triggerChecks: { keywords: string[]; trigger: string; context: string }[] = [
    { keywords: ["cansado", "sem energia", "exausto"], trigger: "cansaço", context: "registra cansaço ao criar tarefas" },
    { keywords: ["urgente", "pra ontem", "atrasado"], trigger: "urgência", context: "marca tarefas como urgentes" },
    { keywords: ["ideia", "pensando em", "e se"], trigger: "insight", context: "registra ideias espontâneas" },
    { keywords: ["almoço", "jantar", "café", "comida"], trigger: "alimentação", context: "registra gastos com alimentação" },
    { keywords: ["reunião", "meeting", "call"], trigger: "reunião", context: "agenda reuniões" },
    { keywords: ["projeto", "projeto"], trigger: "projeto", context: "cria ou atualiza projetos" },
  ];

  for (const check of triggerChecks) {
    const count = lowerTitles.filter((t) =>
      check.keywords.some((kw) => t.title.includes(kw))
    ).length;
    if (count >= 2) {
      patterns.push({ trigger: check.trigger, context: check.context, count });
    }
  }

  return patterns.sort((a, b) => b.count - a.count);
}

export async function analyzeAndUpdateProfile(): Promise<AionProfile> {
  const allRecords = getRecords();
  const recent = allRecords
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, ANALYSIS_WINDOW);

  const current = await loadProfile();

  const energyPattern = detectEnergyPatterns(recent);
  const behaviorTriggers = detectBehaviorTriggers(recent);
  const activeProjects = detectActiveProjects(recent);
  const categorySpending = detectCategorySpending(recent);
  const { consistent, abandoned } = detectHabits(recent);

  const updated: AionProfile = {
    ...current,
    energyPattern: energyPattern.length > 0 ? energyPattern : current.energyPattern,
    behaviorTriggers: behaviorTriggers.length > 0 ? behaviorTriggers : current.behaviorTriggers,
    activeProjects: activeProjects.length > 0 ? activeProjects : current.activeProjects,
    categorySpending: categorySpending.length > 0 ? categorySpending : current.categorySpending,
    consistentHabits: consistent.length > 0 ? consistent : current.consistentHabits,
    abandonedHabits: abandoned.length > 0 ? abandoned : current.abandonedHabits,
    version: current.version,
    updatedAt: new Date().toISOString(),
  };

  const yaml = serializeProfile(updated);
  setLocalStorage(PROFILE_STORAGE_KEY, yaml);
  setLocalStorage(PROFILE_MIGRATED_KEY, "true");
  writeVaultFile(PROFILE_PATH, yaml).catch(() => {});
  return updated;
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

export { serializeProfile, parseProfile, migrateProfileFromObsidian };
export {
  detectEnergyPatterns,
  detectActiveProjects,
  detectCategorySpending,
  detectHabits,
  detectBehaviorTriggers,
};
