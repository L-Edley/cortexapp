// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import AionDiagnosticsPanel from "../debug/AionDiagnosticsPanel";

describe("AionDiagnosticsPanel", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("não renderiza por padrão em produção se localStorage aion_debug estiver ausente", () => {
    const { container } = render(createElement(AionDiagnosticsPanel, { latestMetrics: null }));
    expect(container.firstChild).toBeNull();
  });

  it("renderiza em modo development", () => {
    process.env.NODE_ENV = "development";
    render(createElement(AionDiagnosticsPanel, { latestMetrics: null }));
    expect(screen.getByText(/Aion telemetry & diagnostics/i)).toBeTruthy();
  });

  it("renderiza se localStorage aion_debug for true", () => {
    localStorage.setItem("aion_debug", "true");
    render(createElement(AionDiagnosticsPanel, { latestMetrics: null }));
    expect(screen.getByText(/Aion telemetry & diagnostics/i)).toBeTruthy();
  });

  it("renderiza métricas principais e não exibe dados confidenciais", async () => {
    process.env.NODE_ENV = "development";
    const sampleMetrics = {
      timestamp: new Date().toISOString(),
      intent: "smalltalk",
      providerUsed: "mock-provider",
      fallbackUsed: false,
      streamingUsed: true,
      totalMs: 450,
      firstStatusMs: 5,
      firstTokenMs: 80,
      streamTotalMs: 440,
      classifyIntentMs: 11,
      contextBuildMs: 22,
      semanticSearchMs: 0,
      llmMs: 33,
      storageMs: 44,
      ttsStartMs: 55,
    };

    render(createElement(AionDiagnosticsPanel, { latestMetrics: sampleMetrics }));

    // Click to expand panel
    const expandBtn = screen.getByText(/Expandir/i);
    fireEvent.click(expandBtn);

    // Confirm metrics render
    expect(screen.getByText(/smalltalk/i)).toBeTruthy();
    expect(screen.getByText(/mock-provider/i)).toBeTruthy();
    expect(screen.getAllByText(/SIM/i)).toBeTruthy(); // for streaming
    expect(screen.getByText(/450ms/i)).toBeTruthy();

    // Confirm intermediate steps render
    expect(screen.getByText(/11ms/i)).toBeTruthy(); // classify
    expect(screen.getByText(/22ms/i)).toBeTruthy(); // context
    expect(screen.getByText(/33ms/i)).toBeTruthy(); // llm
    expect(screen.getByText(/55ms/i)).toBeTruthy(); // tts latency

    // Confirm sensitive fields do not exist
    expect(screen.queryByText(/senha/i)).toBeNull();
    expect(screen.queryByText(/key/i)).toBeNull();
    expect(screen.queryByText(/message/i)).toBeNull();
    expect(screen.queryByText(/prompt/i)).toBeNull();
  });

  it("histórico limita aos últimos 5 ciclos e permite limpar", () => {
    process.env.NODE_ENV = "development";
    const { rerender } = render(createElement(AionDiagnosticsPanel, { latestMetrics: null }));

    const expandBtn = screen.getByText(/Expandir/i);
    fireEvent.click(expandBtn);

    // Send 6 distinct cycles
    for (let i = 1; i <= 6; i++) {
      const metrics = {
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        intent: `intent-${i}`,
        providerUsed: "mock-provider",
        fallbackUsed: false,
        streamingUsed: true,
        totalMs: 100 * i,
      };
      rerender(createElement(AionDiagnosticsPanel, { latestMetrics: metrics }));
    }

    // Capped at 5 cycles in display
    expect(screen.queryByText(/intent-1/i)).toBeNull(); // oldest should be truncated
    expect(screen.getByText(/intent-2/i)).toBeTruthy();
    expect(screen.getByText(/intent-6/i)).toBeTruthy();

    // Clear history
    const clearBtn = screen.getByTitle(/Limpar Histórico/i);
    fireEvent.click(clearBtn);

    expect(screen.getByText(/Nenhum ciclo de telemetria registrado/i)).toBeTruthy();
  });
});
