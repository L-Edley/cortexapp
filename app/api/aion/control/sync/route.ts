import { NextResponse } from "next/server";

const CORE_URL = process.env.AION_CORE_URL || process.env.NEXT_PUBLIC_AION_CORE_URL || "http://localhost:8000";
const API_KEY = process.env.AION_CORE_API_KEY || "";

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ pending: 0, syncing: 0, synced: 0, failed: 0, last_sync_at: null, scheduler_enabled: false, warnings: ["API key não configurada"] });
  }
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/cortex/control/sync`, {
      headers: { Authorization: `Bearer ${API_KEY}`, "X-Tenant-ID": "cortex", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {}
  return NextResponse.json({ pending: 0, syncing: 0, synced: 0, failed: 0, last_sync_at: null, scheduler_enabled: false, warnings: ["AION Core indisponível"] });
}
