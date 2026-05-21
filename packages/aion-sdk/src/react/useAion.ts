"use client";

import { useState, useCallback, useRef } from "react";
import { AionClient } from "../client.js";
import type { AionConfig, AionResponse } from "../types.js";

export interface UseAionResult {
  chat: (input: string, userId?: string, context?: object) => Promise<AionResponse>;
  isAvailable: () => Promise<boolean>;
  isLoading: boolean;
  lastResponse: AionResponse | null;
  error: Error | null;
}

export function useAion(config: AionConfig): UseAionResult {
  const clientRef = useRef<AionClient | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<AionResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new AionClient(config);
    }
    return clientRef.current;
  }, [config.baseUrl, config.appId, config.apiKey, config.timeout, config.fallback]);

  const chat = useCallback(
    async (input: string, userId = "default", context?: object): Promise<AionResponse> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getClient().chat(input, userId, context);
        setLastResponse(res);
        return res;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [getClient],
  );

  const isAvailable = useCallback(async (): Promise<boolean> => {
    try {
      return await getClient().isAvailable();
    } catch {
      return false;
    }
  }, [getClient]);

  return { chat, isAvailable, isLoading, lastResponse, error };
}
