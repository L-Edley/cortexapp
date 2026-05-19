// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VoiceCenter from "../voice/VoiceCenter";

// Mock children components
vi.mock("../voice/StreamingText", () => ({
  default: ({ text }: { text: string }) => createElement("div", { "data-testid": "streaming-text" }, text),
}));

vi.mock("../voice/MicButton", () => ({
  default: ({ state, onTranscript }: { state: string; onTranscript?: (text: string) => void }) => {
    return createElement(
      "button",
      {
        "data-testid": "mic-btn",
        onClick: () => {
          if (onTranscript) {
            onTranscript("comando via voz");
          }
        },
      },
      state
    );
  },
}));

describe("VoiceCenter Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza no estado idle por padrão", () => {
    const onSendMessage = vi.fn(async () => {});
    render(
      createElement(VoiceCenter, {
        onSendMessage,
        aiResponse: "Sistema online. Aguardando comandos.",
        loading: false,
      })
    );

    expect(screen.getByText("AION COCKPIT v2.5")).toBeTruthy();
    expect(screen.getByText("AION — PRONTO")).toBeTruthy();
    expect(screen.getByTestId("streaming-text").textContent).toBe("Sistema online. Aguardando comandos.");
  });

  it("renderiza outros estados com base em loading/aiResponse", () => {
    const onSendMessage = vi.fn(async () => {});
    
    // Test processing
    const { rerender } = render(
      createElement(VoiceCenter, {
        onSendMessage,
        aiResponse: "Processando...",
        loading: true,
      })
    );
    expect(screen.getByText("AION — PROCESSANDO...")).toBeTruthy();

    // Test responding
    rerender(
      createElement(VoiceCenter, {
        onSendMessage,
        aiResponse: "Olá, sou o Aion.",
        loading: false,
      })
    );
    expect(screen.getByText("AION — TRANSMITINDO")).toBeTruthy();
  });

  it("envia mensagem digitada ao clicar no botão de enviar", async () => {
    const onSendMessage = vi.fn(async () => {});
    render(
      createElement(VoiceCenter, {
        onSendMessage,
        aiResponse: "Sistema online.",
        loading: false,
      })
    );

    const input = screen.getByPlaceholderText("fale ou digite um comando...");
    fireEvent.change(input, { target: { value: "minha tarefa nova" } });

    const sendBtn = screen.getByTitle("Enviar");
    fireEvent.click(sendBtn);

    expect(onSendMessage).toHaveBeenCalledWith("minha tarefa nova");
  });

  it("recebe transcrição do MicButton e dispara envio", async () => {
    const onSendMessage = vi.fn(async () => {});
    render(
      createElement(VoiceCenter, {
        onSendMessage,
        aiResponse: "Sistema online.",
        loading: false,
      })
    );

    const micBtn = screen.getByTestId("mic-btn");
    fireEvent.click(micBtn);

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith("comando via voz");
    });
  });
});
