import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  envBackup.OBSIDIAN_REST_URL = process.env.OBSIDIAN_REST_URL;
  envBackup.OBSIDIAN_API_KEY = process.env.OBSIDIAN_API_KEY;
});

afterEach(() => {
  process.env.OBSIDIAN_REST_URL = envBackup.OBSIDIAN_REST_URL;
  process.env.OBSIDIAN_API_KEY = envBackup.OBSIDIAN_API_KEY;
});

describe("Obsidian proxy — segurança", () => {
  it("retorna 400 se OBSIDIAN_REST_URL não está configurada", async () => {
    delete process.env.OBSIDIAN_REST_URL;
    delete process.env.OBSIDIAN_API_KEY;

    const { GET } = await import(
      "@/app/api/obsidian/vault/[...path]/route"
    );
    const req = new NextRequest(
      new Request("http://localhost/api/obsidian/vault/test.md")
    );
    const res = await GET(req, {
      params: Promise.resolve({ path: ["test.md"] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("OBSIDIAN_REST_URL");
  });

  it("retorna 400 se OBSIDIAN_API_KEY não está configurada", async () => {
    process.env.OBSIDIAN_REST_URL = "http://127.0.0.1:27123";
    delete process.env.OBSIDIAN_API_KEY;

    const { GET } = await import(
      "@/app/api/obsidian/vault/[...path]/route"
    );
    const req = new NextRequest(
      new Request("http://localhost/api/obsidian/vault/test.md")
    );
    const res = await GET(req, {
      params: Promise.resolve({ path: ["test.md"] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("OBSIDIAN_API_KEY");
  });

  it("DELETE retorna 400 se OBSIDIAN_API_KEY não está configurada", async () => {
    process.env.OBSIDIAN_REST_URL = "http://127.0.0.1:27123";
    delete process.env.OBSIDIAN_API_KEY;

    const { DELETE } = await import(
      "@/app/api/obsidian/vault/[...path]/route"
    );
    const req = new NextRequest(
      new Request("http://localhost/api/obsidian/vault/test.md", {
        method: "DELETE",
      })
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ path: ["test.md"] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("OBSIDIAN_API_KEY");
  });
});

describe("Obsidian health — segurança", () => {
  it("retorna configured=false se OBSIDIAN_REST_URL não está configurada", async () => {
    delete process.env.OBSIDIAN_REST_URL;
    delete process.env.OBSIDIAN_API_KEY;

    const { GET } = await import("@/app/api/obsidian/health/route");
    const res = await GET();
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.online).toBe(false);
  });

  it("retorna configured=false se OBSIDIAN_API_KEY não está configurada", async () => {
    process.env.OBSIDIAN_REST_URL = "http://127.0.0.1:27123";
    delete process.env.OBSIDIAN_API_KEY;

    const { GET } = await import("@/app/api/obsidian/health/route");
    const res = await GET();
    const body = await res.json();
    expect(body.configured).toBe(false);
  });
});
