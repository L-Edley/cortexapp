// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import GlobeCanvas from "../voice/GlobeCanvas";

describe("GlobeCanvas Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    
    // Mock HTMLCanvasElement context to avoid JSDOM errors
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      scale: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fillRect: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
    });
  });

  it("renderiza no estado idle com reducedMotion desligado por padrão", () => {
    render(createElement(GlobeCanvas, { state: "idle" }));
    
    const wrapper = screen.getByTestId("globe-canvas-wrapper");
    expect(wrapper).toBeTruthy();
    expect(wrapper.getAttribute("data-state")).toBe("idle");
    expect(wrapper.getAttribute("data-reduced-motion")).toBe("false");
  });

  it("renderiza corretamente em outros estados de voz (listening/processing/responding/speaking/error)", () => {
    const states: Array<"idle" | "listening" | "processing" | "responding" | "speaking" | "error"> = [
      "listening",
      "processing",
      "responding",
      "speaking",
      "error",
    ];

    states.forEach((stateVal) => {
      const { container } = render(createElement(GlobeCanvas, { state: stateVal }));
      const wrapper = container.querySelector('[data-testid="globe-canvas-wrapper"]');
      expect(wrapper).toBeTruthy();
      expect(wrapper?.getAttribute("data-state")).toBe(stateVal);
    });
  });

  it("respeita a propriedade reducedMotion e a expõe no elemento wrapper", () => {
    render(createElement(GlobeCanvas, { state: "idle", reducedMotion: true }));
    
    const wrapper = screen.getByTestId("globe-canvas-wrapper");
    expect(wrapper.getAttribute("data-reduced-motion")).toBe("true");
  });
});
