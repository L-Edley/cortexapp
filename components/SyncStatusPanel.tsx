"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  Database,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { getRecords } from "@/lib/storage";
import { LocalStorageAionAdapter, syncObsidianToAion } from "@/lib/aion/sync";
import { checkObsidianConnection, getObsidianConfig } from "@/lib/obsidian/client";

type ObsidianStatus = "checking" | "configured" | "online" | "offline" | "not_configured";

type Stats = {
  cortexRecords: number;
  aionRecords: number;
  pending: number;
  synced: number;
  failed: number;
  lastSyncAt: string | null;
  obsidianStatus: ObsidianStatus;
  obsidianUrl: string;
};

function computeStats(
  adapter: LocalStorageAionAdapter,
  aionRecords: number,
  obsidianStatus: ObsidianStatus,
  obsidianUrl: string
): Stats {
  const cortexRecords = getRecords().length;
  return {
    cortexRecords,
    aionRecords,
    pending: 0,
    synced: 0,
    failed: 0,
    lastSyncAt: null,
    obsidianStatus,
    obsidianUrl,
  };
}

async function computeDetailedStats(adapter: LocalStorageAionAdapter): Promise<Partial<Stats>> {
  try {
    const all = await adapter.getAll();
    return {
      aionRecords: all.length,
      pending: all.filter((r) => r.sync_status === "pending").length,
      synced: all.filter((r) => r.sync_status === "synced").length,
      failed: all.filter((r) => r.sync_status === "failed").length,
      lastSyncAt: all.length > 0
        ? all
            .map((r) => r.last_synced_at)
            .filter(Boolean)
            .sort()
            .reverse()[0] ?? null
        : null,
    };
  } catch {
    return {};
  }
}

export default function SyncStatusPanel() {
  const adapterRef = useRef(new LocalStorageAionAdapter());
  const adapter = adapterRef.current;
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setSyncResult(null);

    const config = getObsidianConfig();
    let obsidianStatus: ObsidianStatus = "not_configured";
    if (!config.enabled) {
      obsidianStatus = "not_configured";
    } else {
      obsidianStatus = "configured";
      try {
        const online = await checkObsidianConnection();
        obsidianStatus = online ? "online" : "offline";
      } catch {
        obsidianStatus = "offline";
      }
    }

    const base = computeStats(adapter, 0, obsidianStatus, config.baseUrl);
    const detailed = await computeDetailedStats(adapter);
    setStats({ ...base, ...detailed });
    setLoading(false);
  }, [adapter]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncObsidianToAion(adapter);
      setSyncing(false);
      await refresh();
      if (result.total > 0 || result.failed > 0) {
        setSyncResult(
          `Sincronizado: ${result.synced} de ${result.total} nota(s).` +
            (result.failed > 0 ? ` ${result.failed} falha(s).` : "")
        );
      }
    } catch (e) {
      setSyncing(false);
      setSyncResult(
        `Erro: ${e instanceof Error ? e.message : "falha na sincronização"}`
      );
    }
  }, [adapter, refresh]);

  const handleClearAion = useCallback(async () => {
    if (!window.confirm("Limpar banco local do Aion? Os registros principais do Cortex não serão afetados.")) return;
    await adapter.clearAll?.();
    setSyncResult("Banco local do Aion limpo.");
    await refresh();
  }, [adapter, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!stats) return null;

  const statusIcon = () => {
    switch (stats.obsidianStatus) {
      case "online":
        return <Wifi className="w-4 h-4 text-green-400" />;
      case "configured":
      case "checking":
        return <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />;
      case "offline":
        return <WifiOff className="w-4 h-4 text-red-400" />;
      default:
        return <WifiOff className="w-4 h-4 text-zinc-500" />;
    }
  };

  const statusLabel = () => {
    switch (stats.obsidianStatus) {
      case "online":
        return "Online";
      case "configured":
        return "Verificando...";
      case "offline":
        return "Offline";
      default:
        return "Não configurado";
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <RefreshCw className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Sync Aion</h3>
          <p className="text-xs text-zinc-500">
            Sincronização com Obsidian e processamento Aion
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Registros Cortex</p>
          <p className="text-lg font-semibold text-zinc-100">
            {stats.cortexRecords}
          </p>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Registros Aion</p>
          <p className="text-lg font-semibold text-zinc-100">
            {stats.aionRecords}
          </p>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Pendentes</p>
          <p className="text-lg font-semibold text-yellow-400">
            {stats.pending}
          </p>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Sincronizados</p>
          <p className="text-lg font-semibold text-green-400">
            {stats.synced}
          </p>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Com falha</p>
          <p className="text-lg font-semibold text-red-400">
            {stats.failed}
          </p>
        </div>
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <p className="text-xs text-zinc-500 mb-1">Último sync</p>
          <p className="text-sm font-semibold text-zinc-100 truncate">
            {stats.lastSyncAt
              ? new Date(stats.lastSyncAt).toLocaleString("pt-BR")
              : "—"}
          </p>
        </div>
      </div>

      {/* Obsidian connection status */}
      <div className="bg-zinc-900/60 rounded-xl p-3 flex items-center gap-3">
        {statusIcon()}
        <div>
          <p className="text-sm text-zinc-200">
            Obsidian: <span className="font-medium">{statusLabel()}</span>
          </p>
          {stats.obsidianStatus !== "not_configured" && (
            <p className="text-xs text-zinc-500 truncate max-w-[250px]">
              {stats.obsidianUrl}
            </p>
          )}
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div
          className={`rounded-xl p-3 text-sm flex items-center gap-2 ${
            syncResult.includes("Erro") || syncResult.includes("falha")
              ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
              : "bg-green-500/10 border border-green-500/20 text-green-400"
          }`}
        >
          {syncResult.includes("Erro") || syncResult.includes("falha") ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{syncResult}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleSync}
          disabled={syncing || loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all text-sm text-zinc-100 disabled:opacity-40"
        >
          {syncing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {syncing ? "Sincronizando..." : "Sincronizar agora"}
        </button>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-all text-sm text-zinc-300 disabled:opacity-40"
        >
          <Database className="w-4 h-4" />
          Atualizar status
        </button>
        <button
          onClick={handleClearAion}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all text-sm text-zinc-300"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
          Limpar Aion
        </button>
      </div>
    </div>
  );
}
