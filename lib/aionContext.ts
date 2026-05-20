import type { CortexRecord } from "@/lib/types";
import type {
  AionProfile,
  BehaviorTrigger,
  EnergyPattern,
  HabitInfo,
  ActiveProject,
  CategorySpending,
} from "@/lib/aionProfile";
import type { DailyInsight } from "@/lib/aion/patternDetector";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import type { VectorSearchResult } from "@/lib/aion/vector/types";
import { loadProfile } from "@/lib/aionProfile";
import { getLatestDailyInsight } from "@/lib/aion/patterns/runPatternAnalysis";
import { getRecords } from "@/lib/storage";
import { getSystemPrompt } from "@/lib/aion/systemPrompt";
import type { AionClientContext } from "@/lib/aion/types";

import { getRecentSessionMessages } from "@/lib/sessionMemory";
import type { SessionMessage } from "@/lib/sessionMemory";
import { AionContextPolicy } from "./aionContextPolicy";
import {
  getCachedProfileContext,
  setCachedProfileContext,
  getCachedDailyInsight,
  setCachedDailyInsight,
  getCachedRecentRecords,
  setCachedRecentRecords,
  getCachedLatestPatterns,
  setCachedLatestPatterns,
} from "./aionPerformance";

export type AionPatterns = {
  behaviorTriggers: BehaviorTrigger[];
  energyPattern: EnergyPattern[];
  consistentHabits: HabitInfo[];
  abandonedHabits: HabitInfo[];
  activeProjects: ActiveProject[];
  categorySpending: CategorySpending[];
};

export type AionSystemState = {
  totalRecords: number;
  pendingTasks: number;
  todayExpenses: number;
};

export type AionContext = {
  profile: AionProfile | null;
  dailyInsight: DailyInsight | null;
  patterns: AionPatterns;
  recentRecords: CortexRecord[];
  relevantBrainItems: AionBrainItem[];
  semanticResults: VectorSearchResult[];
  currentDateTime: string;
  systemState: AionSystemState;
  recentSessionMessages?: SessionMessage[];
  clientContextUsed?: boolean;
  serverSemanticDisabled?: boolean;
};

export type AionContextDebug = {
  contextUsed: boolean;
  recentRecordsUsed: number;
  brainItemsUsed: number;
  semanticResultsUsed: number;
  profileUsed: boolean;
  dailyInsightUsed: boolean;
  clientContextUsed?: boolean;
  serverSemanticDisabled?: boolean;
};

function emptyPatterns(): AionPatterns {
  return {
    behaviorTriggers: [],
    energyPattern: [],
    consistentHabits: [],
    abandonedHabits: [],
    activeProjects: [],
    categorySpending: [],
  };
}

