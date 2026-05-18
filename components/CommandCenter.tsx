"use client";

import { useState, useEffect } from "react";
import { MicIcon, MicOff, Ear, AlertTriangle } from "lucide-react";
import type { CortexApiResponse, CortexRecord } from "@/lib/types";
import { saveRecord } from "@/lib/storageProvider";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useVoice } from "@/hooks/useVoice";

export default function CommandCenter() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("SISTEMA ONLINE. AGUARDANDO COMANDOS.");

  const {
    isListening,
    transcript,
    error: speechError,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  const { speak } = useVoice();

  useEffect(() => {
    if (transcript) {
      setMessage(transcript);
    }
  }, [transcript]);

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

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      setMessage("");
      resetTranscript();
      startListening();
    }
  };

  return (
    <div className="command-center">
      <div className="cmd-header">
        <span className="cmd-dot red"/>
        <span className="cmd-dot yellow"/>
        <span className="cmd-dot green"/>
        <span className="cmd-title glitch-text" data-text="AION — COMMAND INTERFACE v2.0">AION — COMMAND INTERFACE v2.0</span>
        <span className="cmd-status">● ONLINE</span>
      </div>

      <div className="cmd-response">
        <span className="cmd-prefix">AION › </span>
        <span key={aiResponse} className="cmd-text typewriter">{aiResponse}</span>
        <span className="cmd-cursor">█</span>
      </div>

      <div className="cmd-input-row">
        <span className="cmd-prompt">USER › </span>
        <input
          className="cmd-input"
          placeholder={isListening ? "Aion está ouvindo..." : "fale ou digite um comando..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || isListening}
        />
        {!isSupported ? (
          <div className="voice-btn voice-unsupported" title="Voz não suportada neste navegador">
            <MicOff className="w-5 h-5" />
          </div>
        ) : (
          <button
            className={`voice-btn ${isListening ? "voice-active" : ""}`}
            onClick={handleMicClick}
            disabled={loading}
            title={isListening ? "Parar escuta" : "Iniciar escuta de voz"}
          >
            {isListening ? (
              <>
                <Ear className="w-5 h-5 voice-pulse" />
                <span className="voice-ring" />
              </>
            ) : (
              <MicIcon className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {isListening && (
        <div className="voice-status">
          <span className="voice-status-dot" />
          <span>Aion está ouvindo...</span>
          <button className="voice-cancel" onClick={stopListening}>cancelar</button>
        </div>
      )}

      {!isSupported && (
        <div className="voice-error">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Seu navegador não suporta reconhecimento de voz.</span>
        </div>
      )}

      {speechError && !isListening && (
        <div className="voice-error">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{speechError}</span>
        </div>
      )}
    </div>
  );
}
