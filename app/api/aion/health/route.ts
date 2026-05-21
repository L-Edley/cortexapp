import { NextResponse } from "next/server";

const CORE_URL = process.env.AION_CORE_URL || process.env.NEXT_PUBLIC_AION_CORE_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${CORE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      return NextResponse.json({ status: "ok", source: "core" });
    }
  } catch {
    // Core unavailable
  }
  return NextResponse.json({ status: "ok", source: "local" });
}
