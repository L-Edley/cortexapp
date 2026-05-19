interface CacheEntry<T> {
  value: T;
  expiry: number;
}

const memoryCache: Record<string, CacheEntry<any>> = {};

export function getCacheItem<T>(key: string): T | null {
  const entry = memoryCache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    delete memoryCache[key];
    return null;
  }
  return entry.value;
}

export function setCacheItem<T>(key: string, value: T, ttlMs: number): void {
  memoryCache[key] = {
    value,
    expiry: Date.now() + ttlMs,
  };
}

export function clearAionPerformanceCache(): void {
  for (const key of Object.keys(memoryCache)) {
    delete memoryCache[key];
  }
}

export function getCachedProfileContext(): any | null {
  return getCacheItem("profileContext");
}
export function setCachedProfileContext(value: any, ttlMs = 60000): void {
  setCacheItem("profileContext", value, ttlMs);
}

export function getCachedDailyInsight(): any | null {
  return getCacheItem("dailyInsight");
}
export function setCachedDailyInsight(value: any, ttlMs = 60000): void {
  setCacheItem("dailyInsight", value, ttlMs);
}

export function getCachedRecentRecords(): any[] | null {
  return getCacheItem("recentRecords");
}
export function setCachedRecentRecords(value: any[], ttlMs = 30000): void {
  setCacheItem("recentRecords", value, ttlMs);
}

export function getCachedLatestPatterns(): any | null {
  return getCacheItem("latestPatterns");
}
export function setCachedLatestPatterns(value: any, ttlMs = 120000): void {
  setCacheItem("latestPatterns", value, ttlMs);
}
