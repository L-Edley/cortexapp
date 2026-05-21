import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/aion/agent";
import { callCoreChat } from "@/lib/aion/coreProxy";
import type { AionRequest } from "@/lib/aion/types";

export async function POST(req: NextRequest) {
  try {
    const body: AionRequest = await req.json();

    console.log("[AION] ===============================");
    console.log("[AION] POST /api/aion");

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

    // Try AION Core first
    const coreResponse = await callCoreChat(body.message);
    if (coreResponse && coreResponse.status === "success" && coreResponse.ui_reply) {
      console.log("[AION] Core respondeu com sucesso");
      return NextResponse.json({
        reply: coreResponse.ui_reply,
        voiceReply: coreResponse.ui_reply,
        action: coreResponse.action_executed || "none",
        record: null,
        confidence: coreResponse.data?.confidence ?? 0.5,
        fallbackUsed: false,
        debug: {
          route: "api",
          provider: "aion-core",
          providerUsed: "aion-core",
          fallbackUsed: false,
          intent: "question",
        },
      });
    }

    console.log("[AION] Core indisponível — usando fallback local");
    const result = await runAgent({
      message: body.message,
      recentRecords: body.recentRecords,
      currentView: body.currentView,
      brainContextFromClient: body.brainContextFromClient,
      profileContext: body.profileContext,
      sessionMessages: body.sessionMessages,
      clientContext: body.clientContext,
    });

    console.log("[AION] fallbackUsed:", result.fallbackUsed);
    console.log("[AION] debug:", JSON.stringify(result.debug));
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
          route: "fallback",
          provider: "n/a",
          providerUsed: "error",
          fallbackUsed: true,
          fallbackReason: "unknown",
        },
      },
      { status: 500 }
    );
  }
}
