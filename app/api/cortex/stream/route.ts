import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Mensagem inválida ou vazia" }, { status: 400 });
    }

    const provider = process.env.AI_PROVIDER || "mock";
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
    const modelName = process.env.AI_MODEL || "gemini-2.5-flash";

    const encoder = new TextEncoder();

    if (provider === "gemini" && apiKey) {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      const prompt = `
Você é o Aion, a IA central do sistema Cortex.
Analise a mensagem do usuário e forneça duas partes obrigatórias na sua resposta:

1. Escreva uma resposta de confirmação falada curta, empática e direta em português do Brasil (ex: "Certo! Adicionei a tarefa de comprar leite na lista." ou "Registrado. Adicionei um gasto de 12 reais em alimentação."). Comece esta parte exatamente com o prefixo "[TEXT]" e termine com o sufixo "[END_TEXT]".
2. Extraia os dados estruturados no formato JSON correspondente. Comece esta parte exatamente com o prefixo "[JSON]" e termine com o sufixo "[END_JSON]".

Regras do JSON:
- "type" deve ser obrigatoriamente um destes: "task", "idea", "expense", "project_note", "daily_review", "focus_request", "unknown".
- "priority" deve ser: "low", "medium" ou "high".
- "description" deve ser vazia ("") a menos que haja algum detalhe extra útil que não repita o título.
- "project" deve ser o nome do projeto relacionado ou null.
- "amount" deve ser o valor numérico em reais se for despesa, senão null.
- "category" deve ser a categoria de despesa, senão null.
- "dueDate" deve ser a data YYYY-MM-DD se mencionada, senão null.
- "nextAction" deve ser a próxima ação física/imediata recomendada.

Exemplo exato de formato de resposta:
[TEXT]Certo! Adicionei a tarefa de comprar leite na sua lista com prioridade média.[END_TEXT]
[JSON]
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
[END_JSON]

Mensagem do usuário: "${message.trim()}"
`;

      const responseStream = await model.generateContentStream(prompt);

      const customReadable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of responseStream.stream) {
              const text = chunk.text();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
            }
            controller.close();
          } catch (err) {
            console.error("Stream generation error:", err);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Erro de streaming da IA" })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(customReadable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Fallback Mock Stream
    const customReadable = new ReadableStream({
      start(controller) {
        const textResponse = "[TEXT]Entendido! Comando processado localmente no modo de simulação.[END_TEXT]";
        const jsonResponse = `[JSON]
{
  "type": "unknown",
  "title": "${message.trim()}",
  "description": "",
  "priority": "medium",
  "project": null,
  "amount": null,
  "category": null,
  "dueDate": null,
  "nextAction": "Revisar comando no painel"
}
[END_JSON]`;

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: textResponse })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: jsonResponse })}\n\n`));
        controller.close();
      },
    });

    return new Response(customReadable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in Cortex Stream API:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
