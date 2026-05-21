export type AionRequestIntent =
  | "create_task"
  | "create_expense"
  | "save_memory"
  | "ask_project_doctrine"
  | "ask_strategy"
  | "ask_current_info"
  | "ask_web_research"
  | "ask_learning"
  | "voice_action"
  | "casual_chat"
  | "clarification"
  | "unknown";

export interface AionRequestEntity {
  type: "date" | "money" | "project" | "topic" | "task_title" | "action_reference" | "priority" | "source";
  value: string;
  confidence: number;
}

export type AionRouteHint =
  | "smart_router"
  | "official_doctrine"
  | "learning_engine"
  | "web_research"
  | "voice_action"
  | "llm"
  | "local_conversation";

export interface AionUnderstandingResult {
  primaryIntent: AionRequestIntent;
  secondaryIntents: AionRequestIntent[];
  entities: AionRequestEntity[];
  confidence: number;
  shouldAskClarification: boolean;
  clarificationQuestion?: string;
  routeHint: AionRouteHint;
  shouldUseLLM: boolean;
  shouldUseWeb: boolean;
  shouldSaveMemory: boolean;
}

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const MEMORY_PREFIX = /^(salve|salva|registre|registra|lembre|lembra|guarde|guarda|anote|anota)\s+(que|disso)\b/i;

const EXPLICIT_COMMANDS: Array<{ pattern: RegExp; intent: AionRequestIntent; extract?: (m: RegExpMatchArray) => AionRequestEntity[] }> = [
  {
    pattern: /^me\s+lembr[ae]\s+de\s+(.+)/i,
    intent: "create_task",
    extract: (m) => {
      const title = m[1].replace(/(?:^|\s+)(amanh[ãa]|hoje|depois|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|pr[oó]ximo)\s*.*/i, "").trim();
      const entities: AionRequestEntity[] = [];
      if (title) entities.push({ type: "task_title", value: title.charAt(0).toUpperCase() + title.slice(1), confidence: 0.9 });
      const dateMatch = m[1].match(/\b(amanh[ãa]|hoje|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|pr[oó]ximo)\b/i);
      if (dateMatch) entities.push({ type: "date", value: dateMatch[0].toLowerCase(), confidence: 0.95 });
      return entities;
    },
  },
  {
    pattern: /^(gastei|paguei|recebi|custou|comprei)\s+(.+)/i,
    intent: "create_expense",
    extract: (m) => {
      const entities: AionRequestEntity[] = [];
      const moneyMatch = m[2].match(/(\d+[.,]?\d*)\s*(reais|r\$|real|centavos|d[oó]lares|usd)/i);
      if (moneyMatch) entities.push({ type: "money", value: moneyMatch[0].toLowerCase(), confidence: 0.95 });
      return entities;
    },
  },
  {
    pattern: MEMORY_PREFIX,
    intent: "save_memory",
    extract: (m) => {
      const entities: AionRequestEntity[] = [];
      const content = m[0].replace(/^(salve|salva|registre|registra|lembre|lembra|guarde|guarda|anote|anota)\s+(que|disso)\s*/i, "").trim();
      if (content) entities.push({ type: "task_title", value: content, confidence: 0.85 });
      return entities;
    },
  },
];

const DOCTRINE_PATTERNS = [
  /\b(obsidian)\b/i,
  /\b(supabase)\b/i,
  /\b(groq)\b/i,
  /arquitetura\s+oficial/i,
  /prioridade\s+atual/i,
  /provider\s+principal/i,
  /banco\s+principal/i,
  /doutrina\s+oficial/i,
];

const VOICE_ACTION_PATTERNS = [
  /transforma\s+(isso|esse)\s+em\s+tarefas?/i,
  /aceita\s+(esse|este)\s+plano/i,
  /continua\s+(de\s+onde\s+)?(paramos|disso)/i,
  /aprova\s+(s[oó]?\s+)?a\s+primeira/i,
  /([Cc])ancela\s+(isso|esse|a\s+segunda|a\s+terceira)/i,
  /([Aa])plica\s+(isso|esse|tudo|a\s+mudança)/i,
  /([Rr])ejeita\s+(isso|esse)/i,
];

const WEB_RESEARCH_TRIGGERS = [
  /\b(not[ií]cias|novidades|lan[cç]amentos?|ranking|cota[cç][oã]o|resultado|vers[aã]o\s+atual)\b/i,
  /\b(pre[cç]o\s+atual|cota[cç][aã]o\s+do|qual\s+o\s+pre[cç]o)\b/i,
  /\b(hoje|agora)\s.*\b(pre[cç]o|cota[cç][aã]o|taxa|índice|bolsa|d[oó]lar|bitcoin|btc|ether|eth)\b/i,
  /\b(quais?)\s+(as\s+)?(novidades|not[ií]cias|tend[êe]ncias|lan[cç]amentos)\b/i,
  /\b(impactar[ãa]o?|afetam|influenciam)\s+(o\s+)?(cortex|aion|projeto|ecossistema)\b/i,
];