function emptyState(): AionSystemState {
  return { totalRecords: 0, pendingTasks: 0, todayExpenses: 0 };
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function countPendingTasks(records: CortexRecord[]): number {
  return records.filter((r) => r.type === "task" && r.status === "pending")
    .length;
}

function countTodayExpenses(records: CortexRecord[]): number {
  const today = todayStr();
  return records.filter(
    (r) => r.type === "expense" && r.createdAt.startsWith(today)
  ).length;
}

function extractProfilePatterns(profile: AionProfile): AionPatterns {
  return {
    behaviorTriggers: profile.behaviorTriggers || [],
    energyPattern: profile.energyPattern || [],
    consistentHabits: profile.consistentHabits || [],
    abandonedHabits: profile.abandonedHabits || [],
    activeProjects: profile.activeProjects || [],
    categorySpending: profile.categorySpending || [],
  };
}

export async function buildSessionContext(
  userInput: string,
  options?: {
    brainItems?: AionBrainItem[];
    recentRecords?: CortexRecord[];
    contextPolicy?: AionContextPolicy;
    clientContext?: AionClientContext;
  }
): Promise<AionContext> {
  const currentDateTime = new Date().toISOString();
  const policy = options?.contextPolicy;

  const fallback: AionContext = {
    profile: null,
    dailyInsight: null,
    patterns: emptyPatterns(),
    recentRecords: [],
    relevantBrainItems: [],
    semanticResults: [],
    currentDateTime,
    systemState: emptyState(),
  };

  if (!policy || policy.loadRecords) {
    try {
      if (isClient()) {
        let allRecords = options?.recentRecords;
        if (!allRecords) {
          const cached = getCachedRecentRecords();
          if (cached) {
            allRecords = cached;
          } else {
            allRecords = getRecords();
            setCachedRecentRecords(allRecords);
          }
        }
        fallback.recentRecords = allRecords.slice(0, 5);
        fallback.systemState = {
          totalRecords: allRecords.length,
          pendingTasks: countPendingTasks(allRecords),
          todayExpenses: countTodayExpenses(allRecords),
        };
      }
    } catch {
      /* SSR-safe */
    }
  }

  if (!policy || policy.loadProfile) {
    try {
      let profile = getCachedProfileContext();
      if (!profile) {
        profile = await loadProfile();
        setCachedProfileContext(profile);
      }
      fallback.profile = profile;

      if (!policy || policy.loadPatterns) {
        let patterns = getCachedLatestPatterns();
        if (!patterns) {
          patterns = extractProfilePatterns(profile);
          setCachedLatestPatterns(patterns);
        }
        fallback.patterns = patterns;
      }
    } catch {
      /* profile unavailable */
    }
  }

  if (!policy || policy.loadDailyInsight) {
    try {
      let dailyInsight = getCachedDailyInsight();
      if (!dailyInsight) {
        dailyInsight = getLatestDailyInsight();
        setCachedDailyInsight(dailyInsight);
      }
      fallback.dailyInsight = dailyInsight;
    } catch {
      /* insight unavailable */
    }
  }

  if (!policy || policy.loadSemanticSearch) {
    if (options?.clientContext) {
      fallback.clientContextUsed = true;
      if (options.clientContext.brainItems) {
        fallback.relevantBrainItems = options.clientContext.brainItems.slice(0, 3);
      }
      if (options.clientContext.semanticResults) {
        fallback.semanticResults = options.clientContext.semanticResults.slice(0, 3);
      }
    } else {
      fallback.serverSemanticDisabled = true;
      fallback.relevantBrainItems = [];
      fallback.semanticResults = [];
    }
  }

  const maxMsgs = policy ? policy.maxSessionMessages : 10;
  if (maxMsgs > 0) {
    try {
      fallback.recentSessionMessages = getRecentSessionMessages(maxMsgs);
    } catch {
      /* session memory unavailable */
    }
  } else {
    fallback.recentSessionMessages = [];
  }

  return fallback;
}

export function buildContextDebug(context: AionContext): AionContextDebug {
  return {
    contextUsed:
      context.profile !== null ||
      context.dailyInsight !== null ||
      context.recentRecords.length > 0 ||
      context.relevantBrainItems.length > 0 ||
      context.semanticResults.length > 0,
    recentRecordsUsed: context.recentRecords.length,
    brainItemsUsed: context.relevantBrainItems.length,
    semanticResultsUsed: context.semanticResults.length,
    profileUsed: context.profile !== null,
    dailyInsightUsed: context.dailyInsight !== null,
    clientContextUsed: context.clientContextUsed,
    serverSemanticDisabled: context.serverSemanticDisabled,
  };
}

function formatRecentRecords(records: CortexRecord[]): string {
  if (records.length === 0) return "";
  const lines = records.map(
    (r) =>
      `[${r.type}] ${r.title}${r.dueDate ? ` (para: ${r.dueDate})` : ""}${r.status === "done" ? " ✓" : ""}`
  );
  return `REGISTROS RECENTES:\n${lines.join("\n")}`;
}

function formatBrainItems(items: AionBrainItem[]): string {
  if (items.length === 0) return "";
  const lines = items.map(
    (i) => `- ${i.title} (${i.type}): ${i.content.slice(0, 200)}`
  );
  return `MEMÓRIAS RELEVANTES:\n${lines.join("\n")}`;
}

function formatSemanticResults(
  results: VectorSearchResult[]
): string {
  if (results.length === 0) return "";
  const lines = results.map(
    (r) => `- ${r.text.slice(0, 200)} (score: ${(r as { score?: number }).score?.toFixed(2) ?? "?"})`
  );
  return `RESULTADOS DE BUSCA SEMÂNTICA:\n${lines.join("\n")}`;
}

function formatDailyInsight(insight: DailyInsight): string {
  const parts: string[] = ["DAILY INSIGHT:"];
  parts.push(`Resumo: ${insight.summary}`);
  if (insight.financial.length > 0) {
    parts.push(
      `Financeiro: ${insight.financial.slice(0, 2).map((f) => f.description).join(" | ")}`
    );
  }
  if (insight.productivity.length > 0) {
    parts.push(
      `Produtividade: ${insight.productivity.slice(0, 2).map((p) => p.description).join(" | ")}`
    );
  }
  if (insight.habits.length > 0) {
    parts.push(
      `Hábitos: ${insight.habits.slice(0, 2).map((h) => h.description).join(" | ")}`
    );
  }
  parts.push(`Prioridade: ${insight.topPriority}`);
  parts.push(`Sugestão: ${insight.suggestion}`);
  return parts.join("\n");
}

function formatPatterns(patterns: AionPatterns): string {
  const parts: string[] = [];
  if (patterns.activeProjects.length > 0) {
    parts.push(
      `Projetos: ${patterns.activeProjects.slice(0, 3).map((p) => p.name).join(", ")}`
    );
  }
  if (patterns.behaviorTriggers.length > 0) {
    parts.push(
      `Comportamentos: ${patterns.behaviorTriggers.slice(0, 3).map((b) => `${b.trigger} (${b.count}x)`).join(", ")}`
    );
  }
  if (patterns.consistentHabits.length > 0) {
    parts.push(
      `Hábitos consistentes: ${patterns.consistentHabits.slice(0, 3).map((h) => h.name).join(", ")}`
    );
  }
  if (patterns.energyPattern.length > 0) {
    parts.push(
      `Energia: ${patterns.energyPattern.map((e) => `${e.period} (${e.label})`).join(", ")}`
    );
  }
  return parts.length > 0 ? `PADRÕES DO USUÁRIO:\n${parts.join("\n")}` : "";
}

function formatProfileSummary(profile: AionProfile): string {
  const parts: string[] = ["PERFIL DO USUÁRIO:"];
  if (profile.userName) parts.push(`Nome: ${profile.userName}`);
  if (profile.currentGoal) parts.push(`Objetivo: ${profile.currentGoal}`);
  if (profile.lastFinancialReview)
    parts.push(`Revisão financeira: ${profile.lastFinancialReview.slice(0, 10)}`);
  if (profile.lastGoalReview)
    parts.push(`Revisão de metas: ${profile.lastGoalReview.slice(0, 10)}`);
  return parts.join("\n");
}

function formatSystemState(state: AionSystemState): string {
  const parts: string[] = ["ESTADO DO SISTEMA:"];
  parts.push(`Total de registros: ${state.totalRecords}`);
  parts.push(`Tarefas pendentes: ${state.pendingTasks}`);
  parts.push(`Gastos hoje: ${state.todayExpenses > 0 ? `R$ ${state.todayExpenses}` : "Nenhum"}`);
  return parts.join("\n");
}

export function buildSystemPrompt(context: AionContext): string {
  const parts: string[] = [];

  parts.push(getSystemPrompt());

  if (context.profile) {
    parts.push(formatProfileSummary(context.profile));
  }

  if (context.dailyInsight) {
    parts.push(formatDailyInsight(context.dailyInsight));
  }

  const patternsText = formatPatterns(context.patterns);
  if (patternsText) {
    parts.push(patternsText);
  }

  if (context.recentRecords.length > 0) {
    parts.push(formatRecentRecords(context.recentRecords));
  }

  parts.push(formatSystemState(context.systemState));

  const toneRules = `REGRAS DE TOM:
- NUNCA use ALL CAPS em respostas.
- Seja direto, natural e estratégico.
- voiceReply deve ser curto (máximo 1 frase).
- Não invente dados. Se não tiver contexto suficiente, peça uma pergunta específica.
- Preserve o formato JSON esperado na reply.
- Responda em português do Brasil.`;
  parts.push(toneRules);

  return parts.join("\n\n");
}

export function buildQueryPrompt(
  userInput: string,
  context: AionContext,
  conversationContext?: string
): string {
  const parts: string[] = [];

  parts.push(`CURRENT_DATE=${todayStr()}\n`);

  if (context.relevantBrainItems.length > 0) {
    parts.push(formatBrainItems(context.relevantBrainItems));
  }

  if (context.semanticResults.length > 0) {
    parts.push(formatSemanticResults(context.semanticResults));
  }

  if (context.recentSessionMessages && context.recentSessionMessages.length > 0) {
    const lines = context.recentSessionMessages.map(
      (m) => `${m.role === "user" ? "Usuário" : "Aion"}: ${m.content}`
    );
    parts.push(`CONVERSA RECENTE DA SESSÃO:\n${lines.join("\n")}`);
  } else if (conversationContext) {
    parts.push(`CONVERSA RECENTE:\n${conversationContext}`);
  }

  parts.push(`MENSAGEM DO USUÁRIO: "${userInput}"`);

  parts.push(
    `\nSua resposta DEVE ser APENAS um objeto JSON válido com esta estrutura exata, sem markdown, sem código formatado, sem tags:\n` +
      `{\n` +
      `  "reply": "sua resposta como secretária — natural, útil, até 4 frases",\n` +
      `  "voiceReply": "versão ultra curta (1 frase) para ser falada em voz alta",\n` +
      `  "action": "none" | "web_search" | "create_record" | "ask_clarification" | "suggest_next_step" | "read_dashboard" | "save_memory",\n` +
      `  "searchQuery": null | "termo de busca (apenas se action for web_search)",\n` +
      `  "record": null | { "type": "task"|"expense"|"idea"|"project_note"|"daily_review"|"focus_request"|"unknown", "title": "string", "description": "string", "priority": "low"|"medium"|"high", "project": null|string, "amount": null|number, "category": null|string, "dueDate": null|"YYYY-MM-DD", "nextAction": "string" },\n` +
      `  "suggestion": null | "dica prática ou recomendação curta",\n` +
      `  "followUpQuestion": null | "pergunta para engajar o usuário no próximo passo",\n` +
      `  "tips": null | ["dica curta 1", "dica curta 2"],\n` +
      `  "confidence": 0.0 a 1.0\n` +
      `}\n\n` +
      `REGRAS:\n` +
      `- "action" define o que fazer com a mensagem.\n` +
      `- Se action for "create_record", preencha "record" com os dados e dê uma "suggestion".\n` +
      `- Se action for "suggest_next_step", "reply" deve conter orientação prática e "followUpQuestion" pode engajar.\n` +
      `- Se action for "ask_clarification", "reply" deve perguntar o que falta.\n` +
      `- Se action for "none" ou "suggest_next_step" ou "read_dashboard" ou "ask_clarification", "record" deve ser null.\n` +
      `- "tips" é opcional, use quando detectar um padrão útil (ex: muitas ideias, poucas tarefas).\n` +
      `- Se action for "save_memory", "reply" deve confirmar que a informação foi guardada e o "record" deve conter { type: "idea", title: "o conteúdo a ser memorizado" }.\n` +
      `- "confidence" reflete o quão certo você está sobre a ação (0.0 = incerto, 1.0 = certo).\n` +
      `- "voiceReply" deve ser no máximo UMA frase, curta, para TTS.\n` +
      `- "suggestion" deve ser prática e acionável, como uma secretária daria.`
  );

  return parts.join("\n\n");
}
