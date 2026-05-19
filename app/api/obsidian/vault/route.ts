import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.OBSIDIAN_REST_URL ?? null;
  const apiKey = process.env.OBSIDIAN_API_KEY ?? null;

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "Obsidian REST não configurado" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(baseUrl.replace(/\/+$/, ""), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Obsidian API error (${res.status})` },
        { status: res.status }
      );
    }

    const text = await res.text();
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Falha ao conectar com Obsidian: ${e instanceof Error ? e.message : "erro desconhecido"}`,
      },
      { status: 502 }
    );
  }
}
