import type { CortexRecord } from "@/lib/types";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import type {
  AionResponse,
  AionAction,
  AionSource,
  RouteType,
  LearningCandidate,
  AionClientContext,
} from "./types";
import type { SessionMessage } from "@/lib/sessionMemory";
import { searchWeb, getMemory } from "./tools";
import { getOrderedProviders } from "@/lib/ai";
import type { ProviderEntry } from "@/lib/ai";
import { reason } from "@/lib/aionReason";

const LEARN_PATTERNS =
  /(decidi|vou|vamos|como|passo|forma|maneira|pesquisar|buscar|saber|descobrir|sempre|nunca|percebi|notei|padrão|comportamento|habito|cortex|aion|projeto|prefiro|gosto|queria|gostaria)/i;

const SENSITIVE =
  /(senha|password|token|api_key|secret|credential|cartão|cvv|cpf|rg|documento)/i;

function shouldLearnFromInteraction(
  message: string,
  response: string,
  action?: string,
  confidence?: number
): boolean {
  if (!message || message.trim().length < 8) return false;
  if (!response || response.trim().length < 8) return false;
  if (action === "create_record") return false;
  if (confidence !== undefined && confidence < 0.65) return false;
  if ((!action || action === "none") && response.length < 20) return false;
  if (!LEARN_PATTERNS.test(message)) return false;
  if (SENSITIVE.test(message) || SENSITIVE.test(response)) return false;
  return true;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gm, "")
    .replace(/```/g, "")
    .trim();
}

function repairJsonFromModel(rawText: string): {
  parsed: Record<string, unknown> | null;
  repaired: boolean;
} {
  const cleaned = stripMarkdown(rawText);
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!braceMatch) return { parsed: null, repaired: false };

  const candidate = braceMatch[0].trim();

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    return { parsed, repaired: false };
  } catch {
    try {
      const singleLine = candidate.replace(/\n/g, " ").replace(/\s+/g, " ");
      const fixed = singleLine
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?\s*:/g, '"$2":')
        .replace(/:\s*'([^']*?)'/g, ':"$1"');
      const parsed = JSON.parse(fixed) as Record<string, unknown>;
      return { parsed, repaired: true };
    } catch {
      return { parsed: null, repaired: false };
    }
  }
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

export async function runAgent(params: {
  message: string;
  recentRecords?: CortexRecord[];
  currentView?: string;
  brainContextFromClient?: Partial<AionBrainItem>[];
  profileContext?: string;
  sessionMessages?: SessionMessage[];
  clientContext?: AionClientContext;
}): Promise<AionResponse> {
  const { message, recentRecords, brainContextFromClient, sessionMessages } = params;

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

  const reasonResult = await reason(message, {
    recentRecords,
    brainContextFromClient,
    sessionMessages,
    clientContext: params.clientContext,
  });

  const route: RouteType =
    reasonResult.route === "fallback"
      ? "fallback"
      : reasonResult.route === "brain"
        ? "brain"
        : reasonResult.route === "local"
          ? "local"
          : "api";

  const fallbackUsed = reasonResult.route === "fallback";

  console.log("[AION] route:", route);
  console.log("[AION] intent:", reasonResult.intent);
  console.log("[AION] action:", reasonResult.actionsExecuted);
  console.log("[AION] confidence:", reasonResult.confidence);
  console.log("[AION] providerUsed:", reasonResult.providerUsed);

  const action: AionAction =
    reasonResult.actionsExecuted.length > 0
      ? (reasonResult.actionsExecuted[0] as AionAction)
      : "none";

  let finalReply = reasonResult.text;
  let finalVoice = reasonResult.voiceReply;
  let sources: AionSource[] | undefined;

  if (action === "web_search" && reasonResult.searchQuery) {
    console.log("[AION] executando web_search:", reasonResult.searchQuery);

    try {
      const { results } = await searchWeb(reasonResult.searchQuery);
      sources = results;
      console.log("[AION] web_search retornou", results.length, "resultados");

      const searchReply = await callAIWithSearch(
        message,
        reasonResult.searchQuery,
        results
      );

      if (searchReply) {
        finalReply = searchReply.reply;
        finalVoice = searchReply.voiceReply;
      }
    } catch (err) {
      console.error("[AION] web_search erro:", err);
    }
  }

  const shouldLearn = shouldLearnFromInteraction(
    message,
    finalReply,
    action,
    reasonResult.confidence
  );

  const learningCandidate: LearningCandidate | undefined = shouldLearn
    ? {
        shouldLearn: true,
        message,
        response: finalReply,
        action,
        confidence: reasonResult.confidence,
        providerUsed: reasonResult.providerUsed,
      }
    : undefined;

  const debug = {
    route,
    provider: process.env.AI_PROVIDER || "n/a",
    providerUsed:
      reasonResult.providerUsed || process.env.AI_PROVIDER || "n/a",
    model: process.env.AI_MODEL || "n/a",
    fallbackUsed,
    intent: reasonResult.intent,
    timeMs: reasonResult.timeMs,
    ...(reasonResult.debug?.contextDebug
      ? { contextDebug: reasonResult.debug.contextDebug }
      : {}),
    ...(reasonResult.debug?.latencyMetrics
      ? { latencyMetrics: reasonResult.debug.latencyMetrics as any }
      : {}),
    learnedNewItem: false,
  };

  memory.addMessage({ role: "assistant", content: finalReply });

  console.log("[AION] reply:", finalReply);
  console.log("[AION] voiceReply:", finalVoice);
  console.log("[AION] fallbackUsed:", fallbackUsed);
  if (reasonResult.suggestion)
    console.log("[AION] suggestion:", reasonResult.suggestion);
  if (reasonResult.followUpQuestion)
    console.log("[AION] followUpQuestion:", reasonResult.followUpQuestion);
  if (reasonResult.tips)
    console.log("[AION] tips:", reasonResult.tips);

  return {
    reply: finalReply,
    voiceReply: finalVoice,
    action,
    record: reasonResult.record || null,
    sources,
    suggestion: reasonResult.suggestion,
    followUpQuestion: reasonResult.followUpQuestion,
    tips: reasonResult.tips,
    confidence: reasonResult.confidence,
    fallbackUsed,
    learningCandidate,
    debug,
  };
}
