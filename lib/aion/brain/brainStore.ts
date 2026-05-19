export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function isBrainAvailable(): boolean {
  return isBrowser();
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

let _db: import("dexie").default | null = null;

export async function getBrainDB(): Promise<import("dexie").default | null> {
  if (!isBrowser()) return null;
  if (_db) return _db;

  try {
    const DexieClass = (await import("dexie")).default;
    _db = new DexieClass("AionBrain");

    _db.version(1).stores({
      records: "id, type, createdAt, updatedAt, status, priority",
      memories: "id, type, source, confidence, createdAt, updatedAt, expiresAt, *tags",
      knowledge: "id, type, source, confidence, createdAt, updatedAt, expiresAt, *tags",
      searchCache: "id, query, createdAt, expiresAt",
      conversations: "id, createdAt, updatedAt",
      settings: "id",
    });

    return _db;
  } catch (err) {
    console.warn("[BRAIN] Falha ao inicializar Dexie:", err);
    return null;
  }
}
