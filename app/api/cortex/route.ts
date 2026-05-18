import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Mensagem inválida ou vazia" }, { status: 400 });
    }

    const provider = process.env.AI_PROVIDER || "mock";
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
    const modelName = process.env.AI_MODEL || "gemini-2.5-flash";

    let result: CortexApiResponse;

    if (provider === "gemini" && apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `
Você é o Aion, a IA central do sistema Cortex.
Analise a mensagem do usuário e extraia os dados estruturados estritamente no seguinte formato JSON.

Regras de classificação:
1. "type" deve ser obrigatoriamente um destes valores: "task", "idea", "expense", "project_note", "daily_review", "focus_request", "unknown".
   - Se for despesa/gasto/compra: "expense".
   - Se for tarefa/compromisso/ação: "task".
   - Se for uma ideia ou nota: "idea".
   - Se for nota sobre projetos: "project_note".
   - Se for revisão do dia: "daily_review".
   - Se for pedido de foco/travamento: "focus_request".
2. "priority" deve ser: "low", "medium" ou "high".
3. "description" deve ser vazia ("") a menos que haja algum detalhe extra muito útil e que não seja apenas a repetição do título ou da mensagem original.
4. "project" deve ser o nome do projeto relacionado (se houver), senão null.
5. "amount" deve ser o valor numérico em reais se for uma despesa, senão null.
6. "category" deve ser a categoria de despesa (ex: "alimentação", "transporte", "lazer", "moradia", etc.), senão null.
7. "dueDate" deve ser a data de vencimento em formato YYYY-MM-DD se mencionada, senão null.
8. "nextAction" deve ser uma curta descrição da próxima ação física/imediata recomendada.

Responda APENAS com o objeto JSON estruturado válido, sem formatação markdown (sem \`\`\`json).

Exemplo de resposta esperada:
{
  "type": "task",
  "title": "Comprar leite",
  "description": "",
  "priority": "medium",
  "project": null,
  "amount": null,
  "category": null,
  "dueDate": null,
  "nextAction": "Ir ao mercado comprar leite"
}

Mensagem do usuário: "${message.trim()}"
`;

        const responseResult = await model.generateContent(prompt);
        const responseText = await responseResult.response.text();

        // Extrai o JSON de forma extremamente robusta
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Resposta do modelo não contém JSON válido");
        }

        const parsedData = JSON.parse(jsonMatch[0].trim());

        result = {
          type: ["task", "idea", "expense", "project_note", "daily_review", "focus_request", "unknown"].includes(parsedData.type)
            ? parsedData.type
            : "unknown",
          title: parsedData.title || message.trim(),
          description: parsedData.description || "",
          priority: ["low", "medium", "high"].includes(parsedData.priority) ? parsedData.priority : "medium",
          project: parsedData.project || null,
          amount: typeof parsedData.amount === "number" ? parsedData.amount : null,
          category: parsedData.category || null,
          dueDate: parsedData.dueDate || null,
          nextAction: parsedData.nextAction || "",
        };
      } catch (err) {
        console.warn("Falha ao usar a API do Gemini, usando mockClassify como fallback:", err);
        result = mockClassify(message.trim());
      }
    } else {
      result = mockClassify(message.trim());
    }

    const validated: CortexApiResponse = {
      type: result.type,
      title: result.title,
      description: result.description,
      priority: result.priority,
      project: result.project,
      amount: result.amount,
      category: result.category,
      dueDate: result.dueDate,
      nextAction: result.nextAction,
    };

    return NextResponse.json(validated);
  } catch (error) {
    console.error("Erro no cérebro do Aion:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a mensagem" },
      { status: 500 }
    );
  }
}
