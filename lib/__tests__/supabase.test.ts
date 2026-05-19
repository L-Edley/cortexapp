import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  isSupabaseConfigured,
  getSupabaseStatus,
} from "../supabase/config";
import { getSupabaseBrowserClient } from "../supabase/client";

// Guardamos variáveis originais
const originalEnv = { ...process.env };

describe("Supabase Configuration & Foundation Tests", () => {
  beforeEach(() => {
    // Limpamos o ambiente para os testes
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Resetamos módulos e cache do client para evitar persistência de instâncias entre testes
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Configuração (config.ts)", () => {
    it("deve retornar strings vazias e false se variáveis de ambiente estão ausentes", () => {
      expect(getSupabaseUrl()).toBe("");
      expect(getSupabaseAnonKey()).toBe("");
      expect(getSupabaseServiceRoleKey()).toBe("");
      expect(isSupabaseConfigured()).toBe(false);
    });

    it("deve detectar como configurado quando variáveis públicas estão presentes", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

      expect(getSupabaseUrl()).toBe("https://example.supabase.co");
      expect(getSupabaseAnonKey()).toBe("anon-key-123");
      expect(isSupabaseConfigured()).toBe(true);
    });

    it("getSupabaseStatus não deve expor valores sensíveis das chaves de API", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret-456";

      const status = getSupabaseStatus();

      expect(status.configured).toBe(true);
      expect(status.hasClientUrl).toBe(true);
      expect(status.hasAnonKey).toBe(true);
      expect(status.hasServiceRoleKey).toBe(true);

      // Verificamos que o status possui apenas booleanos, sem conter substrings sensíveis das chaves
      const values = Object.values(status);
      for (const val of values) {
        expect(typeof val).toBe("boolean");
      }
    });
  });

  describe("Browser Client (client.ts)", () => {
    it("deve retornar null graciosamente sem lançar erros se variáveis de ambiente estiverem ausentes", () => {
      const client = getSupabaseBrowserClient();
      expect(client).toBeNull();
    });

    it("deve criar e retornar o cliente Supabase se variáveis estiverem configuradas", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-123";

      const client = getSupabaseBrowserClient();
      expect(client).not.toBeNull();
      expect(client).toBeDefined();
    });
  });

  describe("Server Context Integrity (server.ts)", () => {
    it("módulo do servidor deve lançar erro quando importado no navegador", async () => {
      // Simulamos ambiente de navegador mudando global.window
      const originalWindow = global.window;
      global.window = {} as any;

      try {
        // Força recarregamento dinâmico para disparar a verificação de window
        await import("../supabase/server");
        // Se não falhar, falhamos o teste
        expect(true).toBe(false);
      } catch (error: any) {
        const isExpectedError =
          error.message.includes("Este módulo só pode ser importado em ambiente de servidor") ||
          error.message.includes("This module cannot be imported from a Client Component");
        expect(isExpectedError).toBe(true);
      } finally {
        global.window = originalWindow;
      }
    });
  });
});
