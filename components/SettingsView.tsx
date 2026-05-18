"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2,
  Wifi,
  WifiOff,
  HardDrive,
  Trash2,
  Info,
  Cpu,
  BookOpen,
  Download,
  ClipboardCopy,
  FileText,
  Database,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  LogIn,
  LogOut,
  ArrowUpDown,
} from "lucide-react";
import { getRecords, clearRecords } from "@/lib/storage";
import {
  exportAllRecordsAsMarkdown,
  exportDashboardMarkdown,
  exportDailyNoteMarkdown,
  copyVaultReadmeToClipboard,
  checkObsidianConnection,
  getObsidianConfig,
  syncLocalRecordsToObsidian,
} from "@/lib/obsidian";
import {
  getCurrentMode,
  setStorageMode,
  getStorageLabel,
  migrateLocalToFirebase,
  pullFromFirebase,
} from "@/lib/storageProvider";
import type { StorageMode } from "@/lib/storageProvider";
import {
  signInWithGoogle,
  signOut as firebaseSignOut,
  onAuthChange,
  getCurrentUser,
} from "@/lib/firebase/auth";

export default function SettingsView() {
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [recordCount, setRecordCount] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [obsidianEnabled, setObsidianEnabled] = useState(false);
  const [obsidianOnline, setObsidianOnline] = useState<boolean | null>(null);
  const [obsidianChecking, setObsidianChecking] = useState(false);
  const [obsidianUrl, setObsidianUrl] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [firebaseUser, setFirebaseUser] = useState(getCurrentUser());
  const [storageMode, setStorageModeLocal] = useState<StorageMode>(getCurrentMode());
  const [firebaseConfigured, setFirebaseConfigured] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const records = getRecords();
    setRecordCount(records.length);
    checkApi();
    setFirebaseConfigured(!!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
    const unsub = onAuthChange((user) => {
      setFirebaseUser(user);
    });
    return () => unsub();
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

  const handleExportAll = () => {
    const records = getRecords();
    if (records.length === 0) {
      alert("Nenhum registro para exportar.");
      return;
    }
    exportAllRecordsAsMarkdown(records);
  };

  const handleExportDashboard = () => {
    exportDashboardMarkdown(getRecords());
  };

  const handleExportDaily = () => {
    const today = new Date().toISOString().split("T")[0];
    exportDailyNoteMarkdown(today, getRecords());
  };

  const handleCopyVaultReadme = async () => {
    await copyVaultReadmeToClipboard();
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleTestObsidian = useCallback(async () => {
    setObsidianChecking(true);
    const config = getObsidianConfig();
    setObsidianEnabled(config.enabled);
    setObsidianUrl(config.baseUrl);
    const online = await checkObsidianConnection();
    setObsidianOnline(online);
    setObsidianChecking(false);
  }, []);

  const handleSyncToObsidian = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    const result = await syncLocalRecordsToObsidian();
    if (result.errors.length > 0 && result.errors[0].path === "config") {
      setSyncResult("Obsidian REST não está habilitado nas variáveis de ambiente.");
    } else if (result.errors.length > 0 && result.errors[0].path === "connection") {
      setSyncResult("Obsidian REST está offline. Verifique se o plugin está ativo.");
    } else {
      setSyncResult(
        `Sincronizado: ${result.successCount} de ${result.totalAttempted} registro(s).` +
          (result.failCount > 0 ? ` ${result.failCount} falha(s).` : "")
      );
    }
    setSyncing(false);
    setObsidianOnline(result.failCount === 0 && result.totalAttempted > 0);
  }, []);

  useEffect(() => {
    if (mounted) {
      handleTestObsidian();
    }
  }, [mounted, handleTestObsidian]);

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

      <div className="mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Obsidian Vault Sync</h2>
            <p className="text-sm text-zinc-500">
              Sincronização opcional com vault Obsidian via Local REST API
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  obsidianChecking ? "bg-zinc-500/20" :
                  obsidianOnline === true ? "bg-green-500/20" :
                  obsidianOnline === false ? "bg-red-500/20" :
                  "bg-zinc-500/20"
                }`}>
                  {obsidianChecking ? (
                    <RefreshCw className="w-4 h-4 text-zinc-400 animate-spin" />
                  ) : obsidianOnline === true ? (
                    <Wifi className="w-4 h-4 text-green-400" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-zinc-200">Status Obsidian REST</p>
                  <p className="text-xs text-zinc-500">
                    {obsidianChecking
                      ? "Verificando..."
                      : obsidianOnline === true
                      ? `Conectado em ${obsidianUrl}`
                      : !obsidianEnabled
                      ? "Desabilitado (configure NEXT_PUBLIC_OBSIDIAN_REST_ENABLED=true)"
                      : "Offline — plugin não está respondendo"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleTestObsidian}
                className="text-xs text-orange-500 hover:text-orange-400 transition-colors"
              >
                Testar
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <HardDrive className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-200">Storage atual</p>
                <p className="text-xs text-zinc-500">
                  {obsidianOnline === true
                    ? "localStorage + Obsidian vault"
                    : "localStorage"}
                </p>
              </div>
            </div>
          </div>

          {syncResult && (
            <div className={`rounded-xl p-3 text-sm flex items-center gap-2 ${
              syncResult.includes("falha")
                ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
                : "bg-green-500/10 border border-green-500/20 text-green-400"
            }`}>
              {syncResult.includes("falha") ? (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{syncResult}</span>
            </div>
          )}

          <button
            onClick={handleSyncToObsidian}
            disabled={syncing || obsidianOnline !== true}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all text-left disabled:opacity-40"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              {syncing ? (
                <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-zinc-200">
                {syncing
                  ? "Sincronizando..."
                  : "Sincronizar registros locais para o vault"}
              </p>
              <p className="text-xs text-zinc-500">
                Converte todos os registros do localStorage em arquivos .md no Obsidian
              </p>
            </div>
          </button>

          <a
            href="https://github.com/coddingtonbear/obsidian-local-rest-api"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-500/20 flex items-center justify-center flex-shrink-0">
              <ExternalLink className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-200">Instruções de configuração</p>
              <p className="text-xs text-zinc-500">
                Instalar e configurar o plugin Obsidian Local REST API
              </p>
            </div>
          </a>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Firebase Sync</h2>
            <p className="text-sm text-zinc-500">
              Sincronização em nuvem com Firestore + Google Auth
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  firebaseConfigured ? "bg-sky-500/20" : "bg-zinc-500/20"
                }`}>
                  <Cloud className={`w-4 h-4 ${firebaseConfigured ? "text-sky-400" : "text-zinc-500"}`} />
                </div>
                <div>
                  <p className="text-sm text-zinc-200">
                    {firebaseConfigured ? "Firebase configurado" : "Firebase não configurado"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {firebaseConfigured
                      ? "Variáveis de ambiente detectadas"
                      : "Configure NEXT_PUBLIC_FIREBASE_* no .env.local"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {firebaseConfigured && (
            <>
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      firebaseUser ? "bg-green-500/20" : "bg-zinc-500/20"
                    }`}>
                      {firebaseUser ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <LogIn className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-200">
                        {firebaseUser ? `Logado como ${firebaseUser.displayName ?? firebaseUser.email}` : "Não logado"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {firebaseUser
                          ? "Autenticado via Google — registros vão para sua conta"
                          : "Faça login para ativar a sincronização em nuvem"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={firebaseUser ? firebaseSignOut : signInWithGoogle}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      firebaseUser
                        ? "text-red-400 hover:bg-red-500/10"
                        : "text-sky-400 hover:bg-sky-500/10"
                    }`}
                  >
                    {firebaseUser ? (
                      <span className="flex items-center gap-1"><LogOut className="w-3 h-3" />Sair</span>
                    ) : (
                      <span className="flex items-center gap-1"><LogIn className="w-3 h-3" />Entrar com Google</span>
                    )}
                  </button>
                </div>
              </div>

              {firebaseUser && (
                <>
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                        <HardDrive className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-zinc-200">Modo de armazenamento</p>
                        <p className="text-xs text-zinc-500 mb-2">
                          Atual: {getStorageLabel()}
                        </p>
                        <div className="flex gap-2">
                          {(["local", "firebase", "hybrid"] as StorageMode[]).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => {
                                setStorageMode(mode);
                                setStorageModeLocal(mode);
                              }}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                                storageMode === mode
                                  ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400"
                                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                              }`}
                            >
                              {mode === "local" ? "Local" : mode === "firebase" ? "Firebase" : "Híbrido"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      setMigrating(true);
                      setMigrationResult(null);
                      const result = await migrateLocalToFirebase();
                      setMigrationResult(
                        `${result.success} migrado(s), ${result.failed} falha(s).`
                      );
                      setMigrating(false);
                    }}
                    disabled={migrating}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all text-left disabled:opacity-40"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
                      {migrating ? (
                        <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4 text-sky-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-200">
                        {migrating ? "Migrando..." : "Migrar registros locais para Firebase"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Envia todos os registros do localStorage para o Firestore
                      </p>
                    </div>
                  </button>
                  {migrationResult && (
                    <div className="rounded-xl p-3 text-sm flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>{migrationResult}</span>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      setPulling(true);
                      setPullResult(null);
                      const count = await pullFromFirebase();
                      setPullResult(`${count} registro(s) importado(s) do Firebase.`);
                      setPulling(false);
                      setRecordCount(getRecords().length);
                    }}
                    disabled={pulling}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all text-left disabled:opacity-40"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center flex-shrink-0">
                      {pulling ? (
                        <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 text-sky-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-200">
                        {pulling ? "Importando..." : "Importar registros do Firebase"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Baixa registros do Firestore para o cache local
                      </p>
                    </div>
                  </button>
                  {pullResult && (
                    <div className="rounded-xl p-3 text-sm flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>{pullResult}</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Obsidian Export</h2>
            <p className="text-sm text-zinc-500">
              Exporte registros como Markdown compatível com Obsidian
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleExportAll}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Download className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-200">Exportar todos os registros</p>
              <p className="text-xs text-zinc-500">
                Gera um arquivo .md com todos os registros formatados
              </p>
            </div>
          </button>

          <button
            onClick={handleExportDashboard}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-200">Exportar Dashboard.md</p>
              <p className="text-xs text-zinc-500">
                Gera Dashboard.md com blocos Dataview
              </p>
            </div>
          </button>

          <button
            onClick={handleExportDaily}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-200">Exportar nota diária de hoje</p>
              <p className="text-xs text-zinc-500">
                Gera Daily-{new Date().toISOString().split("T")[0]}.md
              </p>
            </div>
          </button>

          <button
            onClick={handleCopyVaultReadme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <ClipboardCopy className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-200">
                {copyFeedback ? "Copiado!" : "Copiar estrutura recomendada do vault"}
              </p>
              <p className="text-xs text-zinc-500">
                Copia README.md do vault para a área de transferência
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
