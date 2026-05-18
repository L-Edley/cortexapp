"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Loader2, MicOff, AlertCircle } from "lucide-react";
import { Conversation } from "@elevenlabs/client";
import { saveRecord } from "@/lib/storageProvider";
import Blob from "./Blob";

export default function VoiceCenter() {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<"standby" | "connecting" | "connected" | "error">("standby");
  const [audioLevel, setAudioLevel] = useState(0);
  const conversationRef = useRef<Conversation | null>(null);

  // Animação de volume em tempo real (polleando a API da ElevenLabs)
  useEffect(() => {
    let animationFrameId: number;

    const updateVolume = () => {
      if (conversationRef.current && isListening) {
        // Pega os volumes da voz falada (Microfone) e da IA falada (Speaker)
        const inputVol = conversationRef.current.getInputVolume();
        const outputVol = conversationRef.current.getOutputVolume();
        
        // Combina e escala a amplitude para a animação do Blob
        const maxVol = Math.max(inputVol, outputVol);
        setAudioLevel(maxVol * 2);

        animationFrameId = requestAnimationFrame(updateVolume);
      } else {
        setAudioLevel(0);
      }
    };

    if (isListening && status === "connected") {
      updateVolume();
    } else {
      setAudioLevel(0);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isListening, status]);

  const toggleListening = async () => {
    if (isListening) {
      // Finaliza a sessão com elegância
      setStatus("standby");
      try {
        await conversationRef.current?.endSession();
      } catch (e) {
        console.error("Erro ao encerrar sessão:", e);
      }
      conversationRef.current = null;
      setIsListening(false);
    } else {
      setIsListening(true);
      setStatus("connecting");
      try {
        const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
        if (!agentId) {
          throw new Error("NEXT_PUBLIC_ELEVENLABS_AGENT_ID não configurado.");
        }

        // Inicia a sessão de Conversação Full Duplex
        const conversation = await Conversation.startSession({
          agentId: agentId,
          clientTools: {
            save_record: async (params: any) => {
              console.log("ElevenLabs Agent solicitou criar registro:", params);
              try {
                const record = {
                  id: crypto.randomUUID?.() ?? Date.now().toString(),
                  type: params.type || "unknown",
                  title: params.title || "Novo Registro Aion",
                  description: params.description || "",
                  rawInput: params.rawInput || params.title || "Comando de voz Aion",
                  priority: params.priority || "medium",
                  project: params.project || null,
                  amount: typeof params.amount === "number" ? params.amount : null,
                  category: params.category || null,
                  dueDate: params.dueDate || null,
                  nextAction: params.nextAction || "",
                  status: "pending",
                  createdAt: new Date().toISOString(),
                };

                await saveRecord(record);
                return "Sucesso! O registro foi devidamente salvo no banco de dados e adicionado ao feed.";
              } catch (err) {
                console.error("Erro ao processar save_record da ElevenLabs:", err);
                return "Erro ao salvar o registro no banco de dados.";
              }
            },
          },
          onConnect: () => {
            console.log("Aion conectado com sucesso via ElevenLabs Conversational AI.");
            setStatus("connected");
          },
          onDisconnect: () => {
            console.log("Aion desconectado.");
            setIsListening(false);
            setStatus("standby");
          },
          onMessage: (message) => {
            console.log("Aion diz:", message.message);
          },
          onError: (error) => {
            console.error("Erro ElevenLabs:", error);
            setStatus("error");
            setIsListening(false);
          },
        });

        conversationRef.current = conversation;
      } catch (err) {
        console.error("Falha ao iniciar conversação:", err);
        setStatus("error");
        setIsListening(false);
      }
    }
  };

  return (
    <>
      <Blob isListening={isListening && status === "connected"} audioLevel={audioLevel} />

      <div className="flex flex-col items-center w-full max-w-2xl mx-auto space-y-3 p-3 border border-zinc-800 bg-zinc-950/50 rounded-2xl">
        <button
          onClick={toggleListening}
          className={`p-4 rounded-full transition-all duration-300 shadow-lg ${
            isListening
              ? status === "connecting"
                ? "bg-amber-500/20 text-amber-400 animate-pulse shadow-amber-500/20"
                : "bg-cyan-500/20 text-cyan-400 animate-pulse shadow-cyan-500/20"
              : status === "error"
                ? "bg-red-500/20 text-red-500 shadow-red-500/20"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          {isListening ? (
            status === "connecting" ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            )
          ) : status === "error" ? (
            <MicOff className="w-8 h-8" />
          ) : (
            <Mic className="w-8 h-8" />
          )}
        </button>

        <div className="h-10 w-full flex items-center justify-center text-center">
          {isListening ? (
            status === "connecting" ? (
              <p className="text-xs font-mono text-amber-400 uppercase tracking-widest animate-pulse">
                Conectando ao canal de áudio do Aion...
              </p>
            ) : (
              <p className="text-xs font-mono text-cyan-400 uppercase tracking-widest animate-pulse">
                Aion está ativo • Fale livremente
              </p>
            )
          ) : status === "error" ? (
            <div className="flex items-center space-x-1.5 text-red-500">
              <AlertCircle className="w-3.5 h-3.5" />
              <p className="text-xs font-mono uppercase tracking-widest">
                Falha na Conexão • Verifique as credenciais
              </p>
            </div>
          ) : (
            <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest">
              Canal de Conversa em Standby
            </p>
          )}
        </div>
      </div>
    </>
  );
}