"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { CortexRecord } from "@/lib/types";
import { saveRecord } from "@/lib/storageProvider";
import { generateRecordId } from "@/lib/id";
import { retrieveRelevantBrainContext, prepareBrainContextForApi } from "@/lib/aion/brain/retrieval";
import type { SafeBrainItem } from "@/lib/aion/brain/retrieval";
import { learnFromInteraction } from "@/lib/aion/brain/learning";
import { saveMemory } from "@/lib/aion/brain/memory";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import type { RouteType } from "@/lib/aion/types";
import { loadProfile, analyzeAndUpdateProfile } from "@/lib/aionProfile";
import { buildEnhancedProfileContext } from "@/lib/aion/patterns";
import {
  shouldShowBriefing,
  generateBriefing,
  markBriefingShown,
} from "@/lib/dailyBriefing";
import VoiceCenter from "@/components/VoiceCenter";
import { checkAllAlerts, getUnshownAlerts, markAlertShown } from "@/lib/aionAlerts";
import { runAionScheduledJobs } from "@/lib/aionScheduler";

export default function CommandCenter() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("Sistema online. Aguardando comandos.");
  const [sources, setSources] = useState<Array<{ title: string; url: string }>>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [tips, setTips] = useState<string[]>([]);

  const speechQueue = useRef<string[]>([]);
  const currentlySpeaking = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Run scheduled jobs in background on mount
    runAionScheduledJobs().catch(() => {});

    if (typeof document === "undefined") return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        runAionScheduledJobs().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    (async () => {
      try {
        await checkAllAlerts().catch(() => {});
        if (cancelled) return;

        const unshown = getUnshownAlerts();
        const urgentAlert = unshown.find(
          (a) => a.urgency === "high" || a.urgency === "medium"
        );

        if (shouldShowBriefing()) {
          const briefing = await generateBriefing();
          if (cancelled) return;

          const parts: string[] = [briefing.greeting];

          if (briefing.summary) {
            parts.push(briefing.summary);
          }
          if (briefing.financial) {
            parts.push(briefing.financial);
          }

          if (briefing.priorities.length > 0) {
            parts.push("Prioridades: " + briefing.priorities.join(", ") + ".");
          }

          if (briefing.habits.length > 0) {
            parts.push("Hábitos: " + briefing.habits.join(", ") + ".");
          }

          if (briefing.insights.length > 0) {
            parts.push(briefing.insights.join(". ") + ".");
          }

          if (briefing.suggestion) {
            parts.push(briefing.suggestion);
          }

          if (urgentAlert) {
            parts.push(`[Alerta: ${urgentAlert.title}] ${urgentAlert.description}`);
            markAlertShown(urgentAlert.id);
          }

          if (briefing.question) {
            parts.push(briefing.question);
          }

          setAiResponse(parts.join(" "));
          if (briefing.suggestion) setSuggestion(briefing.suggestion);
          if (briefing.question) setFollowUp(briefing.question);

          markBriefingShown();
        } else if (urgentAlert) {
          setAiResponse(`[Alerta: ${urgentAlert.title}] ${urgentAlert.description}`);
          markAlertShown(urgentAlert.id);
        }
      } catch {
        /* briefing e alertas não bloqueiam o app */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enqueueSpeech = useCallback((text: string) => {
    speechQueue.current.push(text);
    processSpeechQueue();
  }, []);

  const processSpeechQueue = useCallback(async () => {
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
      } else {
        throw new Error(`TTS API returned status ${res.status}`);
      }
    } catch (err) {
      console.warn("ElevenLabs TTS failed, falling back to local speech synthesis:", err);
    }

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
  }, []);

  const handleSend = async (text?: string) => {
    const msg = (text ?? message).trim();
    if (!msg) return;

    setLoading(true);
    setAiResponse("Processando...");
    setSources([]);
    setSuggestion(null);
    setFollowUp(null);
    setTips([]);

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speechQueue.current = [];
    currentlySpeaking.current = false;

    try {
      if (!text) setMessage("");

      let brainContextFromClient: SafeBrainItem[] | undefined;
      try {
        const rawContext = await retrieveRelevantBrainContext(msg);
        brainContextFromClient = rawContext.length > 0
          ? prepareBrainContextForApi(rawContext)
          : undefined;
      } catch {
        brainContextFromClient = undefined;
      }

      let profileContext: string | undefined;
      try {
        const profile = await loadProfile();
        if (profile.version > 0 || profile.userName) {
          profileContext = buildEnhancedProfileContext(profile);
        }
      } catch {
        profileContext = undefined;
      }

      const payload: Record<string, unknown> = {
        message: msg,
        voiceMode: "assistant",
      };
      if (brainContextFromClient) {
        payload.brainContextFromClient = brainContextFromClient;
      }
      if (profileContext) {
        payload.profileContext = profileContext;
      }

      const response = await fetch("/api/aion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("ERRO DE COMUNICAÇÃO");
      }

      const data = await response.json();
      const { reply, voiceReply, action, record: recordData, sources: responseSources, suggestion: sug, followUpQuestion, tips: tipList, learningCandidate, debug } = data;

      if (process.env.NODE_ENV === "development") {
        const route = debug?.route as RouteType | undefined;
        if (route === "brain") {
          console.log("[AION] Rota: brain | Itens usados:", debug?.brainItemsCount);
        } else if (route === "api") {
          console.log("[AION] Rota: api | Provider:", debug?.providerUsed);
        } else if (route === "local") {
          console.log("[AION] Rota: local | Sem consumo de API");
        } else if (route === "fallback") {
          console.log("[AION] Rota: fallback | Motivo:", debug?.fallbackReason);
        }
      }

      const displayText = reply || "Processado.";
      setAiResponse(displayText);

      if (responseSources && responseSources.length > 0) {
        setSources(responseSources);
      }
      if (sug) setSuggestion(sug);
      if (followUpQuestion) setFollowUp(followUpQuestion);
      if (tipList && tipList.length > 0) setTips(tipList);

      if (voiceReply) {
        enqueueSpeech(voiceReply);
      }

      if (action === "save_memory") {
        const memoryContent = recordData?.title || msg;
        const memoryItem: AionBrainItem = {
          id: generateRecordId("note"),
          type: "memory",
          title: memoryContent,
          content: msg,
          tags: ["auto_saved"],
          confidence: 0.9,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "user",
          accessCount: 0,
          lastUsedAt: new Date().toISOString(),
        };
        try {
          const saved = await saveMemory(memoryItem);
          if (saved) {
            console.log("[AION] Memória salva via save_memory:", saved.id);
          }
        } catch (err) {
          console.warn("[AION] Falha ao salvar memória:", err);
        }
      }

      if (action === "create_record" && recordData) {
        const normalizedDescription =
          recordData.description &&
          recordData.description.trim().toLowerCase() !== recordData.title.trim().toLowerCase() &&
          recordData.description.trim().toLowerCase() !== msg.trim().toLowerCase()
            ? recordData.description
            : "";

        const record: CortexRecord = {
          id: generateRecordId(recordData.type),
          type: recordData.type,
          title: recordData.title,
          description: normalizedDescription,
          rawInput: msg,
          priority: recordData.priority,
          project: recordData.project,
          amount: recordData.amount,
          category: recordData.category,
          dueDate: recordData.dueDate,
          nextAction: recordData.nextAction,
          status: "pending",
          createdAt: new Date().toISOString(),
        };

        await saveRecord(record);

        try {
          await analyzeAndUpdateProfile();
        } catch {
        }
      }

      if (learningCandidate?.shouldLearn) {
        try {
          const saved = await learnFromInteraction(
            learningCandidate.message,
            learningCandidate.response,
            {
              action: learningCandidate.action,
              confidence: learningCandidate.confidence,
              providerUsed: learningCandidate.providerUsed,
            }
          );
          if (saved) {
            console.log("[AION] Aprendizado salvo no IndexedDB:", saved.id);
          }
        } catch (err) {
          console.warn("[AION] Falha ao salvar aprendizado no client:", err);
        }
      }
    } catch {
      setAiResponse("Falha ao processar comando. Tente novamente.");
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

      {suggestion && (
        <div className="cmd-suggestion">
          <span className="cmd-suggestion-icon">💡</span>
          <span className="cmd-suggestion-text">{suggestion}</span>
        </div>
      )}

      {followUp && (
        <div className="cmd-followup">
          <span className="cmd-followup-icon">❓</span>
          <span className="cmd-followup-text">{followUp}</span>
        </div>
      )}

      {tips.length > 0 && (
        <div className="cmd-tips">
          <span className="cmd-tips-title">DICAS:</span>
          {tips.map((tip, i) => (
            <span key={i} className="cmd-tip-item">
              • {tip}
            </span>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div className="cmd-sources">
          <span className="cmd-sources-title">FONTES:</span>
          {sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="cmd-source-link"
            >
              {s.title}
            </a>
          ))}
        </div>
      )}

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
