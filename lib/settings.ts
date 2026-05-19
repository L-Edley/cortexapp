export const SETTINGS_KEYS = {
  STORAGE_MODE: "cortex_storage_mode",
  LAST_PATTERN_ANALYSIS: "aion_last_pattern_analysis",
  LATEST_DAILY_INSIGHT: "aion_latest_daily_insight",
  PROFILE: "aion_profile",
  PROFILE_MIGRATED: "aion_profile_migrated",
  SYNC_RECORDS: "aion_sync_records",
  RECORDS: "cortex_records",
} as const;

export const MIGRATION_FLAG = "aion_profile_migrated";

export function getLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

export function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
  }
}
