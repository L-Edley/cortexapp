/**
 * lib/supabase/client.ts
 * Cliente do Supabase para o frontend (Browser) com suporte a inicialização preguiçosa (lazy).
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabaseAnonKey, isSupabaseConfigured } from "./config";

let cachedBrowserClient: SupabaseClient | null = null;

/**
 * Obtém ou cria a instância do cliente Supabase para o navegador.
 * Retorna null de forma segura se a configuração do Supabase estiver ausente,
 * sem lançar exceções para não quebrar a aplicação em execução offline/local-first.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (cachedBrowserClient) {
    return cachedBrowserClient;
  }

  try {
    const url = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();

    cachedBrowserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });

    return cachedBrowserClient;
  } catch (error) {
    console.warn("Falha ao inicializar o cliente Supabase do navegador:", error);
    return null;
  }
}
