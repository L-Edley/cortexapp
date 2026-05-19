import type { AionSearchCacheItem } from "./types";
import { getBrainDB, isBrainAvailable, generateId } from "./brainStore";

const DEFAULT_TTL_HOURS = 1;

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function isExpired(item: AionSearchCacheItem): boolean {
  return new Date(item.expiresAt).getTime() <= Date.now();
}

export async function getCachedSearch(
  query: string
): Promise<string | null> {
  if (!isBrainAvailable()) return null;
  const db = await getBrainDB();
  if (!db) return null;

  const normalized = normalizeQuery(query);

  try {
    const all = (await db.table("searchCache").toArray()) as AionSearchCacheItem[];
    const cached = all.find((c) => normalizeQuery(c.query) === normalized);

    if (!cached) return null;
    if (isExpired(cached)) {
      await db.table("searchCache").delete(cached.id);
      return null;
    }

    return cached.response;
  } catch {
    return null;
  }
}

export async function saveCachedSearch(
  query: string,
  response: string,
  tags?: string[],
  expiresAt?: string
): Promise<boolean> {
  if (!isBrainAvailable()) return false;
  const db = await getBrainDB();
  if (!db) return false;

  const normalized = normalizeQuery(query);

  let expiry: string;
  if (expiresAt) {
    expiry = expiresAt;
  } else {
    const d = new Date();
    d.setHours(d.getHours() + DEFAULT_TTL_HOURS);
    expiry = d.toISOString();
  }

  try {
    const all = (await db.table("searchCache").toArray()) as AionSearchCacheItem[];
    const existing = all.find((c) => normalizeQuery(c.query) === normalized);

    const entry: AionSearchCacheItem = {
      id: existing?.id ?? generateId(),
      query: normalized,
      response,
      tags: tags ?? [],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      expiresAt: expiry,
    };

    await db.table("searchCache").put(entry);
    return true;
  } catch {
    return false;
  }
}

export async function clearExpiredSearchCache(): Promise<number> {
  if (!isBrainAvailable()) return 0;
  const db = await getBrainDB();
  if (!db) return 0;

  try {
    const all = (await db.table("searchCache").toArray()) as AionSearchCacheItem[];
    let cleared = 0;

    for (const entry of all) {
      if (isExpired(entry)) {
        await db.table("searchCache").delete(entry.id);
        cleared++;
      }
    }

    return cleared;
  } catch {
    return 0;
  }
}
