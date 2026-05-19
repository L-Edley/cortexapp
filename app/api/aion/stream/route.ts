/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { runAgent } from "@/lib/aion/agent";
import type { AionRequest } from "@/lib/aion/types";

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  let firstStatusMs = 0;
  let firstTokenMs = 0;

  const encoder = new TextEncoder();
  const customStream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: Record<string, any>) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const body: AionRequest = await req.json();

        if (
          !body.message ||
          typeof body.message !== "string" ||
          body.message.trim().length === 0
        ) {
          sendEvent("error", { error: "Mensagem inválida ou vazia" });
          controller.close();
          return;
        }

        // 1. Emit Classifying status
        sendEvent("status", { status: "classifying" });
        firstStatusMs = Date.now() - requestStart;

        // 2. Emit Building Context status after a minor pause
        await new Promise((resolve) => setTimeout(resolve, 50));
        sendEvent("status", { status: "building_context" });

        // 3. Emit Thinking status
        await new Promise((resolve) => setTimeout(resolve, 50));
        sendEvent("status", { status: "thinking" });

        // 4. Execute standard runAgent pipeline
        const result = await runAgent({
          message: body.message,
          recentRecords: body.recentRecords,
          currentView: body.currentView,
          brainContextFromClient: body.brainContextFromClient,
          profileContext: body.profileContext,
          sessionMessages: body.sessionMessages,
        });

        // 5. Stream tokens
        const replyText = result.reply || "";
        const words = replyText.split(" ");
        firstTokenMs = Date.now() - requestStart;

        for (let i = 0; i < words.length; i++) {
          const space = i === 0 ? "" : " ";
          const token = space + words[i];
          sendEvent("token", { token });
          // Emulate real typewriter pacing
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(5, 30 - words.length))
          );
        }

        // Add stream metrics
        const totalMs = Date.now() - requestStart;
        const baseLatency = (result.debug as any)?.latencyMetrics || {
          totalMs,
          classifyIntentMs: 0,
          smartRouterMs: 0,
          contextBuildMs: 0,
          semanticSearchMs: 0,
          llmMs: 0,
          storageMs: 0,
          providerUsed: "none",
          fallbackUsed: false,
          intent: "unknown",
        };

        const updatedLatencyMetrics = {
          ...baseLatency,
          firstStatusMs,
          firstTokenMs,
          streamTotalMs: totalMs,
          streamingUsed: true,
        };

        const finalResult = {
          ...result,
          debug: {
            ...(result.debug || {}),
            latencyMetrics: updatedLatencyMetrics,
          },
        };

        // 6. Emit Final response
        sendEvent("final", finalResult);
        controller.close();
      } catch (err: any) {
        console.error("[STREAM ERROR]", err);
        sendEvent("error", {
          error: err?.message || "Internal streaming error",
        });
        controller.close();
      }
    },
  });

  return new Response(customStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
