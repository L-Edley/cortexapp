"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getControlOverview,
  getBrainStatus,
  getProviderStatus,
  getSyncOverview,
  getStudyOverview,
  getDevOverview,
  getJobsOverview,
} from "@/lib/aionControlClient";
import type {
  ControlOverview,
  BrainStatus as BrainStatusType,
  ProviderStatus as ProviderStatusType,
  SyncOverview as SyncOverviewType,
  StudyOverview as StudyOverviewType,
  DevOverview as DevOverviewType,
  JobsOverview as JobsOverviewType,
} from "@/lib/aionControlTypes";
import {
  Activity,
  Cpu,
  Database,
  Cloud,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Minus,
  Brain,
  Server,
  Wifi,
  WifiOff,
  BookOpen,
  Code,
  Layers,
  Clock,
  BarChart3,
} from "lucide-react";

// ── Helpers ──

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusColor(status: string): string {
  switch (status) {
    case "ok":
    case "online":
    case "configured":
    case "enabled":
    case "available":
      return "text-emerald-400";
    case "degraded":
      return "text-amber-400";
    case "offline":
    case "error":
    case "missing":
    case "disabled":
    case "unavailable":
    case "not_configured":
      return "text-red-400";
    default:
      return "text-zinc-500";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "ok":
    case "online":
    case "configured":
    case "enabled":
    case "available":
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case "degraded":
      return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case "offline":
    case "error":
    case "missing":
    case "disabled":
    case "unavailable":
    case "not_configured":
      return <XCircle className="w-4 h-4 text-red-400" />;
    default:
      return <Minus className="w-4 h-4 text-zinc-500" />;
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ok: "OK",
    degraded: "Degradado",
    error: "Erro",
    offline: "Offline",
    online: "Online",
    offline_v: "Offline",
    configured: "Configurado",
    missing: "Ausente",
    enabled: "Ativo",
    disabled: "Desativado",
    unavailable: "Indisponível",
    available: "Disponível",
    not_configured: "Não configurado",
  };
  return map[status] || status;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(status)} bg-zinc-800/80 border border-zinc-700/50`}>
      {statusIcon(status)}
      {statusLabel(status)}
    </span>
  );
}

// ── Card Wrapper ──

function Card({ title, icon: Icon, children, className = "" }: { title: string; icon: any; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-3 text-zinc-300">
        <Icon className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, valueClass = "" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`text-sm font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

