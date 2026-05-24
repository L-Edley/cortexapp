import { NextResponse } from "next/server";

const CORE_URL = process.env.AION_CORE_URL || process.env.NEXT_PUBLIC_AION_CORE_URL || "http://localhost:8000";
const API_KEY = process.env.AION_CORE_API_KEY || "";

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ sqlite: "unavailable", chroma: "unavailable", obsidian: "unavailable", supabase: "disabled", memories_count: 0, knowledge_count: 0, decisions_count: 0, total_vectors: 0, last_activity: null, warnings: ["API key não configurada"] });
  }
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/cortex/control/brain`, {
      headers: { Authorization: `Bearer ${API_KEY}`, "X-Tenant-ID": "cortex", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {}
  return NextResponse.json({ sqlite: "unavailable", chroma: "unavailable", obsidian: "unavailable", supabase: "disabled", memories_count: 0, knowledge_count: 0, decisions_count: 0, total_vectors: 0, last_activity: null, warnings: ["AION Core indisponível"] });
}
