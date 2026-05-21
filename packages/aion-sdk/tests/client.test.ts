import { describe, it, expect, vi, beforeEach } from "vitest";
import { AionClient } from "../src/client.js";
import { AionUnavailableError } from "../src/errors.js";

const BASE = "http://localhost:8000";
const APP_ID = "test-app";
const API_KEY = "sk-test-token";

function mockFetch(status: number, body: unknown, ok?: boolean) {
  return vi.mocked(fetch).mockResolvedValueOnce({
    ok: ok ?? (status >= 200 && status < 300),
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(),
  } as Response);
}

function mockFetchAbort() {
  const abortError = new DOMException("The operation was aborted", "AbortError");
  return vi.mocked(fetch).mockRejectedValueOnce(abortError);
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockReset();
});

describe("AionClient", () => {
  describe("chat", () => {
    it("sends request and returns response", async () => {
      const apiBody = {
        status: "success",
        tenant_id: APP_ID,
        reasoning_log: "OK",
        action_executed: null,
        ui_reply: "Hello!",
        data: { used_cache: false, confidence: 0.95 },
      };
      mockFetch(200, apiBody);

      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      const res = await client.chat("hello", "user-1");

      expect(res.ui_reply).toBe("Hello!");
      expect(res.status).toBe("success");
      expect(fetch).toHaveBeenCalledTimes(1);

      const call = vi.mocked(fetch).mock.calls[0];
      expect(call[0]).toBe(`${BASE}/v1/core/chat`);
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers["Authorization"]).toBe(`Bearer ${API_KEY}`);
      expect(headers["X-Tenant-ID"]).toBe(APP_ID);
    });

    it("retries once on failure", async () => {
      const apiBody = {
        status: "success", tenant_id: APP_ID, reasoning_log: "",
        action_executed: null, ui_reply: "OK",
        data: { used_cache: false, confidence: 1 },
      };
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true, status: 200, statusText: "OK",
          json: async () => apiBody,
          text: async () => JSON.stringify(apiBody),
          headers: new Headers(),
        } as Response);

      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      const res = await client.chat("hi", "u1");
      expect(res.ui_reply).toBe("OK");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("returns fallback response when offline and fallback: true", async () => {
      mockFetchAbort();

      const client = new AionClient({
        baseUrl: BASE, appId: APP_ID, apiKey: API_KEY, fallback: true,
      });
      const res = await client.chat("hi", "u1");

      expect(res.status).toBe("fallback");
      expect(res.ui_reply).toBe("");
      expect(res.tenant_id).toBe(APP_ID);
    });

    it("throws AionUnavailableError when offline and fallback: false", async () => {
      mockFetchAbort();
      // Second call (retry) also fails
      mockFetchAbort();

      const client = new AionClient({
        baseUrl: BASE, appId: APP_ID, apiKey: API_KEY, fallback: false,
      });
      await expect(client.chat("hi", "u1")).rejects.toThrow(AionUnavailableError);
    });

    it("never exposes apiKey in thrown errors", async () => {
      mockFetch(401, "Unauthorized", false);

      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      try {
        await client.chat("hi", "u1");
      } catch (err) {
        const msg = String(err);
        expect(msg).not.toContain(API_KEY);
        expect(msg).not.toContain("sk-test");
      }
    });
  });

  describe("isAvailable", () => {
    it("returns true when health returns 200", async () => {
      mockFetch(200, { status: "ok" });

      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      const ok = await client.isAvailable();
      expect(ok).toBe(true);
    });

    it("returns false on network error", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));

      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      const ok = await client.isAvailable();
      expect(ok).toBe(false);
    });
  });

  describe("getTenantStats", () => {
    it("returns stats", async () => {
      const stats = {
        app_id: APP_ID, memories: 5, knowledge: 3,
        decisions: 1, initialized: true, last_activity: "2026-05-20T00:00:00",
      };
      mockFetch(200, stats);

      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      const res = await client.getTenantStats();
      expect(res.memories).toBe(5);
      expect(res.app_id).toBe(APP_ID);
    });
  });

  describe("getKnowledgeHealth", () => {
    it("returns knowledge health", async () => {
      const health = {
        tenant_id: APP_ID, total_knowledge: 10, expired_count: 0,
        low_confidence_count: 1, healthy_count: 9,
        last_reteaching: "2026-05-19T00:00:00", days_since_last_reteaching: 1.0,
      };
      mockFetch(200, health);

      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      const res = await client.getKnowledgeHealth();
      expect(res.total_knowledge).toBe(10);
      expect(res.healthy_count).toBe(9);
    });
  });

  describe("triggerReteach", () => {
    it("sends reteach request", async () => {
      mockFetch(202, { status: "accepted", app_id: APP_ID });

      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      const res = await client.triggerReteach("my app");
      expect(res.status).toBe("accepted");
    });
  });

  describe("config handling", () => {
    it("strips trailing slashes from baseUrl", () => {
      const client = new AionClient({
        baseUrl: "http://localhost:8000///", appId: APP_ID, apiKey: API_KEY,
      });
      expect((client as any).config.baseUrl).toBe("http://localhost:8000");
    });

    it("applies default timeout", () => {
      const client = new AionClient({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY });
      expect((client as any).config.timeout).toBe(10_000);
    });
  });
});
