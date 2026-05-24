import { NextResponse } from "next/server";

const CORE_URL = process.env.AION_CORE_URL || process.env.NEXT_PUBLIC_AION_CORE_URL || "http://localhost:8000";
const API_KEY = process.env.AION_CORE_API_KEY || "";

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ groq: "missing", gemini: "missing", openai: "missing", ollama: "not_configured", mock: "available", preferred_provider: "", warnings: ["API key não configurada"] });
  }
  try {
    const res = await fetch(`${CORE_URL}/v1/tenant/cortex/control/providers`, {
      headers: { Authorization: `Bearer ${API_KEY}`, "X-Tenant-ID": "cortex", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {}
  return NextResponse.json({ groq: "missing", gemini: "missing", openai: "missing", ollama: "offline", mock: "available", preferred_provider: "", warnings: ["AION Core indisponível"] });
}
