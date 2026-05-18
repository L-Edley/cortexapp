import type { CortexApiResponse, CortexRecordType, Priority } from "./types";

export function mockClassify(message: string): CortexApiResponse {
  const lower = message.toLowerCase();

  const expenseKeywords = ["gastei", "paguei", "comprei", "custou", "gasto", "comprar", "custa"];
  const ideaKeywords = ["ideia", "pensando em", "e se", "que tal"];
  const taskKeywords = ["me lembra", "preciso", "tenho que", "precisa", "lembrar", "fazer", "providenciar"];
  const focusKeywords = ["travado", "perdido", "procrastinando", "bloqueado", "preso", "improdutivo"];
  const projectKeywords = ["projeto", "project", "pipeline", "cliente"];
  const reviewKeywords = ["review", "revisão", "daily", "oque fiz"];
  const urgentKeywords = ["urgente", "agora", "hoje", "pra ontem", "amanhã"];

  let type: CortexRecordType = "unknown";
  let title = message;
  let description = "";
  let priority: Priority = "medium";
  let project: string | null = null;
  let amount: number | null = null;
  let category: string | null = null;
  let dueDate: string | null = null;
  let nextAction = "";

  if (expenseKeywords.some((k) => lower.includes(k))) {
    type = "expense";
    priority = "low";
    const match = message.match(/R?\$?([\d.,]+)/);
    if (match) {
      amount = parseFloat(match[1].replace(",", "."));
    }
    if (lower.includes("almoço") || lower.includes("comida") || lower.includes("lanche")) {
      category = "alimentação";
    } else if (lower.includes("transporte") || lower.includes("uber") || lower.includes("gasolina")) {
      category = "transporte";
    } else if (lower.includes("assinatura") || lower.includes("streaming")) {
      category = "assinatura";
    } else {
      category = "geral";
    }
    title = amount ? `Gasto de R$ ${amount.toFixed(2)}` : "Gasto registrado";
    nextAction = "Revisar gasto e categorizar";
  } else if (ideaKeywords.some((k) => lower.includes(k))) {
    type = "idea";
    priority = "medium";
    title = message.replace(/^ideia[:\s]*/i, "").trim();
    nextAction = "Avaliar viabilidade";
  } else if (taskKeywords.some((k) => lower.includes(k))) {
    type = "task";
    if (urgentKeywords.some((k) => lower.includes(k))) {
      priority = "high";
    }
    title = message.replace(/^(me lembra|preciso|tenho que)\s+/i, "").trim();
    const dateMatch = message.match(/(amanhã|hoje|dia \d+|segunda|terça|quarta|quinta|sexta|sábado|domingo)/i);
    if (dateMatch) {
      const dateMap: Record<string, number> = {
        hoje: 0,
        amanhã: 1,
        segunda: 1,
        terça: 2,
        quarta: 3,
        quinta: 4,
        sexta: 5,
        sábado: 6,
        domingo: 0,
      };
      const offset = dateMap[dateMatch[0].toLowerCase()] ?? 0;
      const d = new Date();
      d.setDate(d.getDate() + offset);
      dueDate = d.toISOString().split("T")[0];
    }
    if (projectKeywords.some((k) => lower.includes(k))) {
      const projMatch = message.match(/(?:projeto|project|pipeline|cliente)\s*[:\-]?\s*(.+?)(?:,|$|\.)/i);
      if (projMatch) project = projMatch[1].trim();
    }
    nextAction = priority === "high" ? "Executar agora" : "Agendar execução";
  } else if (focusKeywords.some((k) => lower.includes(k))) {
    type = "focus_request";
    priority = "high";
    title = "Pedido de foco";
    nextAction = "Fazer micro-ação de 5 minutos";
  } else if (projectKeywords.some((k) => lower.includes(k))) {
    type = "project_note";
    priority = "medium";
    const projMatch = message.match(/(?:projeto|project|pipeline|cliente)\s*[:\-]?\s*(.+?)(?:,|$|\.)/i);
    if (projMatch) project = projMatch[1].trim();
    nextAction = "Revisar nota de projeto";
  } else if (reviewKeywords.some((k) => lower.includes(k))) {
    type = "daily_review";
    priority = "medium";
    nextAction = "Fazer revisão diária";
  } else {
    // Para saudações casuais como "ola", "oi", etc.
    const greetings = ["ola", "olá", "oi", "bom dia", "boa tarde", "boa noite", "e aí", "eae"];
    if (greetings.some((g) => lower.includes(g))) {
      type = "unknown";
      title = "Saudação";
      nextAction = "Conversar com o usuário";
    }
  }

  return {
    type,
    title,
    description,
    priority,
    project,
    amount,
    category,
    dueDate,
    nextAction,
  };
}
