// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCacheItem,
  setCacheItem,
  clearAionPerformanceCache,
  getCachedProfileContext,
  setCachedProfileContext,
  getCachedDailyInsight,
  setCachedDailyInsight,
  getCachedRecentRecords,
  setCachedRecentRecords,
  getCachedLatestPatterns,
  setCachedLatestPatterns,
} from "../aionPerformance";

describe("Aion Latency Cache", () => {
  beforeEach(() => {
    clearAionPerformanceCache();
    vi.useFakeTimers();
  });

  it("cache respeita o TTL e expira conforme o tempo configurado", () => {
    setCacheItem("test-key", "some-data", 1000); // 1s TTL
    expect(getCacheItem("test-key")).toBe("some-data");

    // Avança 1.5 segundos
    vi.advanceTimersByTime(1500);

    expect(getCacheItem("test-key")).toBeNull();
  });

  it("clearAionPerformanceCache limpa todos os itens do cache", () => {
    setCacheItem("key1", "val1", 5000);
    setCacheItem("key2", "val2", 5000);

    expect(getCacheItem("key1")).toBe("val1");
    expect(getCacheItem("key2")).toBe("val2");

    clearAionPerformanceCache();

    expect(getCacheItem("key1")).toBeNull();
    expect(getCacheItem("key2")).toBeNull();
  });

  it("getters e setters específicos de performance funcionam perfeitamente", () => {
    setCachedProfileContext({ name: "Gabriel" });
    expect(getCachedProfileContext()).toEqual({ name: "Gabriel" });

    setCachedDailyInsight({ val: 42 });
    expect(getCachedDailyInsight()).toEqual({ val: 42 });

    setCachedRecentRecords([{ id: "1" }]);
    expect(getCachedRecentRecords()).toEqual([{ id: "1" }]);

    setCachedLatestPatterns({ p: "x" });
    expect(getCachedLatestPatterns()).toEqual({ p: "x" });
  });
});
