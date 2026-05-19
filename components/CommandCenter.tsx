"use client";

import { useState, useEffect } from "react";
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
import dynamic from "next/dynamic";
import { checkAllAlerts, getUnshownAlerts, markAlertShown } from "@/lib/aionAlerts";
import { runAionScheduledJobs } from "@/lib/aionScheduler";
import { addToSession, getRecentSessionMessages } from "@/lib/sessionMemory";
import StreamingText from "@/components/voice/StreamingText";
import MicButton from "@/components/voice/MicButton";
import { speak, stopSpeaking } from "@/lib/aionVoice";
import { normalizeAionError } from "@/lib/aionError";

const VoiceCenter = dynamic(() => import("@/components/VoiceCenter"), {
  ssr: false,
});

const VoiceCenterCockpit = dynamic(() => import("@/components/voice/VoiceCenter"), {
  ssr: false,
});

const AionDiagnosticsPanel = dynamic(() => import("@/components/debug/AionDiagnosticsPanel"), {
  ssr: false,
});

export default function CommandCenter() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("Sistema online. Aguardando comandos.");
  const [sources, setSources] = useState<Array<{ title: string; url: string }>>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [tips, setTips] = useState<string[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<any | null>(null);

  const [micState, setMicState] = useState<"idle" | "listening" | "processing" | "speaking" | "error">("idle");
  const [viewMode, setViewMode] = useState<"terminal" | "cockpit">("cockpit");

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

  // Speech synthesis queue is now managed by aionVoice library

  const handleSend = async (text?: string) => {
    if (typeof window !== "undefined") {
      (window as any).__aionBusy = true;
      (window as any).__aionRequestStart = Date.now();
    }
    const msg = (text ?? message).trim();
    if (!msg) {
      if (typeof window !== "undefined") {
        (window as any).__aionBusy = false;
      }
      return;
    }

    setLoading(true);
    setMicState("processing");
    setAiResponse("Processando...");
    setSources([]);
    setSuggestion(null);
    setFollowUp(null);
    setTips([]);

    stopSpeaking();

    try {
      if (!text) setMessage("");

      try {
        addToSession("user", msg);
      } catch (err) {
        console.warn("sessionMemory failed:", err);
      }

      let sessionMessages;
      try {
        sessionMessages = getRecentSessionMessages(10);
      } catch {
        sessionMessages = undefined;
      }

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
      if (sessionMessages) {
        payload.sessionMessages = sessionMessages;
      }
      if (brainContextFromClient) {
        payload.brainContextFromClient = brainContextFromClient;
      }
      if (profileContext) {
        payload.profileContext = profileContext;
      }

      let data: any = null;
      let replyAccumulated = "";

      try {
        const response = await fetch("/api/aion/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok || !response.body) {
          throw new Error("Streaming not available");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const lines = part.split("\n");
            let event = "";
            let dataStr = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                event = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataStr = line.slice(6).trim();
              }
            }

            if (event && dataStr) {
              try {
                const parsedData = JSON.parse(dataStr);
                if (event === "status") {
                  if (parsedData.status === "classifying") {
                    setAiResponse("Classificando...");
                  } else if (parsedData.status === "building_context") {
                    setAiResponse("Buscando contexto...");
                  } else if (parsedData.status === "thinking") {
                    setAiResponse("Pensando...");
                  }
                } else if (event === "token") {
                  replyAccumulated += parsedData.token;
                  setAiResponse(replyAccumulated);
                } else if (event === "final") {
                  data = parsedData;
                } else if (event === "error") {
                  throw new Error(parsedData.error);
                }
              } catch (e) {
                console.warn("Error parsing stream chunk:", e);
              }
            }
          }
        }

        if (!data) {
          throw new Error("Final response missing in stream");
        }
      } catch (streamErr) {
        console.warn("[AION STREAM] Fallback to POST /api/aion due to:", streamErr);
        const response = await fetch("/api/aion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("ERRO DE COMUNICAÇÃO");
        }

        data = await response.json();
      }

      const { reply, voiceReply, action, record: recordData, sources: responseSources, suggestion: sug, followUpQuestion, tips: tipList, learningCandidate, debug } = data;

      if (debug?.latencyMetrics) {
        const ttsStartMs = typeof window !== "undefined"
          ? Date.now() - ((window as any).__aionRequestStart || Date.now())
          : undefined;

        setLatestMetrics({
          timestamp: new Date().toISOString(),
          intent: debug.intent || "unknown",
          providerUsed: debug.providerUsed || "none",
          fallbackUsed: debug.fallbackUsed || false,
          streamingUsed: debug.latencyMetrics.streamingUsed || false,
          totalMs: debug.latencyMetrics.totalMs || 0,
          firstStatusMs: debug.latencyMetrics.firstStatusMs,
          firstTokenMs: debug.latencyMetrics.firstTokenMs,
          streamTotalMs: debug.latencyMetrics.streamTotalMs,
          classifyIntentMs: debug.latencyMetrics.classifyIntentMs,
          contextBuildMs: debug.latencyMetrics.contextBuildMs,
          semanticSearchMs: debug.semanticSearchMs || debug.latencyMetrics.semanticSearchMs,
          llmMs: debug.latencyMetrics.llmMs,
          storageMs: debug.latencyMetrics.storageMs,
          ttsStartMs,
        });
      }

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

      try {
        addToSession("aion", displayText);
      } catch (err) {
        console.warn("sessionMemory failed:", err);
      }

      if (responseSources && responseSources.length > 0) {
        setSources(responseSources);
      }
      if (sug) setSuggestion(sug);
      if (followUpQuestion) setFollowUp(followUpQuestion);
      if (tipList && tipList.length > 0) setTips(tipList);

      if (voiceReply) {
        setMicState("speaking");
        speak(voiceReply, {
          onStart: () => {
            setMicState("speaking");
            if (typeof window !== "undefined") {
              const requestStart = (window as any).__aionRequestStart || Date.now();
              const ttsStartMs = Date.now() - requestStart;
              if (process.env.NODE_ENV === "development") {
                console.log(`[AION LATENCY AUDIT] TTS Speech started after: ${ttsStartMs}ms`);
              }
            }
          },
          onEnd: () => setMicState("idle"),
          onError: () => setMicState("idle"),
        }).catch(() => setMicState("idle"));
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
    } catch (err) {
      console.error("[AION ERROR]", err);
      const normalized = normalizeAionError(err);
      
      setLatestMetrics({
        timestamp: new Date().toISOString(),
        intent: "error",
        providerUsed: "none",
        fallbackUsed: true,
        streamingUsed: false,
        totalMs: typeof window !== "undefined"
          ? Date.now() - ((window as any).__aionRequestStart || Date.now())
          : 0,
        errorType: normalized.type,
        errorFallbackUsed: "Mostrar mensagem amigável ao usuário e restaurar cockpit.",
      });

      setAiResponse(normalized.message);
    } finally {
      setLoading(false);
      setMicState((prev) => (prev === "processing" ? "idle" : prev));
      if (typeof window !== "undefined") {
        (window as any).__aionBusy = false;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-6">
      {/* High-fidelity Visual Cockpit Mode Toggle Header */}
      <div className="flex items-center justify-end space-x-2 px-2 z-20 relative">
        <button
          onClick={() => setViewMode("cockpit")}
          className={`px-3 py-1 text-[10px] font-mono tracking-widest rounded-lg border transition-all duration-300 ${
            viewMode === "cockpit"
              ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
              : "bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300"
          }`}
          type="button"
        >
          JARVIS HUD
        </button>
        <button
          onClick={() => setViewMode("terminal")}
          className={`px-3 py-1 text-[10px] font-mono tracking-widest rounded-lg border transition-all duration-300 ${
            viewMode === "terminal"
              ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
              : "bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300"
          }`}
          type="button"
        >
          RETRO TERMINAL
        </button>
      </div>

      {viewMode === "cockpit" ? (
        <VoiceCenterCockpit
          onSendMessage={handleSend}
          aiResponse={aiResponse}
          loading={loading}
          suggestion={suggestion}
          followUp={followUp}
          tips={tips}
          sources={sources}
        />
      ) : (
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
            <span key={aiResponse} className="cmd-text">
              <StreamingText text={aiResponse} speedMs={40} highlightNumbers={true} />
            </span>
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
            <MicButton
              state={micState}
              onStart={() => {
                stopSpeaking();
                setMicState("listening");
              }}
              onStop={() => setMicState("idle")}
              onTranscript={(text) => {
                setMessage(text);
                setMicState("processing");
                handleSend(text);
              }}
              onInterimTranscript={(text) => {
                setMessage(text);
              }}
              onError={(err) => {
                console.error("Erro no microfone:", err);
                setMicState("error");
                setTimeout(() => setMicState("idle"), 3000);
              }}
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
        </div>
      )}

      <VoiceCenter />
      <AionDiagnosticsPanel latestMetrics={latestMetrics} />
    </div>
  );
}
