/**
 * lib/supabase/config.ts
 * Configurações e validações do Supabase para o ecossistema Cortex/Aion.
 */

/**
 * Retorna a URL pública do Supabase do ambiente.
 */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

/**
 * Retorna a Chave Anônima pública do Supabase do ambiente.
 */
export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

/**
 * Retorna a Chave Service Role (administrativa) privada do Supabase do ambiente.
 * Apenas acessível no backend.
 */
export function getSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/**
 * Retorna true se as variáveis necessárias para o client público do Supabase estiverem configuradas.
 */
export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  return url.trim().length > 0 && anonKey.trim().length > 0;
}

export interface SupabaseStatus {
  configured: boolean;
  hasClientUrl: boolean;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
}

/**
 * Retorna o status de configuração do Supabase de forma segura, sem expor os valores sensíveis das chaves de API.
 */
export function getSupabaseStatus(): SupabaseStatus {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return {
    configured: isSupabaseConfigured(),
    hasClientUrl: url.trim().length > 0,
    hasAnonKey: anonKey.trim().length > 0,
    hasServiceRoleKey: serviceRoleKey.trim().length > 0,
  };
}
