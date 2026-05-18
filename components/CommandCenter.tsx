"use client";

import { useState, useRef } from "react";
import type { CortexRecord } from "@/lib/types";
import { saveRecord } from "@/lib/storageProvider";
import VoiceCenter from "@/components/VoiceCenter";

export default function CommandCenter() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("SISTEMA ONLINE. AGUARDANDO COMANDOS.");

  const speechQueue = useRef<string[]>([]);
  const currentlySpeaking = useRef<boolean>(false);

  const enqueueSpeech = (text: string) => {
    speechQueue.current.push(text);
    processSpeechQueue();
  };

  const processSpeechQueue = async () => {
    if (currentlySpeaking.current || speechQueue.current.length === 0) return;

    currentlySpeaking.current = true;
    const text = speechQueue.current.shift()!;

    try {
      const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
      if (res.status === 200) {
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          currentlySpeaking.current = false;
          processSpeechQueue();
        };

        audio.onerror = () => {
          currentlySpeaking.current = false;
          processSpeechQueue();
        };

        await audio.play();
        return;
      }
    } catch (err) {
      console.warn("ElevenLabs TTS failed, falling back to local speech synthesis:", err);
    }

    // Fallback para Web Speech API
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find((v) => v.lang.startsWith("pt"));
      if (ptVoice) utterance.voice = ptVoice;

      utterance.onend = () => {
        currentlySpeaking.current = false;
        processSpeechQueue();
      };

      utterance.onerror = () => {
        currentlySpeaking.current = false;
        processSpeechQueue();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      currentlySpeaking.current = false;
      processSpeechQueue();
    }
  };

  const handleSend = async (text?: string) => {
    const msg = (text ?? message).trim();
    if (!msg) return;

    setLoading(true);
    setAiResponse("PROCESSANDO...");

    // Limpa a fila e cancela a fala anterior
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speechQueue.current = [];
    currentlySpeaking.current = false;

    try {
      if (!text) setMessage("");
      const response = await fetch("/api/cortex/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!response.ok || !response.body) {
        throw new Error("ERRO DE COMUNICAÇÃO");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";
      let accumulatedText = "";
      let accumulatedJson = "";
      let currentSection: "idle" | "text" | "json" = "idle";
      const spokenSentences = new Set<string>();
      let sentenceAccumulator = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        streamBuffer += chunk;

        const lines = streamBuffer.split("\n\n");
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.substring(6));
            if (parsed.error) {
              throw new Error(parsed.error);
            }

            const token = parsed.token;
            if (!token) continue;

            for (let i = 0; i < token.length; i++) {
              const char = token[i];

              if (token.substring(i, i + 6) === "[TEXT]") {
                currentSection = "text";
                i += 5;
                continue;
              }
              if (token.substring(i, i + 10) === "[END_TEXT]") {
                currentSection = "idle";
                i += 9;

                if (sentenceAccumulator.trim()) {
                  const finalSentence = sentenceAccumulator.trim();
                  if (!spokenSentences.has(finalSentence)) {
                    spokenSentences.add(finalSentence);
                    enqueueSpeech(finalSentence);
                  }
                  sentenceAccumulator = "";
                }
                continue;
              }
              if (token.substring(i, i + 6) === "[JSON]") {
                currentSection = "json";
                i += 5;
                continue;
              }
              if (token.substring(i, i + 10) === "[END_JSON]") {
                currentSection = "idle";
                i += 9;
                continue;
              }

              if (currentSection === "text") {
                accumulatedText += char;
                sentenceAccumulator += char;
                setAiResponse(accumulatedText.toUpperCase());

                if ([".", "!", "?", "\n"].includes(char)) {
                  const sentence = sentenceAccumulator.trim();
                  if (sentence.length > 2 && !spokenSentences.has(sentence)) {
                    spokenSentences.add(sentence);
                    enqueueSpeech(sentence);
                    sentenceAccumulator = "";
                  }
                }
              } else if (currentSection === "json") {
                accumulatedJson += char;
              }
            }
          } catch (e) {
            console.warn("Parse error in stream line:", e);
          }
        }
      }

      if (sentenceAccumulator.trim()) {
        const finalSentence = sentenceAccumulator.trim();
        if (!spokenSentences.has(finalSentence)) {
          spokenSentences.add(finalSentence);
          enqueueSpeech(finalSentence);
        }
      }

      if (accumulatedJson.trim()) {
        try {
          const data = JSON.parse(accumulatedJson.trim());
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
            status: "pending",
            createdAt: new Date().toISOString(),
          };

          await saveRecord(record);
        } catch (err) {
          console.error("Failed to parse or save record from stream:", err);
        }
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

      <VoiceCenter />
    </div>
  );
}
