import type { CortexRecord, CortexApiResponse } from "@/lib/types";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import type { AionAction, AionDecision, AionFallbackReason, AionResponse } from "@/lib/aion/types";
import type { SessionMessage } from "@/lib/sessionMemory";
import { smartRouter } from "@/lib/aion/router";
import { saveMemory } from "@/lib/aion/brain/memory";
import { saveRecord as storageSaveRecord } from "@/lib/storageProvider";
import { buildSessionContext, buildSystemPrompt, buildQueryPrompt, buildContextDebug } from "@/lib/aionContext";
import { callWithFallback } from "@/lib/aionLLM";
import { retrieveRelevantBrainContext, answerFromBrain } from "@/lib/aion/brain";
import { getMemory } from "@/lib/aion/memory";
import { parseRecordFromDecision } from "@/lib/aion/tools";
import { resolveRelativeDatePtBR } from "@/lib/aion/dateResolver";
import { generateId } from "@/lib/aion/brain/brainStore";
import { getContextPolicy } from "./aionContextPolicy";

export type AionReasonIntent =
  | "record"
  | "memory"
  | "question"
  | "command"
  | "analysis"
  | "planning"
  | "review"
  | "smalltalk"
  | "unknown";

export type AionReasonRoute = "local" | "brain" | "llm" | "fallback";

export type AionReasonResponse = {
  text: string;
  voiceReply: string;
  intent: AionReasonIntent;
  actionsExecuted: string[];
  nextSteps: string[];
  confidence: number;
  providerUsed: string;
  route: AionReasonRoute;
  timeMs: number;
  record?: CortexApiResponse | null;
  suggestion?: string;
  followUpQuestion?: string;
  tips?: string[];
  searchQuery?: string;
  llmText?: string;
  llmRoute?: string;
  debug?: Record<string, unknown>;
};

export type ReasonOptions = {
  recentRecords?: CortexRecord[];
  brainContextFromClient?: Partial<AionBrainItem>[];
  profileContext?: string;
  currentView?: string;
  sessionMessages?: SessionMessage[];
};

export function classifyIntent(input: string): AionReasonIntent {
  if (!input || input.trim().length === 0) return "unknown";

  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (/^(oi|ol[áa]|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[íi]|eae|fala|opa|obrigado|valeu|brigado|thanks|obg)/i.test(normalized)) {
    return "smalltalk";
  }

  if (normalized.length < 3) return "unknown";

  if (/^(salve|salva|guarde|guarda|lembre|lembra)\s+(que|disso)\b/i.test(normalized)) {
    return "memory";
  }

  if (/^me\s+lembr[ae]\s+de\s+/i.test(normalized) || /^(tenho|preciso)\s+(que|de)\s/i.test(normalized) || /^(não|nao)\s+esquecer\s+de\s+/i.test(normalized)) {
    return "record";
  }

  if (/^(gastei|paguei|recebi|custou|comprei)/i.test(normalized)) {
    return "record";
  }

  if (/^ideia[\s:]/.test(normalized) || /^(pensando\s+em|e\s+se|que\s+tal|tive\s+uma\s+ideia)\b/i.test(normalized)) {
    return "record";
  }

  if (/\b(analise|analisa|analisar|o\s+que\s+percebe|qual\s+padr[ãa]o|o\s+que\s+nota|o\s+que\s+voc[eê]\s+acha)\b/i.test(input)) {
    return "analysis";
  }

  if (/\b(planeje|planeja|crie\s+um\s+plano|pr[oó]ximos\s+passos|estrategia|estratégia|como\s+proceder|plano\s+de\s+a[cç][aã]o)\b/i.test(input)) {
    return "planning";
  }

  if (/\b(revise|resuma\s+meu\s+dia|como\s+estou|resumo\s+do\s+dia|relat[oó]rio\s+do\s+dia|como\s+foi\s+meu\s+dia)\b/i.test(input)) {
    return "review";
  }

  if (input.includes("?") || /^(o\s+que|qual|quem|como|onde|quando|por\s+que|porque|quanto|quantos|quantas)\s/i.test(normalized)) {
    return "question";
  }

  if (/^(fa[cç]a|faca|faz|execute|mostre|abra|exiba|liste|busque|pesquise|crie|gere|mande|envie)\s/i.test(normalized)) {
    return "command";
  }

  return "unknown";
}

