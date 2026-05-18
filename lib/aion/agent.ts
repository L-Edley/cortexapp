import type { CortexRecord } from "@/lib/types";
import type {
  AionResponse,
  AionAction,
  AionDecision,
  AionSource,
  AionFallbackReason,
  RouteType,
} from "./types";
import { getSystemPrompt } from "./systemPrompt";
import { searchWeb, parseRecordFromDecision, getMemory } from "./tools";
import { getOrderedProviders } from "@/lib/ai";
import type { ProviderEntry } from "@/lib/ai";
import { resolveRelativeDatePtBR } from "./dateResolver";
import { smartRouter, offlineFallbackResponse } from "./router";
import { retrieveRelevantBrainContext, answerFromBrain, learnFromInteraction, getBrainMemoryTracker } from "./brain";

const VALID_ACTIONS: AionAction[] = [
  "none",
  "web_search",
  "create_record",
  "ask_clarification",
  "suggest_next_step",
  "read_dashboard",
];

function stripMarkdown(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gm, "")
    .replace(/```/g, "")
    .trim();
}

function extractReplyFromRawText(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const nonJsonLines = lines.filter(
    (l) => !l.startsWith("{") && !l.startsWith("}") && !l.startsWith('"')
  );
  if (nonJsonLines.length > 0) {
    return nonJsonLines.slice(0, 4).join(" ").slice(0, 500);
  }
  return null;
}

function repairJsonFromModel(rawText: string): {
  parsed: Record<string, unknown> | null;
  repaired: boolean;
} {
  const cleaned = stripMarkdown(rawText);

  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!braceMatch) {
    return { parsed: null, repaired: false };
  }

  const candidate = braceMatch[0].trim();

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return { parsed, repaired: false };
  } catch {
    console.warn(
      "[AION] JSON bruto inválido, tentando reparar..."
    );

    try {
      const singleLine = candidate.replace(/\n/g, " ").replace(/\s+/g, " ");
      const fixed = singleLine
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?\s*:/g, '"$2":')
        .replace(/:\s*'([^']*?)'/g, ':"$1"');
      const parsed = JSON.parse(fixed) as Record<string, unknown>;
      console.warn("[AION] JSON reparado com sucesso");
      return { parsed, repaired: true };
    } catch {
      return { parsed: null, repaired: false };
    }
  }
}

function normalizeAionDecision(
  raw: Record<string, unknown> | null,
  userMessage: string
): AionDecision {
  const actionRaw =
    typeof raw?.action === "string"
      ? (raw.action.toLowerCase() as AionAction)
      : "none";
  const action: AionAction = VALID_ACTIONS.includes(actionRaw)
    ? actionRaw
    : "none";

  let reply: string;
  if (typeof raw?.reply === "string" && raw.reply.trim().length > 0) {
    reply = raw.reply.trim();
  } else if (action === "create_record") {
    reply = "Organizado! Registrei no Cortex.";
  } else if (action === "suggest_next_step") {
    reply = "Que tal dar o primeiro passo agora? Comece com uma ação simples de 5 minutos.";
  } else if (action === "ask_clarification") {
    reply = "Pode me dar mais detalhes? Quero ajudar da melhor forma.";
  } else if (action === "web_search") {
    reply = "Deixa eu pesquisar isso pra você.";
  } else if (action === "read_dashboard") {
    reply = "Vou ver seus registros recentes.";
  } else {
    reply = userMessage.length > 0 ? `Entendi: "${userMessage}"` : "Estou aqui. Como posso ajudar?";
  }

  let voiceReply: string;
  if (typeof raw?.voiceReply === "string" && raw.voiceReply.trim().length > 0) {
    voiceReply = raw.voiceReply.trim();
  } else {
    voiceReply = reply;
  }

  const firstSentence = voiceReply.split(/[.!?]/).filter(Boolean)[0] || voiceReply;
  voiceReply = firstSentence.length < voiceReply.length
    ? firstSentence + "."
    : voiceReply;
  if (voiceReply.length > 200) {
    voiceReply = voiceReply.slice(0, 197) + "...";
  }

  let record = null;
  if (action === "create_record") {
    if (raw?.record && typeof raw.record === "object") {
      record = parseRecordFromDecision(raw.record, userMessage);
    } else {
      record = parseRecordFromDecision(
        { type: "task", title: userMessage },
        userMessage
      );
    }
  }

  const confidence =
    typeof raw?.confidence === "number"
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.7;

  const searchQuery =
    action === "web_search" && typeof raw?.searchQuery === "string"
      ? raw.searchQuery
      : undefined;

  const suggestion =
    typeof raw?.suggestion === "string" && raw.suggestion.trim().length > 0
      ? raw.suggestion.trim()
      : undefined;

  const followUpQuestion =
    typeof raw?.followUpQuestion === "string" && raw.followUpQuestion.trim().length > 0
      ? raw.followUpQuestion.trim()
      : undefined;

  let tips: string[] | undefined;
  if (Array.isArray(raw?.tips)) {
    const filtered = raw.tips.filter(
      (t): t is string => typeof t === "string" && t.trim().length > 0
    );
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

function parseJSON(text: string): AionDecision | null {
  const { parsed, repaired } = repairJsonFromModel(text);

  if (!parsed) {
    console.warn(
      "[AION] resposta da IA fora do schema — nenhum JSON encontrado após reparo"
    );
    const extractedText = extractReplyFromRawText(text);
    if (extractedText) {
      console.warn("[AION] usando texto extraído como reply de fallback");
      return {
        reply: extractedText,
        voiceReply: extractedText.split(/[.!?]/)[0] + ".",
        action: "none",
        confidence: 0.4,
      };
    }
    return null;
  }

  const decision = normalizeAionDecision(parsed, "");
  if (repaired) {
    console.log("[AION] decisão normalizada após reparo:", JSON.stringify(decision));
  }
  return decision;
}

async function callAI(
  prompt: string,
  systemPrompt: string,
  providerEntry?: ProviderEntry
): Promise<{
  decision: AionDecision | null;
  reason: AionFallbackReason | null;
  providerUsed: string;
}> {
  const entry = providerEntry || getOrderedProviders()[0] || null;
  if (!entry) {
    console.warn("[AION] Nenhum provider de IA disponível");
    return { decision: null, reason: "missing_api_key", providerUsed: "none" };
  }

  const { provider, name } = entry;

  try {
    const text = await provider.generateResponse(prompt, systemPrompt);
    if (!text) {
      console.warn(`[AION] provider ${name} retornou null`);
      return { decision: null, reason: "empty_response", providerUsed: name };
    }

    if (text.startsWith("opencode_") || text.startsWith("openrouter_") || text.startsWith("groq_") || text.startsWith("nvidia_")) {
      console.warn(`[AION] provider ${name} retornou código de erro:`, text);
      return { decision: null, reason: text as AionFallbackReason, providerUsed: name };
    }

    console.log("[AION] resposta bruta recebida, aplicando reparo+normalização...");
    const decision = parseJSON(text);

    if (!decision) {
      console.warn(`[AION] JSON inválido mesmo após reparo (provider: ${name})`);
      return { decision: null, reason: "invalid_json_after_repair", providerUsed: name };
    }

    if (
      decision.action !== "none" &&
      decision.action !== "create_record" &&
      decision.action !== "suggest_next_step" &&
      decision.action !== "ask_clarification" &&
      decision.action !== "read_dashboard" &&
      decision.action !== "web_search"
    ) {
      console.warn(`[AION] schema inválido: action desconhecida (provider: ${name})`);
      return { decision: null, reason: "invalid_schema_after_normalize", providerUsed: name };
    }

    console.log("[AION] decisão do provider", name, ":", JSON.stringify(decision));
    return { decision, reason: null, providerUsed: name };
  } catch (err) {
    console.error(`[AION] erro inesperado no provider ${name}:`, err);
    return { decision: null, reason: "unknown", providerUsed: name };
  }
}

async function callAIWithFallback(
  prompt: string,
  systemPrompt: string
): Promise<{
  decision: AionDecision | null;
  reason: AionFallbackReason | null;
  providerUsed: string;
}> {
  const providers = getOrderedProviders();

  if (providers.length === 0) {
    console.warn("[AION] Nenhum provider disponível na cadeia de fallback");
    return { decision: null, reason: "missing_api_key", providerUsed: "none" };
  }

  for (const entry of providers) {
    console.log(`[AION] tentando provider: ${entry.name}`);
    const result = await callAI(prompt, systemPrompt, entry);
    if (result.decision) {
      console.log(`[AION] provider ${entry.name} funcionou`);
      return result;
    }
    console.warn(`[AION] provider ${entry.name} falhou: ${result.reason}`);
  }

  console.warn("[AION] todos os providers falharam");
  return { decision: null, reason: "all_providers_failed", providerUsed: "none" };
}

async function callAIWithSearch(
  originalMessage: string,
  searchQuery: string,
  searchResults: AionSource[],
  providerEntry?: ProviderEntry
): Promise<{ reply: string; voiceReply: string } | null> {
  const entry = providerEntry || getOrderedProviders()[0] || null;
  if (!entry) return null;

  const { provider } = entry;

  const sourcesText = searchResults
    .map((s, i) => `${i + 1}. ${s.title} — ${s.url}`)
    .join("\n");

  const prompt = `A mensagem do usuário foi: "${originalMessage}"

Você pesquisou na internet com o termo: "${searchQuery}"

RESULTADOS DA PESQUISA:
${sourcesText}

Com base nesses resultados, responda ao usuário de forma natural e informativa.
Seja conciso (máximo 3 frases na reply, 1 na voiceReply).
Mencione as fontes quando relevante.
Responda em português do Brasil.

Sua resposta DEVE ser APENAS um objeto JSON:
{
  "reply": "resposta completa",
  "voiceReply": "versão ultra curta (1 frase) para TTS"
}`;

  try {
    const text = await provider.generateResponse(
      prompt,
      "Você é Aion, assistente pessoal. Responda com JSON puro."
    );
    if (!text) return null;

    const { parsed } = repairJsonFromModel(text);
    if (!parsed) return null;

    return {
      reply: (parsed.reply as string) || "Aqui estão os resultados.",
      voiceReply: (parsed.voiceReply as string) || "Resultados encontrados.",
    };
  } catch {
    return null;
  }
}

function buildUserPrompt(params: {
  message: string;
  currentView?: string;
  contextSummary: string;
  conversationContext: string;
}): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const currentDate = `${y}-${m}-${d}`;

  const parts: string[] = [];

  parts.push(`CURRENT_DATE=${currentDate}\n`);

  if (params.contextSummary) {
    parts.push(
      `CONTEXTO DO USUÁRIO (registros recentes):\n${params.contextSummary}\n`
    );
  }

  if (params.conversationContext) {
    parts.push(`CONVERSA RECENTE:\n${params.conversationContext}\n`);
  }

  if (params.currentView) {
    parts.push(`TELA ATUAL: ${params.currentView}\n`);
  }

  parts.push(`MENSAGEM DO USUÁRIO: "${params.message}"`);

  parts.push(
    `\nSua resposta DEVE ser APENAS um objeto JSON válido com esta estrutura exata, sem markdown, sem código formatado, sem tags:\n` +
      `{\n` +
      `  "reply": "sua resposta como secretária — natural, útil, até 4 frases",\n` +
      `  "voiceReply": "versão ultra curta (1 frase) para ser falada em voz alta",\n` +
      `  "action": "none" | "web_search" | "create_record" | "ask_clarification" | "suggest_next_step" | "read_dashboard",\n` +
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
      `- "confidence" reflete o quão certo você está sobre a ação (0.0 = incerto, 1.0 = certo).\n` +
      `- "voiceReply" deve ser no máximo UMA frase, curta, para TTS.\n` +
      `- "suggestion" deve ser prática e acionável, como uma secretária daria.`
  );

  return parts.join("\n\n");
}

function fallbackResponse(
  message: string,
  reason?: AionFallbackReason,
  providerUsed?: string
): AionResponse {
  console.log("[AION] fallbackUsed: true");
  console.log("[AION] fallbackReason:", reason || "unknown");

  const result = offlineFallbackResponse(message);
  result.debug = {
    route: "fallback",
    provider: process.env.AI_PROVIDER || "n/a",
    providerUsed: providerUsed || "none",
    model: process.env.AI_MODEL || "n/a",
    fallbackUsed: true,
    fallbackReason: reason || "all_providers_failed",
  };
  return result;
}

export async function runAgent(params: {
  message: string;
  recentRecords?: CortexRecord[];
  currentView?: string;
}): Promise<AionResponse> {
  const { message, recentRecords, currentView } = params;

  console.log("[AION] ===== NOVA REQUISIÇÃO =====");
  console.log("[AION] mensagem:", message);

  if (
    !message ||
    typeof message !== "string" ||
    message.trim().length === 0
  ) {
    return {
      reply: "Digite uma mensagem para eu ajudar.",
      voiceReply: "Digite uma mensagem.",
      action: "none",
      record: null,
      confidence: 1,
      fallbackUsed: false,
    };
  }

  const memory = getMemory();
  memory.addMessage({ role: "user", content: message });

  const routing = smartRouter(message.trim());

  console.log("[AION] route:", routing.route);

  if (routing.route === "local") {
    const localResponse = routing.response;
    localResponse.debug = {
      route: "local",
      provider: "smart-router",
      providerUsed: "none",
      model: "none",
      fallbackUsed: false,
    };
    memory.addMessage({ role: "assistant", content: localResponse.reply });
    console.log("[AION] reply (local):", localResponse.reply);
    return localResponse;
  }

  const brainContext = await retrieveRelevantBrainContext(message);
  const brainAnswer = await answerFromBrain(message, brainContext);

  if (brainAnswer.answer && brainAnswer.confidence >= 0.7) {
    const brainResponse: AionResponse = {
      reply: brainAnswer.answer,
      voiceReply: brainAnswer.answer.split(/[.!?]/)[0] + ".",
      action: "none",
      record: null,
      confidence: brainAnswer.confidence,
      fallbackUsed: false,
      debug: {
        route: "brain",
        provider: "aion-brain",
        providerUsed: "none",
        model: "none",
        fallbackUsed: false,
        brainItemsUsed: brainAnswer.items.length,
        learnedNewItem: false,
      },
    };
    memory.addMessage({ role: "assistant", content: brainAnswer.answer });
    console.log("[AION] route: brain");
    console.log("[AION] brainItemsUsed:", brainAnswer.items.length);
    return brainResponse;
  }

  console.log("[AION] roteado para API");

  const records = recentRecords || [];
  const contextSummary = memory.formatUserContextSummary(
    memory.summarizeUserContext(records)
  );
  const conversationContext = memory.formatConversationContext();
  const systemPrompt = getSystemPrompt();

  const userPrompt = buildUserPrompt({
    message: message.trim(),
    currentView,
    contextSummary,
    conversationContext,
  });

  const { decision, reason, providerUsed } = await callAIWithFallback(
    userPrompt,
    systemPrompt
  );

  if (!decision) {
    const fb = fallbackResponse(message, reason || "all_providers_failed", providerUsed);
    fb.debug = {
      route: "fallback",
      provider: process.env.AI_PROVIDER || "n/a",
      providerUsed: providerUsed || "none",
      model: process.env.AI_MODEL || "n/a",
      fallbackUsed: true,
      fallbackReason: reason || "all_providers_failed",
      brainItemsUsed: brainContext?.length || 0,
      learnedNewItem: false,
    };
    memory.addMessage({ role: "assistant", content: fb.reply });
    return fb;
  }

  const learnedItem = await learnFromInteraction(
    message,
    decision.reply,
    decision.action
  );
  await getBrainMemoryTracker().trackInteraction(message, decision.reply);

  const route: RouteType = "api";

  console.log("[AION] fallbackUsed: false");
  console.log("[AION] action:", decision.action);
  console.log("[AION] confidence:", decision.confidence);
  console.log("[AION] providerUsed:", providerUsed);

  const action: AionAction = decision.action || "none";
  const confidence = decision.confidence ?? 0.5;

  const debugBase = {
    route,
    provider: process.env.AI_PROVIDER || "n/a",
    providerUsed: providerUsed || process.env.AI_PROVIDER || "n/a",
    model: process.env.AI_MODEL || "n/a",
    fallbackUsed: false,
    brainItemsUsed: brainContext.length,
    learnedNewItem: !!learnedItem,
  };

  if (action === "web_search" && decision.searchQuery) {
    console.log("[AION] executando web_search:", decision.searchQuery);

    try {
      const { results } = await searchWeb(decision.searchQuery);
      console.log("[AION] web_search retornou", results.length, "resultados");

      const searchReply = await callAIWithSearch(
        message,
        decision.searchQuery,
        results
      );

      const finalReply = searchReply?.reply || decision.reply;
      const finalVoice = searchReply?.voiceReply || decision.voiceReply;

      const response: AionResponse = {
        reply: finalReply,
        voiceReply: finalVoice,
        action,
        record: null,
        sources: results,
        suggestion: decision.suggestion || undefined,
        followUpQuestion: decision.followUpQuestion || undefined,
        tips: decision.tips || undefined,
        confidence,
        fallbackUsed: false,
        debug: debugBase,
      };

      memory.addMessage({ role: "assistant", content: finalReply });
      return response;
    } catch (err) {
      console.error("[AION] web_search erro:", err);
      const response: AionResponse = {
        reply: decision.reply || "Não consegui pesquisar agora.",
        voiceReply: decision.voiceReply || "Pesquisa indisponível.",
        action: "none",
        record: null,
        confidence: 0.3,
        fallbackUsed: true,
        debug: {
          ...debugBase,
          fallbackUsed: true,
          fallbackReason: "unknown",
        },
      };
      memory.addMessage({ role: "assistant", content: response.reply });
      return response;
    }
  }

  let record = null;
  if (action === "create_record") {
    record = parseRecordFromDecision(decision.record, message);
    const resolvedDate = resolveRelativeDatePtBR(message);
    if (record && !record.dueDate && resolvedDate) {
      record.dueDate = resolvedDate;
      console.log("[AION] dueDate resolvido por dateResolver:", resolvedDate);
    }
    console.log("[AION] create_record:", JSON.stringify(record));
  }

  const response: AionResponse = {
    reply: decision.reply || "Organizado.",
    voiceReply: decision.voiceReply || decision.reply || "Organizado.",
    action,
    record,
    suggestion: decision.suggestion || undefined,
    followUpQuestion: decision.followUpQuestion || undefined,
    tips: decision.tips || undefined,
    confidence,
    fallbackUsed: false,
    debug: debugBase,
  };

  memory.addMessage({ role: "assistant", content: response.reply });

  console.log("[AION] reply:", response.reply);
  console.log("[AION] voiceReply:", response.voiceReply);
  console.log("[AION] fallbackReason: none");
  if (response.suggestion) console.log("[AION] suggestion:", response.suggestion);
  if (response.followUpQuestion) console.log("[AION] followUpQuestion:", response.followUpQuestion);
  if (response.tips) console.log("[AION] tips:", response.tips);

  return response;
}
