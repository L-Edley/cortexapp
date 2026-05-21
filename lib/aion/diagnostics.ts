/**
 * AION Diagnostics — SDK for health check and tenant introspection.
 *
 * Usage:
 *   import { checkCoreHealth, getTenantStats, getTenantKnowledge } from "@/lib/aion/diagnostics";
 *
 *   const health = await checkCoreHealth();
 *   const stats  = await getTenantStats("cortex");
 *   const knowledge = await getTenantKnowledge("cortex", { query: "regras", limit: 10 });
 */

export type CoreHealth = {
  status: "ok" | "error";
  version: string;
  providers_available: string[];
  vector_store: "ok" | "unavailable";
  obsidian_vault: "ok" | "unavailable";
};

export type TenantStats = {
  app_id: string;
  memories: number;
  knowledge: number;
  decisions: number;
  initialized: boolean;
  last_activity: string | null;
};

export type KnowledgeItem = {
  id: string;
  app_id: string;
  content: string;
  tags: string[];
  confidence: number;
  expires_at: string | null;
  created_at: string;
};

export type KnowledgeResponse = {
  app_id: string;
  items: KnowledgeItem[];
  total: number;
};

let _baseUrl = typeof window !== "undefined" ? `${window.location.origin}` : "http://127.0.0.1:8000";

export function setBaseUrl(url: string): void {
  _baseUrl = url;
}

function getBaseUrl(): string {
  return _baseUrl;
}

/**
 * Obtém um token de autenticação Bearer do ambiente ou do sessionStorage.
 * A implementação pode ser substituída para buscar de onde o app armazena.
 */
function getAuthToken(): string | null {
  if (typeof sessionStorage !== "undefined") {
    return sessionStorage.getItem("aion_token") || null;
  }
  if (typeof process !== "undefined" && process.env.AION_API_TOKEN) {
    return process.env.AION_API_TOKEN;
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${getBaseUrl()}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AION diagnostics error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Verifica a saúde do AION Intelligence Core (público, sem autenticação).
 */
export async function checkCoreHealth(): Promise<CoreHealth> {
  return request<CoreHealth>("/health");
}

/**
 * Obtém estatísticas de um tenant específico (requer autenticação).
 * @param appId — ID do tenant
 */
export async function getTenantStats(appId: string): Promise<TenantStats> {
  return request<TenantStats>(`/v1/tenant/${encodeURIComponent(appId)}/stats`);
}

/**
 * Lista os knowledge items de um tenant (requer autenticação).
 * @param appId — ID do tenant
 * @param options — { query?: string; limit?: number }
 */
export async function getTenantKnowledge(
  appId: string,
  options?: { query?: string; limit?: number },
): Promise<KnowledgeResponse> {
  const params = new URLSearchParams();
  if (options?.query) params.set("query", options.query);
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  const path = `/v1/tenant/${encodeURIComponent(appId)}/knowledge${qs ? `?${qs}` : ""}`;
  return request<KnowledgeResponse>(path);
}
