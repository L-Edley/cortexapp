import { NextRequest, NextResponse } from "next/server";
import type { CortexApiResponse, CortexRecordType, Priority } from "@/lib/types";

function mockClassify(message: string): CortexApiResponse {
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
    title = amount ? `Gasto de R$ ${amount?.toFixed(2)}` : "Gasto registrado";
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

const PROVIDERS: Record<string, (message: string, opts: { apiKey: string; baseUrl: string; model: string }) => Promise<CortexApiResponse>> = {
  mock: async (message) => mockClassify(message),

  openai: async (message, { apiKey, baseUrl, model }) => {
    const res = await fetch(`${baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a classifier. Return valid JSON only with these fields:
type (enum: task, idea, expense, project_note, daily_review, focus_request, unknown),
title (string),
description (string - MUST be empty when just repeating the original user message. Use description ONLY for additional useful details),
priority (enum: low, medium, high),
project (string or null),
amount (number or null),
category (string or null),
dueDate (string date or null),
nextAction (string). No markdown, no code fences.`,
          },
          { role: "user", content: message },
        ],
        temperature: 0.1,
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const cleaned = text.replace(/```(?:json)?/g, "").trim();
    return JSON.parse(cleaned) as CortexApiResponse;
  },

  gemini: async (message, { apiKey, baseUrl, model }) => {
    const res = await fetch(`${baseUrl || "https://generativelanguage.googleapis.com/v1beta"}/models/${model || "gemini-2.0-flash-lite"}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Classify this message and return ONLY valid JSON with these exact fields:
type (task, idea, expense, project_note, daily_review, focus_request, unknown)
title (string)
description (string - MUST be empty when just repeating the original user message. Use description ONLY for additional useful details)
priority (low, medium, high)
project (string or null)
amount (number or null)
category (string or null)
dueDate (date string or null)
nextAction (string)

Message: """${message}"""`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.1 },
      }),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleaned = text.replace(/```(?:json)?/g, "").trim();
    return JSON.parse(cleaned) as CortexApiResponse;
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Mensagem inválida ou vazia" }, { status: 400 });
    }

    const provider = process.env.AI_PROVIDER || "mock";
    const apiKey = process.env.AI_API_KEY || "";
    const baseUrl = process.env.AI_BASE_URL || "";
    const model = process.env.AI_MODEL || "";

    const handler = PROVIDERS[provider];
    let result: CortexApiResponse;

    if (handler) {
      try {
        result = await handler(message.trim(), { apiKey, baseUrl, model });
      } catch {
        result = mockClassify(message.trim());
      }
    } else {
      result = mockClassify(message.trim());
    }

    const validated: CortexApiResponse = {
      type: result.type ?? "unknown",
      title: result.title ?? message.trim(),
      description: result.description ?? "",
      priority: ["low", "medium", "high"].includes(result.priority) ? result.priority : "medium",
      project: result.project ?? null,
      amount: typeof result.amount === "number" ? result.amount : null,
      category: result.category ?? null,
      dueDate: result.dueDate ?? null,
      nextAction: result.nextAction ?? "",
    };

    return NextResponse.json(validated);
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao processar a mensagem" },
      { status: 500 }
    );
  }
}
