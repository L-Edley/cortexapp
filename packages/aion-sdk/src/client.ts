import type { AionConfig, AionResponse, TenantStats, KnowledgeHealth } from "./types.js";
import { AionUnavailableError } from "./errors.js";

export class AionClient {
  private config: Required<AionConfig>;

  constructor(config: AionConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      appId: config.appId,
      apiKey: config.apiKey,
      timeout: config.timeout ?? 10_000,
      fallback: config.fallback ?? false,
    };
  }

  async chat(input: string, userId: string, context?: object): Promise<AionResponse> {
    try {
      return await this._fetchWithRetry(async () => {
        const url = `${this.config.baseUrl}/v1/core/chat`;
        const body = {
          app_id: this.config.appId,
          user_id: userId,
          input,
          context: context ?? null,
        };

        const res = await this._request(url, {
          method: "POST",
          body: JSON.stringify(body),
        });

        return res as AionResponse;
      });
    } catch (err) {
      if (this.config.fallback) {
        return {
          status: "fallback",
          tenant_id: this.config.appId,
          reasoning_log: err instanceof Error ? err.message : "unavailable",
          action_executed: null,
          ui_reply: "",
          data: { used_cache: false, confidence: 0 },
          used_cache: false,
          confidence: 0,
        };
      }
      throw err instanceof Error
        ? new AionUnavailableError(err.message)
        : new AionUnavailableError();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this._rawRequest(
        `${this.config.baseUrl}/health`,
        { method: "GET" },
        this.config.timeout,
      );
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getTenantStats(): Promise<TenantStats> {
    return this._fetchWithRetry(async () => {
      const url = `${this.config.baseUrl}/v1/tenant/${this.config.appId}/stats`;
      const res = await this._request(url, { method: "GET" });
      return res as TenantStats;
    });
  }

  async getKnowledgeHealth(): Promise<KnowledgeHealth> {
    return this._fetchWithRetry(async () => {
      const url = `${this.config.baseUrl}/v1/tenant/${this.config.appId}/knowledge-health`;
      const res = await this._request(url, { method: "GET" });
      return res as KnowledgeHealth;
    });
  }

  async triggerReteach(description?: string): Promise<{ status: string; app_id: string }> {
    return this._fetchWithRetry(async () => {
      const url = `${this.config.baseUrl}/v1/tenant/${this.config.appId}/reteach`;
      const res = await this._request(url, {
        method: "POST",
        body: JSON.stringify({ description: description ?? "" }),
      });
      return res as { status: string; app_id: string };
    });
  }

  private async _fetchWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } catch (err) {
      if (Date.now() - start > this.config.timeout) {
        throw err;
      }
      await this._sleep(500);
      return fn();
    }
  }

  private async _request(url: string, init: RequestInit): Promise<unknown> {
    const res = await this._rawRequest(url, init, this.config.timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = `AION API error ${res.status}: ${body || res.statusText}`;
      throw new AionUnavailableError(msg);
    }

    return res.json();
  }

  private async _rawRequest(
    url: string,
    init: RequestInit,
    timeout: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Tenant-ID": this.config.appId,
      Authorization: `Bearer ${this.config.apiKey}`,
      ...(init.headers as Record<string, string> | undefined),
    };

    try {
      return await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
