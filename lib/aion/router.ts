import type { AionResponse } from "./types";
import type { CortexApiResponse, CortexRecordType, Priority } from "@/lib/types";
import { resolveRelativeDatePtBR } from "./dateResolver";

export type RouteResult =
  | { route: "local"; response: AionResponse }
  | { route: "api" };

function tokens(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function now(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function todayStr(): string {
  const d = new Date();
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function makeRecord(
  type: CortexRecordType,
  title: string,
  message: string,
  priority: Priority,
  extra: {
    dueDate?: string | null;
    amount?: number | null;
    category?: string | null;
    project?: string | null;
    nextAction?: string;
  }
): CortexApiResponse {
  return {
    type,
    title,
    description: message,
    priority,
    project: extra.project ?? null,
    amount: extra.amount ?? null,
    category: extra.category ?? null,
    dueDate: extra.dueDate ?? null,
    nextAction: extra.nextAction ?? "",
  };
}

function debugLocal(): { route: "local"; provider: string; providerUsed: string; model: string; fallbackUsed: boolean } {
  return { route: "local", provider: "smart-router", providerUsed: "none", model: "none", fallbackUsed: false };
}

function greetingResponse(lower: string): AionResponse {
  const hour = new Date().getHours();
  let period = "dia";
  if (hour >= 18) period = "noite";
  else if (hour >= 12) period = "tarde";

  const formal = ["bom dia", "boa tarde", "boa noite", "olá", "ola"];
  const isFormal = formal.some((g) => lower.includes(g));
  const isSuperCasual = lower.includes("e aí") || lower.includes("eae") || lower.includes("fala");

  let reply: string;
  let voiceReply: string;

  if (isSuperCasual) {
    reply = "Fala! Tudo bem? Como posso ajudar?";
    voiceReply = "Fala. Tudo bem? Como posso ajudar?";
  } else if (isFormal) {
    reply = `Bom ${period}! Como posso ajudá-lo hoje?`;
    voiceReply = `Bom ${period}. Como posso ajudar?`;
  } else {
    reply = "Olá! Em que posso ajudar?";
    voiceReply = "Olá. Em que posso ajudar?";
  }

  return { reply, voiceReply, action: "none", record: null, confidence: 1, fallbackUsed: false, debug: debugLocal() };
}

function confirmationResponse(lower: string): AionResponse {
  const thanks = ["obrigado", "obrigada", "valeu", "brigado", "brigada", "obg", "thanks", "muito obrigado", "muito obrigada"];
  if (thanks.some((t) => lower.includes(t))) {
    return {
      reply: "Por nada! Se precisar de algo, é só chamar.",
      voiceReply: "Por nada. Se precisar, é só chamar.",
      action: "none", record: null, confidence: 1, fallbackUsed: false, debug: debugLocal(),
    };
  }

  const negative = ["não", "nao", "nem", "agora não", "agora nao", "depois", "que nada"];
  if (negative.some((n) => lower.startsWith(n) || lower === n)) {
    return {
      reply: "Sem problemas. Quando quiser, é só avisar.",
      voiceReply: "Sem problemas. Quando quiser, é só avisar.",
      action: "none", record: null, confidence: 1, fallbackUsed: false, debug: debugLocal(),
    };
  }

  return {
    reply: "Beleza! O que vamos fazer agora?",
    voiceReply: "Beleza. O que vamos fazer agora?",
    action: "none", record: null, confidence: 1, fallbackUsed: false, debug: debugLocal(),
  };
}

function helpResponse(): AionResponse {
  return {
    reply: "Posso te ajudar com: tarefas (\"preciso pagar o aluguel\"), gastos (\"gastei 50 no almoço\"), ideias (\"ideia: criar um app\"), lembretes (\"me lembra de comprar pão amanhã\"), pesquisas na web, e revisão do seu dia. Também entendo saudações e comandos simples. O que você precisa?",
    voiceReply: "Posso ajudar com tarefas, gastos, ideias, lembretes e pesquisas.",
    action: "none", record: null, confidence: 1, fallbackUsed: false, debug: debugLocal(),
  };
}

function dateQueryResponse(): AionResponse {
  return {
    reply: `Hoje é ${todayStr()}. Agora são ${now()}.`,
    voiceReply: `Hoje é ${todayStr()}. Agora são ${now()}.`,
    action: "none", record: null, confidence: 1, fallbackUsed: false, debug: debugLocal(),
  };
}

function formatDatePtBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function cleanTaskTitle(message: string): string {
  const PREFIXES = [
    /^me\s+lembra\s+de\s+/i,
    /^me\s+lembre\s+de\s+/i,
    /^lembrete\s+/i,
    /^tenho\s+que\s+/i,
    /^preciso\s+/i,
    /^não\s+esquecer\s+de\s+/i,
    /^nao\s+esquecer\s+de\s+/i,
  ];

  const DATE_WORDS =
    /\b(hoje|amanhã|amanha|depois\s+de\s+amanhã|depois\s+de\s+amanha|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|semana\s+que\s+vem|mês\s+que\s+vem|mes\s+que\s+vem)\b/gi;

  let title = message;
  for (const prefix of PREFIXES) {
    title = title.replace(prefix, "");
  }
  title = title.replace(DATE_WORDS, "").trim();
  title = title.replace(/\b(a|o|as|os)\b\s*/gi, "").trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title || message;
}

function expenseResponse(message: string): AionResponse {
  const lower = message.toLowerCase();
  let amount: number | null = null;
  const match = message.match(/R?\$?([\d.,]+)/);
  if (match) {
    amount = parseFloat(match[1].replace(",", "."));
  }

  let category: string | null = null;
  if (lower.includes("almoço") || lower.includes("comida") || lower.includes("lanche") || lower.includes("café")) {
    category = "alimentação";
  } else if (lower.includes("transporte") || lower.includes("uber") || lower.includes("gasolina") || lower.includes("ônibus")) {
    category = "transporte";
  } else if (lower.includes("assinatura") || lower.includes("streaming") || lower.includes("netflix")) {
    category = "assinatura";
  } else if (lower.includes("mercado") || lower.includes("supermercado") || lower.includes("feira")) {
    category = "supermercado";
  } else {
    category = "geral";
  }

  const title = amount ? `Gasto de R$ ${amount.toFixed(2)}` : "Gasto registrado";
  const amountStr = amount ? ` de R$ ${amount.toFixed(2)}` : "";
  const catStr = category ? ` em ${category}` : "";

  const record = makeRecord("expense", title, message, "low", {
    amount,
    category,
    nextAction: "Revisar gasto e categorizar",
  });

  return {
    reply: `Registrei um gasto${amountStr}${catStr}. Quer adicionar mais algum detalhe?`,
    voiceReply: `Gasto${amountStr} registrado${catStr}.`,
    action: "create_record",
    record,
    confidence: 0.9,
    fallbackUsed: false,
    debug: debugLocal(),
  };
}

function taskResponse(message: string): AionResponse {
  const lower = message.toLowerCase();
  const urgentWords = ["urgente", "imediatamente", "atrasado", "vencido", "pra ontem"];
  const isUrgent = urgentWords.some((w) => lower.includes(w));
  const priority: Priority = isUrgent ? "high" : "medium";

  const dueDate = resolveRelativeDatePtBR(message);
  const title = cleanTaskTitle(message);

  const record = makeRecord("task", title, message, priority, {
    dueDate: dueDate || null,
    nextAction: title,
  });

  const displayDate = record.dueDate ? formatDatePtBR(record.dueDate) : null;

  const reply = displayDate
    ? `Tarefa registrada para ${displayDate}: "${record.title}".${isUrgent ? " Marquei como urgente!" : ""} Quer definir um projeto ou algo mais?`
    : `Tarefa registrada: "${record.title}". Quer definir um prazo ou projeto?`;

  const voiceReply = displayDate
    ? `Tarefa registrada para ${displayDate}.${isUrgent ? " Urgente!" : ""}`
    : "Tarefa registrada.";

  return {
    reply,
    voiceReply,
    action: "create_record",
    record,
    confidence: 0.9,
    fallbackUsed: false,
    debug: debugLocal(),
  };
}

function ideaResponse(message: string): AionResponse {
  const title = message.replace(/^(ideia|pensando\s+em|e\s+se|que\s+tal)\s*/i, "").trim();

  const record = makeRecord("idea", title || message, message, "medium", {
    nextAction: "Avaliar viabilidade",
  });

  return {
    reply: `Ideia anotada: "${title || message}". Quer desenvolver mais esse pensamento?`,
    voiceReply: "Ideia anotada.",
    action: "create_record",
    record,
    confidence: 0.9,
    fallbackUsed: false,
    debug: debugLocal(),
  };
}

export function smartRouter(message: string): RouteResult {
  const lower = tokens(message).trim();

  if (!lower || lower.length === 0) {
    return {
      route: "local",
      response: {
        reply: "Digite uma mensagem para eu ajudar.",
        voiceReply: "Digite uma mensagem.",
        action: "none",
        record: null,
        confidence: 1,
        fallbackUsed: false,
        debug: debugLocal(),
      },
    };
  }

  const greetingWords = ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "e aí", "eae", "fala aí", "fala ai", "opa", "fala"];
  if (greetingWords.some((g) => lower === g || lower.startsWith(g + " ") || lower.startsWith(g + ",") || lower.startsWith(g + "!"))) {
    return { route: "local", response: greetingResponse(lower) };
  }

  const positiveWords = ["sim", "ok", "okay", "beleza", "pode ser", "tá bom", "ta bom", "claro", "bora", "vamos", "com certeza", "manda"];
  if (positiveWords.some((p) => lower === p || lower.startsWith(p + " ") || lower.startsWith(p + ","))) {
    return { route: "local", response: confirmationResponse(lower) };
  }

  if (lower.startsWith("não") || lower.startsWith("nao") || lower === "nem") {
    return { route: "local", response: confirmationResponse(lower) };
  }

  const thanksWords = ["obrigado", "obrigada", "valeu", "brigado", "brigada", "obg", "thanks", "muito obrigado", "muito obrigada"];
  if (thanksWords.some((t) => lower.includes(t))) {
    return { route: "local", response: confirmationResponse(lower) };
  }

  const helpWords = ["ajuda", "o que você faz", "o que voce faz", "comandos", "help", "pode me ajudar", "como funciona", "o que sabe fazer"];
  if (helpWords.some((h) => lower.includes(h))) {
    return { route: "local", response: helpResponse() };
  }

  const dateQueryWords = ["que horas são", "que horas sao", "que dia é hoje", "que dia e hoje", "qual a data"];
  if (dateQueryWords.some((d) => lower.includes(d))) {
    return { route: "local", response: dateQueryResponse() };
  }

  const expenseWords = ["gastei", "paguei", "comprei", "custou", "gasto", "comprar", "custa"];
  if (expenseWords.some((e) => lower.includes(e))) {
    return { route: "local", response: expenseResponse(message) };
  }

  const taskWords = ["me lembra", "me lembre", "lembrar", "preciso", "tenho que", "precisa", "fazer", "providenciar", "lembra de", "lembre de"];
  if (taskWords.some((t) => lower.includes(t))) {
    return { route: "local", response: taskResponse(message) };
  }

  const ideaWords = ["ideia", "pensando em", "e se", "que tal", "tive uma ideia"];
  if (ideaWords.some((i) => lower.includes(i))) {
    return { route: "local", response: ideaResponse(message) };
  }

  return { route: "api" };
}

export function offlineFallbackResponse(message: string): AionResponse {
  const lower = tokens(message);

  const expenseWords = ["gastei", "paguei", "comprei", "custou", "gasto", "comprar", "custa"];
  if (expenseWords.some((e) => lower.includes(e))) {
    return expenseResponse(message);
  }

  const taskWords = ["me lembra", "me lembre", "lembrar", "preciso", "tenho que", "precisa", "fazer", "providenciar", "lembra de", "lembre de"];
  if (taskWords.some((t) => lower.includes(t))) {
    return taskResponse(message);
  }

  const ideaWords = ["ideia", "pensando em", "e se", "que tal", "tive uma ideia"];
  if (ideaWords.some((i) => lower.includes(i))) {
    return ideaResponse(message);
  }

  return {
    reply: "Consigo te ajudar no modo offline. Quer que eu transforme isso em tarefa, ideia ou nota?",
    voiceReply: "Modo offline. Quer transformar em tarefa, ideia ou nota?",
    action: "ask_clarification",
    record: null,
    confidence: 0.5,
    fallbackUsed: true,
    debug: {
      route: "fallback",
      provider: "smart-router",
      providerUsed: "none",
      model: "none",
      fallbackUsed: true,
      fallbackReason: "all_providers_failed",
    },
  };
}
