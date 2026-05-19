import { NextRequest, NextResponse } from "next/server";

function getBaseUrl(): string | null {
  return process.env.OBSIDIAN_REST_URL ?? null;
}

function getApiKey(): string | null {
  return process.env.OBSIDIAN_API_KEY ?? null;
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function proxyRequest(
  method: string,
  path: string,
  body?: string | null
): Promise<NextResponse> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return errorResponse("OBSIDIAN_REST_URL não configurada", 400);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return errorResponse("OBSIDIAN_API_KEY não configurada", 400);
  }

  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `${baseUrl}/vault/${encoded}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (method === "PUT" && body) {
    headers["Content-Type"] = "text/markdown; charset=utf-8";
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[Obsidian Proxy]", method, url);
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "PUT" ? body : undefined,
    });

    if (process.env.NODE_ENV === "development") {
      console.debug("[Obsidian Proxy] response", res.status);
    }

    if (method === "GET") {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    if (!res.ok) {
      const text = await res.text();
      return errorResponse(
        `Obsidian API error (${res.status}): ${text}`,
        res.status
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(
      `Falha ao conectar com Obsidian: ${e instanceof Error ? e.message : "erro desconhecido"}`,
      502
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  return proxyRequest("GET", path.join("/"), null);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const body = await request.text();
  return proxyRequest("PUT", path.join("/"), body);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  return proxyRequest("DELETE", path.join("/"), null);
}
