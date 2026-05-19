// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getContextPolicy } from "../aionContextPolicy";
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

describe("Aion Latency Cache & Context Policy", () => {
  beforeEach(() => {
    clearAionPerformanceCache();
    vi.useFakeTimers();
  });

  it("contextPolicy retorna a configuração correta para cada intenção", () => {
    const smalltalk = getContextPolicy("smalltalk");
    expect(smalltalk.loadSemanticSearch).toBe(false);
    expect(smalltalk.loadProfile).toBe(false);
    expect(smalltalk.loadDailyInsight).toBe(false);

    const question = getContextPolicy("question");
    expect(question.loadSemanticSearch).toBe(true);
    expect(question.loadProfile).toBe(true);
    expect(question.loadDailyInsight).toBe(false);

    const analysis = getContextPolicy("analysis");
    expect(analysis.loadSemanticSearch).toBe(true);
    expect(analysis.loadProfile).toBe(true);
    expect(analysis.loadDailyInsight).toBe(true);
    expect(analysis.loadPatterns).toBe(true);
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
