// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, act } from "@testing-library/react";
import StreamingText from "../voice/StreamingText";

describe("StreamingText Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("não quebra com texto vazio", () => {
    const onComplete = vi.fn();
    render(createElement(StreamingText, { text: "", onComplete }));
    expect(onComplete).toHaveBeenCalled();
  });

  it("renderiza texto completo imediatamente se isActive for false", () => {
    const onComplete = vi.fn();
    render(createElement(StreamingText, { text: "Olá mundo", isActive: false, onComplete }));
    expect(screen.getByText("Olá mundo")).toBeTruthy();
    expect(onComplete).toHaveBeenCalled();
  });

  it("anima palavra por palavra com timers fake", () => {
    const onWord = vi.fn();
    const onComplete = vi.fn();
    render(
      createElement(StreamingText, {
        text: "Olá meu amigo",
        speedMs: 50,
        onWord,
        onComplete,
      })
    );

    // Advance to render the first few tokens
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onWord).toHaveBeenCalledWith("Olá");

    // Advance to complete the streaming
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText(/Olá meu amigo/)).toBeTruthy();
    expect(onComplete).toHaveBeenCalled();
  });

  it("destaca valores/números se highlightNumbers=true", () => {
    const { container } = render(
      createElement(StreamingText, {
        text: "Gasto de R$ 150,00 em 19/05/2026 com 3 itens",
        isActive: false,
        highlightNumbers: true,
      })
    );

    const emeraldSpan = container.querySelector(".text-emerald-400");
    const cyanSpan = container.querySelector(".text-cyan-400");
    const blueSpan = container.querySelector(".text-blue-400");

    expect(emeraldSpan?.textContent).toBe("R$ 150,00");
    expect(cyanSpan?.textContent).toBe("19/05/2026");
    expect(blueSpan?.textContent).toBe("3");
  });
});