function enforceToneRules(text: string, voiceReply: string): { text: string; voiceReply: string } {
  let finalText = text;
  let finalVoice = voiceReply;

  if (finalText.length > 0 && finalText === finalText.toUpperCase() && /[A-Z]{4,}/.test(finalText)) {
    finalText = finalText.charAt(0).toUpperCase() + finalText.slice(1).toLowerCase();
  }
  if (finalVoice.length > 0 && finalVoice === finalVoice.toUpperCase() && /[A-Z]{4,}/.test(finalVoice)) {
    finalVoice = finalVoice.charAt(0).toUpperCase() + finalVoice.slice(1).toLowerCase();
  }

  const clean = finalVoice.trim();
  const firstSentence = clean.split(/[.!?;]/).filter(Boolean)[0] || clean;
  const sentence = firstSentence.trim() + ".";
  finalVoice = sentence.length > 200 ? sentence.slice(0, 197) + "..." : sentence;

  return { text: finalText, voiceReply: finalVoice };
}

function buildEmptyResponse(startTime: number): AionReasonResponse {
  return {
    text: "Digite uma mensagem para eu ajudar.",
    voiceReply: "Digite uma mensagem.",
    intent: "unknown",
    actionsExecuted: [],
    nextSteps: [],
    confidence: 1,
    providerUsed: "smart-router",
    route: "local",
    timeMs: Date.now() - startTime,
  };
}

function localToReasonResponse(local: AionResponse, intent: AionReasonIntent, startTime: number): AionReasonResponse {
  const actions: string[] = [];
  if (local.action && local.action !== "none") {
    actions.push(local.action);
  }

  const nextSteps: string[] = [];
  if (local.suggestion) nextSteps.push(local.suggestion);
  if (local.followUpQuestion) nextSteps.push(local.followUpQuestion);

  return {
    text: local.reply,
    voiceReply: local.voiceReply,
    intent,
    actionsExecuted: actions,
    nextSteps,
    confidence: local.confidence,
    providerUsed: "smart-router",
    route: "local",
    timeMs: Date.now() - startTime,
    record: local.record,
    suggestion: local.suggestion,
    followUpQuestion: local.followUpQuestion,
    tips: local.tips,
  };
}

