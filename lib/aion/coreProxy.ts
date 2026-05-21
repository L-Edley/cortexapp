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
