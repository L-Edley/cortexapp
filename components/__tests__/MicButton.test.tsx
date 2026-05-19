// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MicButton from "../voice/MicButton";

interface MockedSpeechRecognitionInstance {
  start: () => void;
  stop: () => void;
}

describe("MicButton Component", () => {
  let originalSpeechRecognition: unknown;

  beforeEach(() => {
    const win = window as Record<string, unknown>;
    originalSpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    delete win.SpeechRecognition;
    delete win.webkitSpeechRecognition;
  });

  afterEach(() => {
    const win = window as Record<string, unknown>;
    if (originalSpeechRecognition) {
      win.SpeechRecognition = originalSpeechRecognition;
    }
    vi.restoreAllMocks();
  });

  it("renderiza no estado idle com ícone correto", () => {
    const { container } = render(createElement(MicButton, { state: "idle" }));
    // Idle renders standard mic icon, should have bg-white/5 style classes
    expect(container.querySelector(".bg-white\\/5")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renderiza no estado listening com ping animado", () => {
    const { container } = render(createElement(MicButton, { state: "listening" }));
    // Listening state renders waves/pings
    expect(container.querySelector(".animate-ping")).toBeTruthy();
    expect(container.querySelector(".bg-cyan-500\\/20")).toBeTruthy();
  });

  it("renderiza no estado processing com ícone animate-spin", () => {
    const { container } = render(createElement(MicButton, { state: "processing" }));
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(container.querySelector(".bg-amber-500\\/20")).toBeTruthy();
  });

  it("renderiza no estado speaking com pulso", () => {
    const { container } = render(createElement(MicButton, { state: "speaking" }));
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(container.querySelector(".bg-emerald-500\\/20")).toBeTruthy();
  });

  it("renderiza no estado error", () => {
    const { container } = render(createElement(MicButton, { state: "error" }));
    expect(container.querySelector(".bg-red-500\\/20")).toBeTruthy();
  });

  it("chama onError se SpeechRecognition não existir", () => {
    const onError = vi.fn();
    render(createElement(MicButton, { state: "idle", onError }));
    
    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(onError).toHaveBeenCalledWith("Reconhecimento de voz não disponível neste navegador.");
  });

  it("chama onStart e simula callbacks de reconhecimento", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onTranscript = vi.fn();
    const onInterimTranscript = vi.fn();
    const onError = vi.fn();

    // Mock speech recognition constructor & prototype
    const mockStart = vi.fn();
    const mockStop = vi.fn();
    
    const MockSpeechRecognition = function(this: MockedSpeechRecognitionInstance) {
      this.start = mockStart;
      this.stop = mockStop;
    } as unknown as new () => MockedSpeechRecognitionInstance;

    const win = window as Record<string, unknown>;
    win.SpeechRecognition = MockSpeechRecognition;

    const { rerender } = render(
      createElement(MicButton, {
        state: "idle",
        onStart,
        onStop,
        onTranscript,
        onInterimTranscript,
        onError,
      })
    );

    // Clicking when idle should call onStart (since window.SpeechRecognition exists)
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onStart).toHaveBeenCalled();

    // Now parent updates state to 'listening'
    rerender(
      createElement(MicButton, {
        state: "listening",
        onStart,
        onStop,
        onTranscript,
        onInterimTranscript,
        onError,
      })
    );

    // Get the instance created by useEffect
    expect(mockStart).toHaveBeenCalled();
  });
});
