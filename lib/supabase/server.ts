/**
 * lib/supabase/server.ts
 * Cliente do Supabase para o backend (Node/API routes) com suporte a inicialização preguiçosa (lazy)
 * e privilégios administrativos (bypassa RLS usando a Service Role Key).
 */
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "./config";

// Garantia adicional de execução exclusivamente do lado do servidor
if (typeof window !== "undefined") {
  throw new Error("Este módulo só pode ser importado em ambiente de servidor (server-only).");
}

let cachedAdminClient: SupabaseClient | null = null;

/**
 * Obtém ou cria a instância única do cliente administrativo Supabase para o backend.
 * Retorna null se a URL ou a Service Role Key estiverem ausentes no servidor.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return null;
  }

  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  try {
    cachedAdminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    return cachedAdminClient;
  } catch (error) {
    console.error("Falha ao inicializar o cliente administrativo Supabase no servidor:", error);
    return null;
  }
}
