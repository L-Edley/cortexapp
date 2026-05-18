"use client";

import { useState, useEffect } from "react";
import {
  Settings2,
  Wifi,
  WifiOff,
  HardDrive,
  Trash2,
  Info,
  Cpu,
} from "lucide-react";
import { getRecords, clearRecords } from "@/lib/storage";

export default function SettingsView() {
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [recordCount, setRecordCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setRecordCount(getRecords().length);
    checkApi();
  }, []);

  const checkApi = async () => {
    try {
      const res = await fetch("/api/cortex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "ping" }),
      });
      if (res.ok || res.status === 400) {
        setApiStatus("online");
      } else {
        setApiStatus("offline");
      }
    } catch {
      setApiStatus("offline");
    }
  };

  const handleClearData = () => {
    if (window.confirm("Tem certeza? Todos os registros locais serão perdidos.")) {
      clearRecords();
      localStorage.removeItem("cortex_interactions");
      localStorage.removeItem("cortex_has_data");
      setRecordCount(0);
    }
  };

  if (!mounted) return null;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-500 to-zinc-600 flex items-center justify-center shadow-lg shadow-zinc-500/20">
          <Settings2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Configurações</h2>
          <p className="text-sm text-zinc-500">Status e gerenciamento do sistema</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                apiStatus === "online" ? "bg-green-500/20" :
                apiStatus === "offline" ? "bg-red-500/20" :
                "bg-zinc-500/20"
              }`}>
                {apiStatus === "online" ? (
                  <Wifi className="w-4 h-4 text-green-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-400" />
                )}
              </div>
              <div>
                <p className="text-sm text-zinc-200">Status da API</p>
                <p className="text-xs text-zinc-500">
                  {apiStatus === "checking"
                    ? "Verificando..."
                    : apiStatus === "online"
                    ? "Online"
                    : "Offline"}
                </p>
              </div>
            </div>
            <button
              onClick={checkApi}
              className="text-xs text-orange-500 hover:text-orange-400 transition-colors"
            >
              Testar
            </button>
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-200">Provider</p>
              <p className="text-xs text-zinc-500">
                Mock (classificador local por palavras-chave)
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-200">Registros locais</p>
              <p className="text-xs text-zinc-500">{recordCount} registro{recordCount !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-500/20 flex items-center justify-center">
              <Info className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-200">Versão do app</p>
              <p className="text-xs text-zinc-500">1.0.0 MVP</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleClearData}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm hover:bg-red-500/20 transition-all"
        >
          <Trash2 className="w-4 h-4" />
          Limpar dados locais
        </button>
      </div>
    </div>
  );
}
