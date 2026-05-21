import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAion } from "../src/react/useAion.js";
import { AionClient } from "../src/client.js";

const BASE = "http://localhost:8000";
const APP_ID = "test-app";
const API_KEY = "sk-test-token";

function mockFetch(status: number, body: unknown) {
  return vi.mocked(fetch).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as Response);
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockReset();
});

describe("useAion", () => {
  it("returns initial state", () => {
    const { result } = renderHook(() =>
      useAion({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.lastResponse).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.chat).toBe("function");
    expect(typeof result.current.isAvailable).toBe("function");
  });

  it("performs chat and updates response", async () => {
    const apiBody = {
      status: "success", tenant_id: APP_ID, reasoning_log: "",
      action_executed: null, ui_reply: "Hi from AION!",
      data: { used_cache: false, confidence: 0.9 },
    };
    mockFetch(200, apiBody);

    const { result } = renderHook(() =>
      useAion({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY }),
    );

    await act(async () => {
      const res = await result.current.chat("hello", "user-1");
      expect(res.ui_reply).toBe("Hi from AION!");
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.lastResponse?.ui_reply).toBe("Hi from AION!");
    expect(result.current.error).toBeNull();
  });

  it("captures error when chat fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() =>
      useAion({
        baseUrl: BASE, appId: APP_ID, apiKey: API_KEY, fallback: false,
      }),
    );

    await act(async () => {
      try {
        await result.current.chat("hello", "user-1");
      } catch {
        // expected
      }
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toContain("Network down");
  });

  it("isAvailable returns health status", async () => {
    mockFetch(200, { status: "ok" });

    const { result } = renderHook(() =>
      useAion({ baseUrl: BASE, appId: APP_ID, apiKey: API_KEY }),
    );

    let available = false;
    await act(async () => {
      available = await result.current.isAvailable();
    });

    expect(available).toBe(true);
  });
});