// ── Loading Skeleton ──

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-800/50 rounded ${className}`} />;
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-4 w-40" /></div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Error State ──

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <XCircle className="w-12 h-12 text-red-400 mb-4" />
      <h2 className="text-lg font-semibold text-zinc-200 mb-2">AION Core Offline</h2>
      <p className="text-sm text-zinc-500 mb-6 max-w-md">{message}</p>
      <button onClick={onRetry} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors text-sm">
        <RefreshCw className="w-4 h-4" /> Tentar novamente
      </button>
    </div>
  );
}

// ── Status Card Mini ──

function MiniCard({ icon: Icon, label, value, status, warning }: { icon: any; label: string; value: string | number; status: string; warning?: string }) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 text-zinc-400">
          <Icon className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        {statusIcon(status)}
      </div>
      <div className={`text-2xl font-bold mb-1 ${statusColor(status)}`}>{value}</div>
      {warning && <p className="text-xs text-amber-400/80 truncate">{warning}</p>}
      {!warning && <p className="text-xs text-zinc-500">{statusLabel(status)}</p>}
    </div>
  );
}

// ── Main Component ──

export default function ControlCenterView() {
  const [overview, setOverview] = useState<ControlOverview | null>(null);
  const [brain, setBrain] = useState<BrainStatusType | null>(null);
  const [providers, setProviders] = useState<ProviderStatusType | null>(null);
  const [sync, setSync] = useState<SyncOverviewType | null>(null);
  const [study, setStudy] = useState<StudyOverviewType | null>(null);
  const [dev, setDev] = useState<DevOverviewType | null>(null);
  const [jobs, setJobs] = useState<JobsOverviewType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [ov, br, pr, sy, st, dv, jo] = await Promise.all([
        getControlOverview(),
        getBrainStatus(),
        getProviderStatus(),
        getSyncOverview(),
        getStudyOverview(),
        getDevOverview(),
        getJobsOverview(),
      ]);
      setOverview(ov);
      setBrain(br);
      setProviders(pr);
      setSync(sy);
      setStudy(st);
      setDev(dv);
      setJobs(jo);
      setLastUpdate(new Date().toLocaleTimeString("pt-BR"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados do Control Center");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <LoadingState />;
  if (error && !overview) return <ErrorState message={error} onRetry={fetchAll} />;

  const ov = overview;
  const overallStatus = ov?.status || "offline";
  const allWarnings = ov?.warnings || [];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-cyan-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">AION Control Center</h1>
            <StatusBadge status={overallStatus} />
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-zinc-500">
            {ov && <>
              <span>v{ov.version}</span>
              <span className="w-1 h-1 rounded-full bg-zinc-700" />
              <span>Uptime: {formatUptime(ov.uptime_seconds)}</span>
            </>}
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span>Atualizado: {lastUpdate || "—"}</span>
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-lg transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* ── System Overview Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MiniCard icon={Brain} label="Core Status" value={statusLabel(overallStatus)} status={overallStatus} warning={ov?.warnings?.[0]} />
        <MiniCard icon={Database} label="Brain Health" value={brain?.sqlite === "ok" ? "Online" : "Offline"} status={brain?.sqlite || "unavailable"} warning={brain?.warnings?.[0]} />
        <MiniCard icon={Wifi} label="Providers" value={providers?.groq === "configured" || providers?.gemini === "configured" || providers?.openai === "configured" ? "Disponíveis" : "Nenhum"} status={providers?.groq === "configured" || providers?.gemini === "configured" || providers?.openai === "configured" ? "ok" : "missing"} warning={providers?.warnings?.[0]} />
        <MiniCard icon={Cloud} label="Sync Queue" value={sync?.pending || 0} status={sync && sync.pending > 0 ? "degraded" : "ok"} warning={sync?.warnings?.[0]} />
        <MiniCard icon={BookOpen} label="Study Mode" value={study?.knowledge_saved_total || 0} status={study?.last_study_report ? "ok" : "ok"} warning={study?.warnings?.[0]} />
        <MiniCard icon={Code} label="Dev Mode" value={dev?.dev_lessons_count || 0} status={dev?.dev_lessons_count ? "ok" : "ok"} warning={dev?.warnings?.[0]} />
      </div>

      {/* ── Brain Status ── */}
      {brain && (
        <Card title="Cérebro (Brain)" icon={Database}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {[ 
              { label: "SQLite", status: brain.sqlite },
              { label: "ChromaDB", status: brain.chroma },
              { label: "Obsidian", status: brain.obsidian },
              { label: "Supabase", status: brain.supabase },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 bg-zinc-800/40 rounded-lg px-3 py-2.5">
                {statusIcon(item.status)}
                <div>
                  <div className="text-xs text-zinc-500">{item.label}</div>
                  <div className={`text-sm font-medium ${statusColor(item.status)}`}>{statusLabel(item.status)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatRow label="Memórias" value={brain.memories_count} />
            <StatRow label="Conhecimentos" value={brain.knowledge_count} />
            <StatRow label="Decisões" value={brain.decisions_count} />
            <StatRow label="Vetores" value={brain.total_vectors} />
          </div>
          <StatRow label="Última atividade" value={brain.last_activity ? new Date(brain.last_activity).toLocaleString("pt-BR") : "Nenhuma"} valueClass="text-zinc-300" />
        </Card>
      )}

      {/* ── Provider Status ── */}
      {providers && (
        <Card title="Provedores (LLM)" icon={Wifi}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {[
              { label: "Groq", status: providers.groq },
              { label: "Gemini", status: providers.gemini },
              { label: "OpenAI", status: providers.openai },
              { label: "Ollama", status: providers.ollama },
              { label: "Mock", status: providers.mock },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-1.5 bg-zinc-800/40 rounded-lg px-3 py-3 text-center">
                {item.status === "online" || item.status === "configured" ? <Wifi className="w-5 h-5 text-emerald-400" /> :
                 item.status === "available" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
                 <WifiOff className="w-5 h-5 text-red-400" />}
                <div className="text-xs text-zinc-400">{item.label}</div>
                <div className={`text-xs font-medium ${statusColor(item.status)}`}>{statusLabel(item.status)}</div>
              </div>
            ))}
          </div>
          <StatRow label="Provedor Preferido" value={providers.preferred_provider || "Automático"} valueClass="text-zinc-300" />
        </Card>
      )}

      {/* ── Sync Queue ── */}
      {sync && (
        <Card title="Fila de Sincronização" icon={Cloud}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <StatRow label="Pendentes" value={sync.pending} valueClass={sync.pending > 0 ? "text-amber-400" : "text-zinc-300"} />
            <StatRow label="Sincronizando" value={sync.syncing} />
            <StatRow label="Sincronizados" value={sync.synced} valueClass="text-emerald-400" />
            <StatRow label="Falhos" value={sync.failed} valueClass={sync.failed > 0 ? "text-red-400" : "text-zinc-300"} />
          </div>
          <StatRow label="Último sync" value={sync.last_sync_at ? new Date(sync.last_sync_at).toLocaleString("pt-BR") : "Nunca"} />
          <StatRow label="Agendador" value={sync.scheduler_enabled ? "Ativo" : "Inativo"} valueClass={sync.scheduler_enabled ? "text-emerald-400" : "text-zinc-500"} />
        </Card>
      )}

      {/* ── Study Status ── */}
      {study && (
        <Card title="Modo Estudo" icon={BookOpen}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <StatRow label="Sessões Desktop Ativas" value={study.active_desktop_sessions} />
            <StatRow label="Conhecimento Total Salvo" value={study.knowledge_saved_total} />
          </div>
          <StatRow label="Último relatório" value={study.last_study_report ? new Date(study.last_study_report.created_at as string).toLocaleString("pt-BR") : "Nenhum"} />
          <StatRow label="Último relatório Desktop" value={study.last_desktop_study_report ? new Date(study.last_desktop_study_report.created_at as string).toLocaleString("pt-BR") : "Nenhum"} />
        </Card>
      )}

      {/* ── Dev Mode Status ── */}
      {dev && (
        <Card title="Modo Desenvolvedor" icon={Code}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatRow label="Lições Técnicas" value={dev.dev_lessons_count} />
            <StatRow label="Última lição" value={dev.last_dev_lesson || "Nenhuma"} valueClass={dev.last_dev_lesson ? "text-zinc-300" : "text-zinc-500"} />
          </div>
        </Card>
      )}

      {/* ── Jobs Overview ── */}
      {jobs && (
        <Card title="Jobs Ativos" icon={Layers}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
            <StatRow label="Jobs Ativos" value={jobs.active_jobs} valueClass={jobs.active_jobs > 0 ? "text-amber-400" : "text-zinc-300"} />
            <StatRow label="Rebuild" value={jobs.rebuild_jobs} />
            <StatRow label="Study" value={jobs.study_jobs} />
            <StatRow label="Desktop Study" value={jobs.desktop_study_sessions} />
          </div>
          {jobs.recent_jobs.length > 0 && (
            <div className="mt-2">
              <h4 className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">Jobs Recentes</h4>
              <div className="space-y-1">
                {jobs.recent_jobs.slice(0, 5).map((j) => (
                  <div key={j.id} className="flex items-center gap-2 text-xs">
                    {statusIcon(j.status)}
                    <span className="text-zinc-400 truncate max-w-[200px]">{j.id}</span>
                    <span className="text-zinc-600">({j.type})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Warnings Panel ── */}
      {allWarnings.length > 0 && (
        <Card title="Alertas do Sistema" icon={AlertTriangle} className="border-amber-800/40">
          <div className="space-y-2">
            {allWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-300/80">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {allWarnings.length === 0 && (
        <Card title="Alertas do Sistema" icon={CheckCircle2}>
          <div className="flex items-center gap-2 text-sm text-emerald-400/80">
            <CheckCircle2 className="w-4 h-4" />
            Nenhum alerta crítico no momento.
          </div>
        </Card>
      )}

      {/* ── Footer Timestamp ── */}
      <div className="text-center text-xs text-zinc-600 pt-2">
        Dados atualizados em {lastUpdate || "—"} · Auto-refresh a cada 30s
      </div>
    </div>
  );
}
