import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const restUrl = process.env.OBSIDIAN_REST_URL ?? null;
  const apiKey = process.env.OBSIDIAN_API_KEY ?? null;

  if (!restUrl || !apiKey) {
    return NextResponse.json({
      configured: false,
      online: false,
      url: restUrl ?? null,
      error: !restUrl
        ? "OBSIDIAN_REST_URL não configurada"
        : "OBSIDIAN_API_KEY não configurada",
    });
  }

  try {
    const res = await fetch(restUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return NextResponse.json({
      configured: true,
      online: res.ok,
      url: restUrl,
    });
  } catch {
    return NextResponse.json({
      configured: true,
      online: false,
      url: restUrl,
      error: "Obsidian REST API offline",
    });
  }
}