const STRATEGY_PATTERNS = [
  /^como\s+(estruturar|organizar|implementar|fazer|criar|montar|construir|planejar)\b/i,
  /^qual(\s+o)?\s+(melhor\s+)?(pr[oó]ximo\s+passo|estrat[ée]gia|abordagem|caminho|decis[aã]o)\b/i,
  /^o\s+que\s+voc[êe]\s+(acha|pensa|recomenda|sugere)\b/i,
  /^como\s+eu\s+(deveria|poderia|posso)\b/i,
  /\b(estrat[ée]gia|estrat[ée]gico)\s+(para\s+)?(o\s+)?(cortex|aion|projeto)\b/i,
];

const CASUAL_PATTERNS = [
  /^(oi|ol[áa]|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[íi]|eae|fala|opa|beleza|tudo\s+bem)/i,
  /^(valeu|obrigado|brigado|thanks|obg|tks)/i,
  /^(sim|n[aã]o|talvez|ok|okay|claro|pode\s+ser|legal)/i,
];

export function extractEntities(input: string, primaryIntent: AionRequestIntent): AionRequestEntity[] {
  const normalized = normalize(input);
  const entities: AionRequestEntity[] = [];

  const dateMatch = normalized.match(/\b(amanh[ãa]|hoje|depois\s+de\s+amanh[ãa]|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|pr[oó]ximo)\b/i);
  if (dateMatch) {
    entities.push({ type: "date", value: dateMatch[0].toLowerCase(), confidence: 0.9 });
  }

  const moneyMatch = /(\d+[.,]?\d*)\s*(reais|r\$|real|centavos|d[oó]lares|usd|euros)/i.exec(normalized);
  if (moneyMatch) {
    entities.push({ type: "money", value: moneyMatch[0].toLowerCase(), confidence: 0.9 });
  }

  if (primaryIntent === "ask_web_research" || primaryIntent === "ask_current_info") {
    const topicMatch = normalized.match(/(?:not[ií]cias|novidades|tend[êe]ncias|lan[cç]amentos?|sobre)\s+(.+?)(?:\s*[?.,!]|\s*$)/i);
    if (topicMatch) {
      entities.push({ type: "topic", value: topicMatch[1].trim(), confidence: 0.7 });
    }
  }

  const projectMatch = /\b(cortex|aion)\b/i.exec(normalized);
  if (projectMatch) {
    entities.push({ type: "project", value: projectMatch[0].toLowerCase(), confidence: 0.95 });
  }

  return entities;
}

export function detectAmbiguity(input: string, primaryIntent: AionRequestIntent): { ambiguous: boolean; question?: string } {
  const n = normalize(input);
  const length = n.split(/\s+/).length;

  if (length < 2 && primaryIntent === "unknown") {
    return { ambiguous: true, question: "Pode me dar mais contexto? Não entendi o que você precisa." };
  }

  if (/^(isso|esse|este|aquilo|l[aá]|ali|a[ií])\s*$/i.test(n)) {
    return { ambiguous: true, question: "Sobre o que você está falando? Pode me dar mais detalhes?" };
  }

  if (primaryIntent === "unknown" && /^\S+\s+\S+$/.test(n)) {
    return { ambiguous: true, question: "Você poderia reformular? Não entendi exatamente o que deseja." };
  }

  return { ambiguous: false };
}

