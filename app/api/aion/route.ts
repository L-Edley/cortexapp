import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/aion/agent";
import type { AionRequest } from "@/lib/aion/types";

export async function POST(req: NextRequest) {
  try {
    const body: AionRequest = await req.json();

    console.log("[AION] ===============================");
    console.log("[AION] POST /api/aion");
    console.log("[AION] AI_PROVIDER:", process.env.AI_PROVIDER || "não definido");
    console.log("[AION] AI_MODEL:", process.env.AI_MODEL || "não definido");
    console.log(
      "[AION] OPENROUTER_API_KEY presente:",
      Boolean(process.env.OPENROUTER_API_KEY)
    );
    console.log(
      "[AION] AI_API_KEY presente:",
      Boolean(process.env.AI_API_KEY)
    );
    console.log(
      "[AION] GEMINI_API_KEY presente:",
      Boolean(process.env.GEMINI_API_KEY)
    );

    if (
      !body.message ||
      typeof body.message !== "string" ||
      body.message.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Mensagem inválida ou vazia" },
        { status: 400 }
      );
    }

    const result = await runAgent({
      message: body.message,
      recentRecords: body.recentRecords,
      currentView: body.currentView,
    });

    console.log("[AION] fallbackUsed:", result.fallbackUsed);
    console.log("[AION] debug:", JSON.stringify(result.debug));
    console.log("[AION] resposta enviada ao cliente");
    console.log("[AION] ===============================");

    return NextResponse.json(result);
  } catch (error) {
    console.error("[AION] Erro no Aion Agent:", error);
    return NextResponse.json(
      {
        reply: "Desculpe, ocorreu um erro interno. Tente novamente.",
        voiceReply: "Erro interno. Tente novamente.",
        action: "none",
        record: null,
        confidence: 0,
        fallbackUsed: true,
        debug: {
          provider: process.env.AI_PROVIDER || "n/a",
          model: process.env.AI_MODEL || "n/a",
          fallbackUsed: true,
          fallbackReason: "unknown",
        },
      },
      { status: 500 }
    );
  }
}