async function handleMemoryIntent(input: string, startTime: number): Promise<AionReasonResponse> {
  const content = input
    .replace(/^(salve|salva|guarde|guarda|lembre|lembra)\s+(que|disso)\s*/i, "")
    .trim();
  const title = content.charAt(0).toUpperCase() + content.slice(1);

  const brainItem: AionBrainItem = {
    id: generateId(),
    type: "user_preference",
    title: title || "Memória salva",
    content: content || input,
    tags: ["memory", "user-saved"],
    source: "user",
    confidence: 0.95,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let saved = false;
  try {
    const result = await saveMemory(brainItem);
    saved = result !== null;
  } catch {
    saved = false;
  }

  return {
    text: saved ? `Anotado: "${title}". Vou lembrar disso.` : "Não consegui salvar agora, mas entendi.",
    voiceReply: saved ? "Memória salva." : "Entendi.",
    intent: "memory",
    actionsExecuted: saved ? ["save_memory"] : [],
    nextSteps: [],
    confidence: saved ? 0.95 : 0.6,
    providerUsed: saved ? "aion-brain" : "smart-router",
    route: saved ? "brain" : "local",
    timeMs: Date.now() - startTime,
  };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gm, "")
    .replace(/```/g, "")
    .trim();
}

function repairJson(rawText: string): Record<string, unknown> | null {
  const cleaned = stripMarkdown(rawText);
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!braceMatch) return null;

  const candidate = braceMatch[0].trim();

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    try {
      const singleLine = candidate.replace(/\n/g, " ").replace(/\s+/g, " ");
      const fixed = singleLine
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?\s*:/g, '"$2":')
        .replace(/:\s*'([^']*?)'/g, ':"$1"');
      return JSON.parse(fixed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function extractReplyFallback(text: string): string | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const nonJsonLines = lines.filter(l => !l.startsWith("{") && !l.startsWith("}") && !l.startsWith('"'));
  if (nonJsonLines.length > 0) {
    return nonJsonLines.slice(0, 4).join(" ").slice(0, 500);
  }
  return null;
}

function parseLLMResponse(text: string): AionDecision | null {
  const parsed = repairJson(text);
  if (!parsed) {
    const extracted = extractReplyFallback(text);
    if (extracted) {
      return {
        reply: extracted,
        voiceReply: extracted.split(/[.!?]/)[0] + ".",
        action: "none",
        confidence: 0.4,
      };
    }
    return null;
  }

  const validActions: AionAction[] = [
    "none", "web_search", "create_record", "ask_clarification",
    "suggest_next_step", "read_dashboard", "save_memory",
  ];

  const actionRaw = typeof parsed.action === "string" ? parsed.action.toLowerCase() as AionAction : "none";
  const action: AionAction = validActions.includes(actionRaw) ? actionRaw : "none";

  const reply = typeof parsed.reply === "string" && parsed.reply.trim().length > 0
    ? parsed.reply.trim()
    : "Entendi.";
  const voiceReply = typeof parsed.voiceReply === "string" && parsed.voiceReply.trim().length > 0
    ? parsed.voiceReply.trim()
    : reply;

  let record: CortexApiResponse | null = null;
  if (action === "create_record" && parsed.record && typeof parsed.record === "object") {
    record = parseRecordFromDecision(parsed.record, "");
    if (!record) {
      record = parseRecordFromDecision({ type: "task", title: reply }, reply);
    }
  } else if (action === "save_memory" && parsed.record && typeof parsed.record === "object") {
    record = parseRecordFromDecision(parsed.record, "");
  }

  const confidence = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.7;

  const searchQuery = action === "web_search" && typeof parsed.searchQuery === "string"
    ? parsed.searchQuery
    : undefined;

  const suggestion = typeof parsed.suggestion === "string" && parsed.suggestion.trim().length > 0
    ? parsed.suggestion.trim()
    : undefined;

  const followUpQuestion = typeof parsed.followUpQuestion === "string" && parsed.followUpQuestion.trim().length > 0
    ? parsed.followUpQuestion.trim()
    : undefined;

  let tips: string[] | undefined;
  if (Array.isArray(parsed.tips)) {
    const filtered = parsed.tips.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
    if (filtered.length > 0) tips = filtered;
  }

  return {
    reply,
    voiceReply,
    action,
    searchQuery,
    record,
    suggestion,
    followUpQuestion,
    tips,
    confidence,
  };
}

function logLatencyMetrics(metrics: {
  totalMs: number;
  classifyIntentMs: number;
  smartRouterMs: number;
  contextBuildMs: number;
  semanticSearchMs: number;
  llmMs: number;
  storageMs: number;
  providerUsed: string;
  fallbackUsed: boolean;
  intent: string;
}) {
  if (process.env.NODE_ENV === "development") {
    console.log("[AION LATENCY AUDIT] --------------------");
    console.log(`[AION] Intent: ${metrics.intent}`);
    console.log(`[AION] Route Total: ${metrics.totalMs}ms`);
    console.log(`  - classifyIntent: ${metrics.classifyIntentMs}ms`);
    console.log(`  - smartRouter: ${metrics.smartRouterMs}ms`);
    console.log(`  - contextBuild: ${metrics.contextBuildMs}ms`);
    console.log(`  - semanticSearch: ${metrics.semanticSearchMs}ms`);
    console.log(`  - llmFallbackCall: ${metrics.llmMs}ms`);
    console.log(`  - localStorage: ${metrics.storageMs}ms`);
    console.log(`  - provider: ${metrics.providerUsed}`);
    console.log(`  - fallbackUsed: ${metrics.fallbackUsed}`);
    console.log("[AION LATENCY AUDIT] --------------------");
  }
}

async function llmPipeline(
  userInput: string,
  intent: AionReasonIntent,
  options?: ReasonOptions,
  startTime?: number,
  classifyIntentMs = 0,
  smartRouterMs = 0
): Promise<AionReasonResponse> {
  const realStart = startTime ?? Date.now();
  let contextBuildMs = 0;
  let semanticSearchMs = 0;
  let llmMs = 0;
  let storageMs = 0;

  const memory = getMemory();
  const conversationContext = memory ? memory.formatConversationContext() : "";
  const policy = getContextPolicy(intent);

  // 1. Semantic search step (bypass under smalltalk/memory intents)
  const isSmalltalk = intent === "smalltalk";
  const searchStart = Date.now();
  const brainContext: AionBrainItem[] = options?.brainContextFromClient
    ? (options.brainContextFromClient as AionBrainItem[])
    : ((isSmalltalk || !policy.loadSemanticSearch)
        ? []
        : await retrieveRelevantBrainContext(userInput));
  semanticSearchMs = isSmalltalk || !policy.loadSemanticSearch ? 0 : Date.now() - searchStart;

  // 2. Question direct answer step
  if (intent === "question" && !isSmalltalk) {
    const questionStart = Date.now();
    const brainAnswer = await answerFromBrain(userInput, brainContext);
    llmMs = Date.now() - questionStart;
    if (brainAnswer) {
      const { text, voiceReply } = enforceToneRules(brainAnswer, brainAnswer.split(/[.!?]/)[0] + ".");
      const totalMs = Date.now() - realStart;
      return {
        text,
        voiceReply,
        intent,
        actionsExecuted: [],
        nextSteps: [],
        confidence: 0.85,
        providerUsed: "aion-brain",
        route: "brain",
        timeMs: totalMs,
        debug: {
          brainItemsUsed: brainContext.length,
          latencyMetrics: {
            totalMs,
            classifyIntentMs,
            smartRouterMs,
            contextBuildMs,
            semanticSearchMs,
            llmMs,
            storageMs,
            providerUsed: "aion-brain",
            fallbackUsed: false,
            intent,
          }
        },
      };
    }
  }

  // 3. Build session context step
  const buildStart = Date.now();
  const aionContext = await buildSessionContext(userInput.trim(), {
    brainItems: brainContext,
    recentRecords: options?.recentRecords || [],
    contextPolicy: policy,
  });
  if (options?.sessionMessages) {
    aionContext.recentSessionMessages = options.sessionMessages;
  }
  const contextDebug = buildContextDebug(aionContext);
  const systemPrompt = buildSystemPrompt(aionContext);
  const userPrompt = buildQueryPrompt(userInput.trim(), aionContext, conversationContext);
  contextBuildMs = Date.now() - buildStart;

  // 4. LLM execution step
  const llmStart = Date.now();
  const llmResult = await callWithFallback(userPrompt, systemPrompt);
  llmMs = Date.now() - llmStart;

  // 5. Fallback routes
  if (!llmResult.text || llmResult.text.trim().length === 0) {
    const llmRoute = (llmResult as { route?: string }).route || "fallback";
    const totalMs = Date.now() - realStart;
    return {
      text: "Não consegui processar sua mensagem agora. Pode tentar de novo?",
      voiceReply: "Não consegui processar.",
      intent,
      actionsExecuted: [],
      nextSteps: ["Tentar novamente"],
      confidence: 0.3,
      providerUsed: llmResult.providerUsed || "none",
      route: "fallback",
      llmRoute,
      timeMs: totalMs,
      debug: {
        contextDebug,
        fallbackReason: "all_providers_failed" as AionFallbackReason,
        latencyMetrics: {
          totalMs,
          classifyIntentMs,
          smartRouterMs,
          contextBuildMs,
          semanticSearchMs,
          llmMs,
          storageMs,
          providerUsed: llmResult.providerUsed || "none",
          fallbackUsed: true,
          intent,
        }
      },
    };
  }

  const decision = parseLLMResponse(llmResult.text);

  if (!decision) {
    const totalMs = Date.now() - realStart;
    return {
      text: "Recebi sua mensagem, mas não consegui processar direito. Pode reformular?",
      voiceReply: "Não consegui processar direito.",
      intent,
      actionsExecuted: [],
      nextSteps: ["Reformular a mensagem"],
      confidence: 0.4,
      providerUsed: llmResult.providerUsed || "unknown",
      route: "fallback",
      llmRoute: (llmResult as { route?: string }).route || "api",
      timeMs: totalMs,
      debug: {
        contextDebug,
        fallbackReason: "invalid_json_after_repair" as AionFallbackReason,
        latencyMetrics: {
          totalMs,
          classifyIntentMs,
          smartRouterMs,
          contextBuildMs,
          semanticSearchMs,
          llmMs,
          storageMs,
          providerUsed: llmResult.providerUsed || "unknown",
          fallbackUsed: true,
          intent,
        }
      },
    };
  }

  // 6. Local storage writes (save memory, save records)
  const storageStart = Date.now();
  if (decision.action === "save_memory" && decision.record) {
    try {
      const brainItem: AionBrainItem = {
        id: generateId(),
        type: "user_preference",
        title: decision.record.title,
        content: decision.record.description || decision.record.title,
        tags: ["memory", "llm-saved"],
        source: "llm",
        confidence: decision.confidence,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveMemory(brainItem);
    } catch {
      /* fail silently */
    }
  }

  if (decision.action === "create_record" && decision.record) {
    const fullRecord: CortexRecord = {
      id: generateId(),
      type: decision.record.type,
      title: decision.record.title,
      description: decision.record.description || userInput,
      priority: decision.record.priority,
      project: decision.record.project,
      amount: decision.record.amount,
      category: decision.record.category,
      dueDate: decision.record.dueDate || resolveRelativeDatePtBR(userInput) || null,
      nextAction: decision.record.nextAction,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    try {
      await storageSaveRecord(fullRecord);
    } catch {
      /* fail silently */
    }
  }
  storageMs = Date.now() - storageStart;

  const actions: string[] = [];
  if (decision.action && decision.action !== "none") {
    actions.push(decision.action);
  }

  const nextSteps: string[] = [];
  if (decision.suggestion) nextSteps.push(decision.suggestion);
  if (decision.followUpQuestion) nextSteps.push(decision.followUpQuestion);

  const { text, voiceReply } = enforceToneRules(decision.reply, decision.voiceReply);
  const totalMs = Date.now() - realStart;

  return {
    text,
    voiceReply,
    intent,
    actionsExecuted: actions,
    nextSteps,
    confidence: decision.confidence,
    providerUsed: llmResult.providerUsed || "unknown",
    route: "llm",
    llmRoute: (llmResult as { route?: string }).route || "api",
    timeMs: totalMs,
    record: decision.record || null,
    suggestion: decision.suggestion,
    followUpQuestion: decision.followUpQuestion,
    tips: decision.tips,
    searchQuery: decision.searchQuery,
    llmText: llmResult.text,
    debug: {
      contextDebug,
      brainItemsUsed: brainContext.length,
      latencyMetrics: {
        totalMs,
        classifyIntentMs,
        smartRouterMs,
        contextBuildMs,
        semanticSearchMs,
        llmMs,
        storageMs,
        providerUsed: llmResult.providerUsed || "unknown",
        fallbackUsed: false,
        intent,
      }
    },
  };
}

export async function reason(
  userInput: string,
  options?: ReasonOptions
): Promise<AionReasonResponse> {
  const startTime = Date.now();
  let classifyIntentMs = 0;
  let smartRouterMs = 0;

  if (!userInput || typeof userInput !== "string" || userInput.trim().length === 0) {
    return buildEmptyResponse(startTime);
  }

  const classifyStart = Date.now();
  const intent = classifyIntent(userInput);
  classifyIntentMs = Date.now() - classifyStart;

  const routerStart = Date.now();
  const routing = smartRouter(userInput.trim());
  smartRouterMs = Date.now() - routerStart;

  if (routing.route === "local") {
    const res = localToReasonResponse(routing.response, intent, startTime);
    const metrics = {
      totalMs: Date.now() - startTime,
      classifyIntentMs,
      smartRouterMs,
      contextBuildMs: 0,
      semanticSearchMs: 0,
      llmMs: 0,
      storageMs: 0,
      providerUsed: "smart-router",
      fallbackUsed: false,
      intent,
    };
    res.debug = {
      ...res.debug,
      latencyMetrics: metrics,
    };
    logLatencyMetrics(metrics);
    return res;
  }

  if (intent === "smalltalk") {
    const greetings = ["oi", "ola", "bom dia", "boa tarde", "boa noite", "eae", "opa", "tudo bem", "olá"];
    const normalized = userInput.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (greetings.includes(normalized) || normalized.length < 5) {
      const metrics = {
        totalMs: Date.now() - startTime,
        classifyIntentMs,
        smartRouterMs,
        contextBuildMs: 0,
        semanticSearchMs: 0,
        llmMs: 0,
        storageMs: 0,
        providerUsed: "local-smalltalk",
        fallbackUsed: false,
        intent,
      };
      const res = {
        text: "Olá! Como posso ajudar você hoje?",
        voiceReply: "Olá! Como posso ajudar?",
        intent,
        actionsExecuted: [],
        nextSteps: ["Criar uma tarefa", "Ver painel financeiro"],
        confidence: 0.95,
        providerUsed: "local-smalltalk",
        route: "local" as const,
        timeMs: Date.now() - startTime,
        debug: {
          latencyMetrics: metrics,
        },
      };
      logLatencyMetrics(metrics);
      return res;
    }
  }

  if (intent === "memory") {
    const memoryStart = Date.now();
    const res = await handleMemoryIntent(userInput, startTime);
    const storageMs = Date.now() - memoryStart;
    const metrics = {
      totalMs: Date.now() - startTime,
      classifyIntentMs,
      smartRouterMs,
      contextBuildMs: 0,
      semanticSearchMs: 0,
      llmMs: 0,
      storageMs,
      providerUsed: res.providerUsed || "aion-brain",
      fallbackUsed: false,
      intent,
    };
    res.debug = {
      ...res.debug,
      latencyMetrics: metrics,
    };
    logLatencyMetrics(metrics);
    return res;
  }

  const res = await llmPipeline(userInput, intent, options, startTime, classifyIntentMs, smartRouterMs);
  if (res.debug?.latencyMetrics) {
    logLatencyMetrics(res.debug.latencyMetrics as any);
  }
  return res;
}
