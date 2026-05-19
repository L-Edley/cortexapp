// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

// Mock runAgent to prevent actual external calls
vi.mock("@/lib/aion/agent", () => ({
  runAgent: vi.fn().mockResolvedValue({
    reply: "Olá da simulação!",
    voiceReply: "Olá simulado.",
    action: "none",
    record: null,
    confidence: 0.9,
    fallbackUsed: false,
    debug: {
      latencyMetrics: {
        totalMs: 150,
        classifyIntentMs: 2,
        smartRouterMs: 1,
        contextBuildMs: 10,
        semanticSearchMs: 0,
        llmMs: 130,
        storageMs: 7,
        providerUsed: "mock-provider",
        fallbackUsed: false,
        intent: "smalltalk",
      },
    },
  }),
}));

describe("Aion API Stream route", () => {
  it("retorna uma resposta text/event-stream válida", async () => {
    const req = new NextRequest(
      new Request("http://localhost/api/aion/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Oi" }),
      })
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    // Read the stream contents
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let resultText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resultText += decoder.decode(value, { stream: true });
    }

    expect(resultText).toContain("event: status");
    expect(resultText).toContain("classifying");
    expect(resultText).toContain("building_context");
    expect(resultText).toContain("thinking");
    expect(resultText).toContain("event: token");
    expect(resultText).toContain("Olá");
    expect(resultText).toContain("event: final");
    expect(resultText).toContain("Olá da simulação!");
  });

  it("retorna erro para mensagem vazia", async () => {
    const req = new NextRequest(
      new Request("http://localhost/api/aion/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "" }),
      })
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let resultText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resultText += decoder.decode(value, { stream: true });
    }

    expect(resultText).toContain("event: error");
    expect(resultText).toContain("Mensagem inválida");
  });
});
