import { NextResponse } from "next/server";

const CORE_URL = process.env.AION_CORE_URL || process.env.NEXT_PUBLIC_AION_CORE_URL || "http://localhost:8000";
const API_KEY = process.env.AION_CORE_API_KEY || "";

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ active_jobs: 0, recent_jobs: [], failed_jobs: [], rebuild_jobs: 0, study_jobs: 0, desktop_study_sessions: 0, warnings: ["API key não configurada"] });
  }
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/cortex/control/jobs`, {
      headers: { Authorization: `Bearer ${API_KEY}`, "X-Tenant-ID": "cortex", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {}
  return NextResponse.json({ active_jobs: 0, recent_jobs: [], failed_jobs: [], rebuild_jobs: 0, study_jobs: 0, desktop_study_sessions: 0, warnings: ["AION Core indisponível"] });
}
