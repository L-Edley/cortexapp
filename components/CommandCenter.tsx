"use client";

import { useState, useEffect } from "react";
import type { CortexRecord } from "@/lib/types";
import { saveRecord } from "@/lib/storageProvider";
import { generateRecordId } from "@/lib/id";
import {
  retrieveRelevantBrainContext,
  prepareBrainContextForApi,
} from "@/lib/aion/brain/retrieval";
import type { SafeBrainItem } from "@/lib/aion/brain/retrieval";
import { prepareClientAionContext } from "@/lib/aion/clientContext";
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
import {
  checkAllAlerts,
  getUnshownAlerts,
  markAlertShown,
} from "@/lib/aionAlerts";
import { runAionScheduledJobs } from "@/lib/aionScheduler";
import { addToSession, getRecentSessionMessages } from "@/lib/sessionMemory";
import StreamingText from "@/components/voice/StreamingText";
import MicButton from "@/components/voice/MicButton";
import { speak, stopSpeaking } from "@/lib/aionVoice";
import { normalizeAionError, getFallbackAction } from "@/lib/aionError";
import VoiceCenter from "@/components/VoiceCenter";


const VoiceCenterCockpit = dynamic(
  () => import("@/components/voice/VoiceCenter"),
  {
    ssr: false,
  },
);

const AionDiagnosticsPanel = dynamic(
  () => import("@/components/debug/AionDiagnosticsPanel"),
  { ssr: false },
);

