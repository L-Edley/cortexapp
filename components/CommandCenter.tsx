"use client";

import { useState, useEffect, useRef } from "react";
import { MicIcon } from "lucide-react";
import type { CortexApiResponse, CortexRecord } from "@/lib/types";
import { saveRecord } from "@/lib/storageProvider";
import { useVoice } from "@/hooks/useVoice";

const VoiceWaveform = ({ active }: { active: boolean }) => {
  if (!active) return null;
  return (
    <div className="waveform">
      {Array.from({ length: 32 }).map((_, i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            animationDelay: `${i * 0.05}s`,
            animationDuration: `${0.5 + Math.random() * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
};

export default function CommandCenter() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("SISTEMA ONLINE. AGUARDANDO COMANDOS.");

  const { state: voiceState, setState: setVoiceState, startListening, speak } = useVoice((transcript) => {
    setMessage(transcript);
    handleSend(transcript);
  });

  const handleSend = async (text?: string) => {
    const msg = (text ?? message).trim();
    if (!msg) return;

    setLoading(true);
    setVoiceState('processing');
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
              ? "archived"
              : "pending",
        createdAt: new Date().toISOString(),
      };

      await saveRecord(record);
      
      let responseText = "";
      if (data.type === "expense") {
        responseText = `Registrado. ${data.category || 'Despesa'}: R$ ${data.amount}.`;
      } else if (data.type === "task") {
        responseText = `Entendido. Tarefa '${data.title}' adicionada com prioridade ${data.priority === 'high' ? 'alta' : 'normal'}.`;
      } else {
        responseText = `Entendido. '${data.title}' registrado no banco de dados.`;
      }
      
      setAiResponse(responseText.toUpperCase());
      speak(responseText);
      
    } catch (err) {
      setAiResponse("FALHA AO PROCESSAR COMANDO. TENTE NOVAMENTE.");
      setVoiceState('idle');
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

  return (
    <div className="command-center">
      {/* Barra de título estilo terminal */}
      <div className="cmd-header">
        <span className="cmd-dot red"/>
        <span className="cmd-dot yellow"/>
        <span className="cmd-dot green"/>
        <span className="cmd-title glitch-text" data-text="AION — COMMAND INTERFACE v2.0">AION — COMMAND INTERFACE v2.0</span>
        <span className="cmd-status">● ONLINE</span>
      </div>

      {/* Área de resposta da IA — streaming */}
      <div className="cmd-response">
        <span className="cmd-prefix">AION › </span>
        <span key={aiResponse} className="cmd-text typewriter">{aiResponse}</span>
        <span className="cmd-cursor">█</span>
      </div>

      {/* Input do usuário */}
      <div className="cmd-input-row">
        <span className="cmd-prompt">USER › </span>
        <input
          className="cmd-input"
          placeholder="fale ou digite um comando..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || voiceState === 'listening'}
        />
        <button 
          className={`voice-btn ${voiceState}`} 
          onClick={startListening}
          disabled={loading}
        >
          <MicIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Waveform animado durante escuta */}
      <VoiceWaveform active={voiceState === 'listening'} />
    </div>
  );
}
