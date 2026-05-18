"use client";

import { useState } from "react";
import { MicOff, AlertTriangle } from "lucide-react";
import type { CortexApiResponse, CortexRecord } from "@/lib/types";
import { saveRecord } from "@/lib/storageProvider";
import VoiceCenter from "@/components/VoiceCenter";

export default function CommandCenter() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("SISTEMA ONLINE. AGUARDANDO COMANDOS.");

  const handleSend = async (text?: string) => {
    const msg = (text ?? message).trim();
    if (!msg) return;

    setLoading(true);
    setAiResponse("PROCESSANDO...");

    try {
      if (!text) setMessage("");
      const res = await fetch("/api/cortex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        throw new Error("ERRO DE COMUNICAÇÃO");
      }

      const data: CortexApiResponse = await res.json();

      const normalizedDescription =
        data.description &&
        data.description.trim().toLowerCase() !== data.title.trim().toLowerCase() &&
        data.description.trim().toLowerCase() !== msg.trim().toLowerCase()
          ? data.description
          : "";

      const record: CortexRecord = {
        id: crypto.randomUUID?.() ?? Date.now().toString(),
        type: data.type,
        title: data.title,
        description: normalizedDescription,
        rawInput: msg,
        priority: data.priority,
        project: data.project,
        amount: data.amount,
        category: data.category,
        dueDate: data.dueDate,
        nextAction: data.nextAction,
        status:
          data.type === "task"
            ? "pending"
            : data.type === "idea"
              ? "pending"
              : "pending",
        createdAt: new Date().toISOString(),
      };

      await saveRecord(record);

      let responseText = "";
      if (data.type === "expense") {
        responseText = `Registrado. ${data.category || "Despesa"}: R$ ${data.amount}.`;
      } else if (data.type === "task") {
        responseText = `Entendido. Tarefa '${data.title}' adicionada com prioridade ${data.priority === "high" ? "alta" : "normal"}.`;
      } else {
        responseText = `Entendido. '${data.title}' registrado no banco de dados.`;
      }

      setAiResponse(responseText.toUpperCase());

      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(responseText);
        utterance.lang = "pt-BR";
        utterance.rate = 0.95;
        const voices = window.speechSynthesis.getVoices();
        const ptVoice = voices.find((v) => v.lang.startsWith("pt"));
        if (ptVoice) utterance.voice = ptVoice;
        utterance.onend = () => {};
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      setAiResponse("FALHA AO PROCESSAR COMANDO. TENTE NOVAMENTE.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceCommand = async (transcript: string) => {
    setMessage(transcript);
    await handleSend(transcript);
  };

  return (
    <div className="command-center">
      <div className="cmd-header">
        <span className="cmd-dot red" />
        <span className="cmd-dot yellow" />
        <span className="cmd-dot green" />
        <span className="cmd-title glitch-text" data-text="AION — COMMAND INTERFACE v2.0">
          AION — COMMAND INTERFACE v2.0
        </span>
        <span className="cmd-status">● ONLINE</span>
      </div>

      <div className="cmd-response">
        <span className="cmd-prefix">AION › </span>
        <span key={aiResponse} className="cmd-text typewriter">
          {aiResponse}
        </span>
        <span className="cmd-cursor">█</span>
      </div>

      <div className="cmd-input-row">
        <span className="cmd-prompt">USER › </span>
        <input
          className="cmd-input"
          placeholder="fale ou digite um comando..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="voice-btn"
          onClick={() => handleSend()}
          disabled={loading || !message.trim()}
          title="Enviar comando"
        >
          <span className="text-xs font-mono">ENV</span>
        </button>
      </div>

      <VoiceCenter onCommandComplete={handleVoiceCommand} />
    </div>
  );
}
