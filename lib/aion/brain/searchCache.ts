import type { SearchCacheEntry } from "./types";
import { getBrainStore, generateId } from "./brainStore";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function getCachedSearch(
  query: string
): Promise<SearchCacheEntry["results"] | null> {
  const store = getBrainStore();
  const normalized = normalizeQuery(query);
  const all = await store.searchCache.toArray();
  const cached = all.find((c) => normalizeQuery(c.query) === normalized);

  if (!cached) return null;

  const age = Date.now() - new Date(cached.cachedAt).getTime();
  if (age > DEFAULT_TTL_MS) {
    await store.searchCache.delete(cached.id);
    return null;
  }

  return cached.results;
}

export async function setCachedSearch(
  query: string,
  results: SearchCacheEntry["results"]
): Promise<void> {
  const store = getBrainStore();
  const normalized = normalizeQuery(query);
  const all = await store.searchCache.toArray();
  const existing = all.find((c) => normalizeQuery(c.query) === normalized);

  const entry: SearchCacheEntry = {
    id: existing?.id ?? generateId(),
    query: normalized,
    results,
    cachedAt: new Date().toISOString(),
  };

  await store.searchCache.put(entry);
}

export async function clearExpiredCache(): Promise<number> {
  const store = getBrainStore();
  const all = await store.searchCache.toArray();
  const now = Date.now();
  let cleared = 0;

  for (const entry of all) {
    const age = now - new Date(entry.cachedAt).getTime();
    if (age > DEFAULT_TTL_MS) {
      await store.searchCache.delete(entry.id);
      cleared++;
    }
  }

  return cleared;
}
