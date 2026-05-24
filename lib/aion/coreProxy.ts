const CORE_URL = process.env.AION_CORE_URL || process.env.NEXT_PUBLIC_AION_CORE_URL || "http://localhost:8000";
const API_KEY = process.env.AION_CORE_API_KEY || "";

export interface CoreChatResponse {
  status: string;
  tenant_id: string;
  reasoning_log: string;
  action_executed: string | null;
  ui_reply: string;
  data: {
    used_cache: boolean;
    confidence: number;
  };
}

export async function callCoreChat(
  input: string,
  userId: string = "cortex",
  appId: string = "cortex"
): Promise<CoreChatResponse | null> {
  if (!API_KEY) return null;

  try {
    const res = await fetch(`${CORE_URL}/v1/core/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": appId,
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        app_id: appId,
        user_id: userId,
        input,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn("[CORE PROXY] Core returned", res.status);
      return null;
    }

    const data: CoreChatResponse = await res.json();
    return data;
  } catch (err) {
    console.warn("[CORE PROXY] Core unavailable:", (err as Error)?.message || err);
    return null;
  }
}

export async function checkCoreHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${CORE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Profile API proxies
// ---------------------------------------------------------------------------
export interface CoreProfileResponse {
  profile: Record<string, unknown>;
  formatted: string;
}

export async function getProfile(appId: string = "cortex"): Promise<CoreProfileResponse | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/profile`, {
      headers: { "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function updateProfile(
  patch: { userName?: string; currentGoal?: string },
  appId: string = "cortex"
): Promise<CoreProfileResponse | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/profile/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ ...patch, app_id: appId }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function analyzeProfile(appId: string = "cortex"): Promise<CoreProfileResponse | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/profile/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ app_id: appId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Alerts API proxies
// ---------------------------------------------------------------------------
export interface CoreAlertItem {
  id: string;
  type: string;
  title: string;
  description: string;
  urgency: string;
  suggestedAction?: string;
  createdAt: string;
  shown: boolean;
  sourceId?: string;
}

export interface CoreAlertsResponse {
  alerts: CoreAlertItem[];
  total: number;
}

export async function getAlerts(
  unshownOnly: boolean = false,
  appId: string = "cortex"
): Promise<CoreAlertsResponse | null> {
  if (!API_KEY) return null;
  try {
    const params = unshownOnly ? "?unshown_only=true" : "";
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/alerts${params}`, {
      headers: { "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function checkAlerts(appId: string = "cortex"): Promise<{ status: string; new_alerts: CoreAlertItem[]; count: number } | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/alerts/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ app_id: appId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function dismissAlert(alertId: string, appId: string = "cortex"): Promise<boolean> {
  if (!API_KEY) return false;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/alerts/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ alert_id: alertId, app_id: appId }),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearOldAlerts(days: number = 30, appId: string = "cortex"): Promise<number | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/alerts/clear-old?days=${days}`, {
      method: "POST",
      headers: { "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.removed as number;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Research Topics API proxies
// ---------------------------------------------------------------------------
export interface CoreResearchTopic {
  id: string;
  title: string;
  query: string;
  category: string;
  priority: string;
  enabled: boolean;
  frequency: string;
  lastCheckedAt?: string;
  tags: string[];
}

export interface CoreResearchTopicsResponse {
  topics: CoreResearchTopic[];
  total: number;
}

export async function listResearchTopics(
  enabledOnly: boolean = false,
  appId: string = "cortex"
): Promise<CoreResearchTopicsResponse | null> {
  if (!API_KEY) return null;
  try {
    const params = enabledOnly ? "?enabled_only=true" : "";
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/research/topics${params}`, {
      headers: { "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveResearchTopic(
  topic: Partial<CoreResearchTopic>,
  appId: string = "cortex"
): Promise<CoreResearchTopic | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/research/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ ...topic, app_id: appId }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.topic as CoreResearchTopic;
  } catch {
    return null;
  }
}

export async function updateResearchTopicCore(
  topicId: string,
  patch: Partial<CoreResearchTopic>,
  appId: string = "cortex"
): Promise<CoreResearchTopic | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/research/topics/${topicId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ ...patch, app_id: appId }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.topic as CoreResearchTopic;
  } catch {
    return null;
  }
}

export async function deleteResearchTopic(
  topicId: string,
  appId: string = "cortex"
): Promise<boolean> {
  if (!API_KEY) return false;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/research/topics/${topicId}`, {
      method: "DELETE",
      headers: { "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function shouldCheckTopicCore(
  topicId: string,
  appId: string = "cortex"
): Promise<boolean> {
  if (!API_KEY) return false;
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/${appId}/research/topics/${topicId}/should-check`, {
      headers: { "X-Tenant-ID": appId, Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.should_check === true;
  } catch {
    return false;
  }
}