export default function CommandCenter() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(
    "Sistema online. Aguardando comandos.",
  );
  const [sources, setSources] = useState<Array<{ title: string; url: string }>>(
    [],
  );
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [tips, setTips] = useState<string[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<any | null>(null);
  const [coreSource, setCoreSource] = useState<"core" | "local">("local");

  const [micState, setMicState] = useState<
    "idle" | "listening" | "processing" | "speaking" | "error"
  >("idle");
  const [viewMode, setViewMode] = useState<"terminal" | "cockpit">("terminal");

  const isDebugEnabled = () => {
    if (typeof window === "undefined")
      return process.env.NODE_ENV === "development";
    const localFlag = window.localStorage.getItem("aion_debug") === "true";
    return process.env.NODE_ENV === "development" || localFlag;
  };

  const debugWarn = (...args: unknown[]) => {
    if (!isDebugEnabled()) return;
    const sanitizedArgs = args.map((arg) => {
      if (process.env.NODE_ENV === "production") {
        if (arg instanceof Error) {
          return arg.message;
        }
        if (typeof arg === "string") {
          return arg.replace(/(key|token|password|prompt|body|bearer|secret)[^\s,]+/gi, "$1***");
        }
      }
      return arg;
    });
    // eslint-disable-next-line no-console
    console.warn(...sanitizedArgs);
  };

  const debugError = (...args: unknown[]) => {
    if (!isDebugEnabled()) return;
    const sanitizedArgs = args.map((arg) => {
      if (process.env.NODE_ENV === "production") {
        if (arg instanceof Error) {
          return arg.message;
        }
        if (typeof arg === "string") {
          return arg.replace(/(key|token|password|prompt|body|bearer|secret)[^\s,]+/gi, "$1***");
        }
      }
      return arg;
    });
    // eslint-disable-next-line no-console
    console.error(...sanitizedArgs);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

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
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;

    const check = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/aion/health");
        const data = await res.json();
        if (!cancelled) setCoreSource(data.source as "core" | "local");
      } catch {
        if (!cancelled) setCoreSource("local");
      }
    };

    check();
    timer = setInterval(check, 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
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
          (a) => a.urgency === "high" || a.urgency === "medium",
        );

        if (shouldShowBriefing()) {
          const briefing = await generateBriefing();
          if (cancelled) return;

          const parts: string[] = [briefing.greeting];

          if (briefing.summary) parts.push(briefing.summary);
          if (briefing.financial) parts.push(briefing.financial);

          if (briefing.priorities.length > 0) {
            parts.push("Prioridades: " + briefing.priorities.join(", ") + ".");
          }
          if (briefing.habits.length > 0) {
            parts.push("Hábitos: " + briefing.habits.join(", ") + ".");
          }
          if (briefing.insights.length > 0) {
            parts.push(briefing.insights.join(". ") + ".");
          }
          if (briefing.suggestion) parts.push(briefing.suggestion);

          if (urgentAlert) {
            parts.push(
              `[Alerta: ${urgentAlert.title}] ${urgentAlert.description}`,
            );
            markAlertShown(urgentAlert.id);
          }

          if (briefing.question) parts.push(briefing.question);

          setAiResponse(parts.join(" "));
          if (briefing.suggestion) setSuggestion(briefing.suggestion);
          if (briefing.question) setFollowUp(briefing.question);

          markBriefingShown();
        } else if (urgentAlert) {
          setAiResponse(
            `[Alerta: ${urgentAlert.title}] ${urgentAlert.description}`,
          );
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
        debugWarn("sessionMemory failed (user):", err);
        setLatestMetrics((prev: any) => ({
          ...(prev || {}),
          errorType: "storage_failed",
          errorFallbackUsed: getFallbackAction("storage_failed"),
          fallbackUsed: true,
        }));
      }

      let sessionMessages: any;
      try {
        sessionMessages = getRecentSessionMessages(10);
      } catch {
        sessionMessages = undefined;
      }

      let brainContextFromClient: SafeBrainItem[] | undefined;
      try {
        const rawContext = await retrieveRelevantBrainContext(msg);
        brainContextFromClient =
          rawContext.length > 0
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

      let clientContext: any = undefined;
      try {
        clientContext = await prepareClientAionContext(msg);
      } catch (err) {
        // ignore
      }

      const payload: Record<string, unknown> = {
        message: msg,
        voiceMode: "assistant",
      };
      if (sessionMessages) payload.sessionMessages = sessionMessages;
      if (brainContextFromClient)
        payload.brainContextFromClient = brainContextFromClient;
      if (profileContext) payload.profileContext = profileContext;
      if (clientContext) payload.clientContext = clientContext;

      let data: any = null;
      let replyAccumulated = "";
      let streamErrorObj: any = null;

      // 1) Try streaming
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
                debugWarn("Error parsing stream chunk:", e);
              }
            }
          }
        }

        if (!data) {
          throw new Error("Final response missing in stream");
        }
      } catch (streamErr) {
        // 2) Streaming failed -> fallback to /api/aion
        const normalizedStreamErr = normalizeAionError(streamErr);
        streamErrorObj = {
          errorType: normalizedStreamErr.type,
          errorFallbackUsed: getFallbackAction(normalizedStreamErr.type),
          fallbackUsed: true,
          streamingAttempted: true,
          streamingUsed: false,
        };
        debugWarn(
          "[AION STREAM] Fallback to POST /api/aion due to:",
          normalizedStreamErr.originalMessage ?? normalizedStreamErr.message,
        );

        const response = await fetch("/api/aion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`API fallback failed: ${response.statusText}`);
        }

        data = await response.json();

        // stream falhou mas fallback funcionou: registrar no diagnostics
        setLatestMetrics({
          timestamp: new Date().toISOString(),
          intent: normalizedStreamErr.type,
          providerUsed: "none",
          fallbackUsed: true,
          streamingAttempted: true,
          streamingUsed: false,
          totalMs:
            typeof window !== "undefined"
              ? Date.now() - ((window as any).__aionRequestStart || Date.now())
              : 0,
          errorType: normalizedStreamErr.type,
          errorFallbackUsed: getFallbackAction(normalizedStreamErr.type),
        });
      }

      const {
        reply,
        voiceReply,
        action,
        record: recordData,
        sources: responseSources,
        suggestion: sug,
        followUpQuestion,
        tips: tipList,
        learningCandidate,
        learningData,
        debug,
      } = data;

      if (debug?.latencyMetrics) {
        const ttsStartMs =
          typeof window !== "undefined"
            ? Date.now() -
              (((window as any).__aionRequestStart as number) || Date.now())
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
          semanticSearchMs:
            debug.semanticSearchMs || debug.latencyMetrics.semanticSearchMs,
          llmMs: debug.latencyMetrics.llmMs,
          storageMs: debug.latencyMetrics.storageMs,
          ttsStartMs,
          ...(streamErrorObj || {}), // Merge error keys if stream fallback happened
        });
      }

      if (process.env.NODE_ENV === "development") {
        const route = debug?.route as RouteType | undefined;
        if (route === "brain") {
          // eslint-disable-next-line no-console
          console.log(
            "[AION] Rota: brain | Itens usados:",
            debug?.brainItemsCount,
          );
        } else if (route === "api") {
          // eslint-disable-next-line no-console
          console.log("[AION] Rota: api | Provider:", debug?.providerUsed);
        } else if (route === "local") {
          // eslint-disable-next-line no-console
          console.log("[AION] Rota: local | Sem consumo de API");
        } else if (route === "fallback") {
          // eslint-disable-next-line no-console
          console.log("[AION] Rota: fallback | Motivo:", debug?.fallbackReason);
        }
      }

      const displayText = reply || "Processado.";
      setAiResponse(displayText);

      try {
        addToSession("aion", displayText);
      } catch (err) {
        debugWarn("sessionMemory failed (aion):", err);
        setLatestMetrics((prev: any) => ({
          ...(prev || {}),
          errorType: "storage_failed",
          errorFallbackUsed: getFallbackAction("storage_failed"),
          fallbackUsed: true,
        }));
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
              const requestStart =
                (window as any).__aionRequestStart || Date.now();
              const ttsStartMs = Date.now() - requestStart;
              if (process.env.NODE_ENV === "development") {
                // eslint-disable-next-line no-console
                console.log(
                  `[AION LATENCY AUDIT] TTS Speech started after: ${ttsStartMs}ms`,
                );
              }
            }
          },
          onEnd: () => setMicState("idle"),
          onError: (ttsErr?: any) => {
            debugWarn("TTS failed in onError:", ttsErr);
            setMicState("idle");
            setLatestMetrics((prev: any) => ({
              ...(prev || {}),
              errorType: "tts_failed",
              errorFallbackUsed: getFallbackAction("tts_failed"),
              fallbackUsed: true,
            }));
          },
        }).catch((ttsErr) => {
          debugWarn("TTS failed in catch:", ttsErr);
          setMicState("idle");
          setLatestMetrics((prev: any) => ({
            ...(prev || {}),
            errorType: "tts_failed",
            errorFallbackUsed: getFallbackAction("tts_failed"),
            fallbackUsed: true,
          }));
        });
      }

      if (action === "save_memory") {
        const memoryContent = recordData?.title || msg;
        const memoryItem: AionBrainItem = {
          id: generateRecordId("note"),
          type: "procedure",
          title: memoryContent,
          content: msg,
          tags: ["auto_saved"],
          confidence: 0.9,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "user",
          lastUsedAt: new Date().toISOString(),
        };

        try {
          const saved = await saveMemory(memoryItem);
          if (saved && isDebugEnabled()) {
            // eslint-disable-next-line no-console
            console.log("[AION] Memória salva via save_memory:", saved.id);
          }
        } catch (err) {
          debugWarn("Falha ao salvar memória (save_memory):", err);
          setLatestMetrics((prev: any) => ({
            ...(prev || {}),
            errorType: "storage_failed",
            errorFallbackUsed: getFallbackAction("storage_failed"),
            fallbackUsed: true,
          }));
        }
      }

      if (action === "save_learning" && learningData) {
        import("@/lib/aionLearningEngine.client")
          .then((m) =>
            m.learnFromProviderResponse(
              learningData.input,
              learningData.reply,
              learningData.type
            )
          )
          .catch((err) => debugWarn("Falha ao salvar learning", err));
      }

      if (action === "create_record" && recordData) {
        const normalizedDescription =
          recordData.description &&
          recordData.description.trim().toLowerCase() !==
            recordData.title.trim().toLowerCase() &&
          recordData.description.trim().toLowerCase() !==
            msg.trim().toLowerCase()
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

        try {
          await saveRecord(record);
        } catch (err) {
          debugWarn("saveRecord failed (storage_failed):", err);
          setLatestMetrics((prev: any) => ({
            ...(prev || {}),
            errorType: "storage_failed",
            errorFallbackUsed: getFallbackAction("storage_failed"),
            fallbackUsed: true,
          }));
        }

        try {
          await analyzeAndUpdateProfile();
        } catch {
          /* não quebra fluxo */
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
            },
          );
          if (saved && isDebugEnabled()) {
            // eslint-disable-next-line no-console
            console.log("[AION] Aprendizado salvo no IndexedDB:", saved.id);
          }
        } catch (err) {
          debugWarn("Falha ao salvar aprendizado no client:", err);
        }
      }
    } catch (err) {
      const normalized = normalizeAionError(err);
      debugError(
        "[AION ERROR]:",
        normalized.originalMessage ?? normalized.message,
      );

      setLatestMetrics({
        timestamp: new Date().toISOString(),
        intent: "error",
        providerUsed: "none",
        fallbackUsed: true,
        streamingUsed: false,
        totalMs:
          typeof window !== "undefined"
            ? Date.now() - ((window as any).__aionRequestStart || Date.now())
            : 0,
        errorType: normalized.type,
        errorFallbackUsed: getFallbackAction(normalized.type),
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
          coreSource={coreSource}
        />
      ) : (
        <div className="command-center">
          <div className="cmd-header">
            <span className="cmd-dot red" />
            <span className="cmd-dot yellow" />
            <span className="cmd-dot green" />
            <span
              className="cmd-title glitch-text"
              data-text="AION — COMMAND INTERFACE v2.0"
            >
              AION — COMMAND INTERFACE v2.0
            </span>
            <span className="cmd-status">● ONLINE</span>
          </div>

          <div className="cmd-response">
            <span className="cmd-prefix">AION › </span>
            <span key={aiResponse} className="cmd-text">
              <StreamingText
                text={aiResponse}
                speedMs={40}
                highlightNumbers={true}
              />
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
                debugError("Erro no microfone:", err);
                setMicState("error");
                setAiResponse("O microfone não está disponível. Você pode digitar normalmente.");
                setLatestMetrics((prev: any) => ({
                  ...(prev || {}),
                  errorType: "speech_recognition_failed",
                  errorFallbackUsed: getFallbackAction("speech_recognition_failed"),
                  fallbackUsed: true,
                }));
                setTimeout(() => setMicState("idle"), 3000);
              }}
              disabled={loading}
            />
            <button
              className="voice-btn"
              data-testid="terminal-send"
              onClick={() => handleSend()}
              disabled={loading || !message.trim()}
              title="Enviar comando"
              type="button"
            >
              <span className="text-xs font-mono">ENV</span>
            </button>
          </div>
        </div>
      )}

      <VoiceCenter
        {...({
          onSendMessage: handleSend,
          aiResponse,
          loading,
          suggestion,
          followUp,
          tips,
          sources,
        } as any)}
      />
      <AionDiagnosticsPanel latestMetrics={latestMetrics} />
    </div>
  );
}
