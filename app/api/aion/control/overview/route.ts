import { NextResponse } from "next/server";

const CORE_URL = process.env.AION_CORE_URL || process.env.NEXT_PUBLIC_AION_CORE_URL || "http://localhost:8000";
const API_KEY = process.env.AION_CORE_API_KEY || "";

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ status: "offline", error: "AION Core API key not configured", warnings: [] });
  }
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/cortex/control/overview`, {
      headers: { Authorization: `Bearer ${API_KEY}`, "X-Tenant-ID": "cortex", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {}
  return NextResponse.json({ status: "offline", error: "AION Core indisponível", warnings: ["Não foi possível conectar ao AION Core."] });
}