export function understandAionRequest(
  input: string,
  _context?: string
): AionUnderstandingResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      primaryIntent: "unknown",
      secondaryIntents: [],
      entities: [],
      confidence: 0,
      shouldAskClarification: false,
      routeHint: "llm",
      shouldUseLLM: true,
      shouldUseWeb: false,
      shouldSaveMemory: false,
    };
  }

  const secondaryIntents: AionRequestIntent[] = [];
  let primaryIntent: AionRequestIntent = "unknown";
  let routeHint: AionRouteHint = "llm";
  let shouldUseLLM = false;
  let shouldUseWeb = false;
  let shouldSaveMemory = false;
  let confidence = 0;

  // ─── 1. Comando pessoal explícito ───
  for (const cmd of EXPLICIT_COMMANDS) {
    const match = trimmed.match(cmd.pattern);
    if (match) {
      primaryIntent = cmd.intent;
      routeHint = "smart_router";
      shouldUseLLM = false;
      shouldUseWeb = false;
      shouldSaveMemory = cmd.intent === "save_memory";
      confidence = 0.95;
      const entities = cmd.extract ? cmd.extract(match) : [];
      const extra = extractEntities(trimmed, primaryIntent);
      return {
        primaryIntent,
        secondaryIntents,
        entities: [...entities, ...extra],
        confidence,
        shouldAskClarification: false,
        routeHint,
        shouldUseLLM,
        shouldUseWeb,
        shouldSaveMemory,
      };
    }
  }

  // ─── 2. Doutrina oficial ───
  for (const pattern of DOCTRINE_PATTERNS) {
    if (pattern.test(trimmed)) {
      const questionIntent: AionRequestIntent = "ask_project_doctrine";
      secondaryIntents.push(questionIntent);
      primaryIntent = questionIntent;
      routeHint = "official_doctrine";
      shouldUseLLM = false;
      shouldUseWeb = false;
      shouldSaveMemory = false;
      confidence = 0.9;
      return {
        primaryIntent,
        secondaryIntents,
        entities: extractEntities(trimmed, primaryIntent),
        confidence,
        shouldAskClarification: false,
        routeHint,
        shouldUseLLM,
        shouldUseWeb,
        shouldSaveMemory,
      };
    }
  }

  // ─── 3. Ação por voz/contexto ───
  for (const pattern of VOICE_ACTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      primaryIntent = "voice_action";
      routeHint = "voice_action";
      shouldUseLLM = true;
      shouldUseWeb = false;
      shouldSaveMemory = false;
      confidence = 0.85;
      const entities = extractEntities(trimmed, primaryIntent);
      const refMatch = trimmed.match(/(isso|esse|este|essas|essas|ele|ela)/i);
      if (refMatch) {
        entities.push({ type: "action_reference", value: refMatch[0].toLowerCase(), confidence: 0.8 });
      }
      return {
        primaryIntent,
        secondaryIntents,
        entities,
        confidence,
        shouldAskClarification: false,
        routeHint,
        shouldUseLLM,
        shouldUseWeb,
        shouldSaveMemory,
      };
    }
  }

  // ─── 4. Informação atual/volátil (web research) ───
  for (const pattern of WEB_RESEARCH_TRIGGERS) {
    if (pattern.test(trimmed)) {
      primaryIntent = "ask_web_research";
      secondaryIntents.push("ask_current_info");
      routeHint = "web_research";
      shouldUseLLM = true;
      shouldUseWeb = true;
      shouldSaveMemory = false;
      confidence = 0.85;
      return {
        primaryIntent,
        secondaryIntents,
        entities: extractEntities(trimmed, primaryIntent),
        confidence,
        shouldAskClarification: false,
        routeHint,
        shouldUseLLM,
        shouldUseWeb,
        shouldSaveMemory,
      };
    }
  }

  // ─── 5. Estratégia/projeto ───
  for (const pattern of STRATEGY_PATTERNS) {
    if (pattern.test(trimmed)) {
      primaryIntent = "ask_strategy";
      routeHint = "learning_engine";
      shouldUseLLM = true;
      shouldUseWeb = false;
      shouldSaveMemory = false;
      confidence = 0.8;
      return {
        primaryIntent,
        secondaryIntents,
        entities: extractEntities(trimmed, primaryIntent),
        confidence,
        shouldAskClarification: false,
        routeHint,
        shouldUseLLM,
        shouldUseWeb,
        shouldSaveMemory,
      };
    }
  }

  // ─── 6. Conversa casual ───
  for (const pattern of CASUAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      primaryIntent = "casual_chat";
      routeHint = "local_conversation";
      shouldUseLLM = false;
      shouldUseWeb = false;
      shouldSaveMemory = false;
      confidence = 0.9;
      return {
        primaryIntent,
        secondaryIntents,
        entities: [],
        confidence,
        shouldAskClarification: false,
        routeHint,
        shouldUseLLM,
        shouldUseWeb,
        shouldSaveMemory,
      };
    }
  }

  // ─── 7. Fallback: detect ambiguity ───
  const ambiguity = detectAmbiguity(trimmed, primaryIntent);
  let shouldAskClarification = ambiguity.ambiguous;
  let clarificationQuestion = ambiguity.question;

  if (shouldAskClarification) {
    primaryIntent = "clarification";
    routeHint = "local_conversation";
    shouldUseLLM = false;
    confidence = 0.5;
  } else {
    primaryIntent = "unknown";
    routeHint = "llm";
    shouldUseLLM = true;
    confidence = 0.3;
  }

  return {
    primaryIntent,
    secondaryIntents,
    entities: extractEntities(trimmed, primaryIntent),
    confidence,
    shouldAskClarification,
    clarificationQuestion,
    routeHint,
    shouldUseLLM,
    shouldUseWeb,
    shouldSaveMemory,
  };
}
