import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("generateRecordId", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "a8f31c00-0000-4000-8000-000000000000"),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("task prefix: generateRecordId('task') começa com task_AAAAMMDD_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("task");
    expect(id).toMatch(/^task_\d{8}_[a-z0-9]{6}$/);
  });

  it("expense gera prefixo fin_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("expense");
    expect(id).toMatch(/^fin_\d{8}_[a-z0-9]{6}$/);
  });

  it("idea gera prefixo idea_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("idea");
    expect(id).toMatch(/^idea_\d{8}_[a-z0-9]{6}$/);
  });

  it("daily_review gera prefixo daily_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("daily_review");
    expect(id).toMatch(/^daily_\d{8}_[a-z0-9]{6}$/);
  });

  it("project_note gera prefixo project_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("project_note");
    expect(id).toMatch(/^project_\d{8}_[a-z0-9]{6}$/);
  });

  it("unknown gera prefixo note_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("unknown");
    expect(id).toMatch(/^note_\d{8}_[a-z0-9]{6}$/);
  });

  it("memory gera prefixo note_ (usado por AionBrainItem)", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("memory");
    expect(id).toMatch(/^note_\d{8}_[a-z0-9]{6}$/);
  });

  it("sem argumento usa prefixo rec_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId();
    expect(id).toMatch(/^rec_\d{8}_[a-z0-9]{6}$/);
  });

  it("focus_request gera prefixo task_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("focus_request");
    expect(id).toMatch(/^task_\d{8}_[a-z0-9]{6}$/);
  });

  it("tipo desconhecido usa prefixo rec_", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("inexistente");
    expect(id).toMatch(/^rec_\d{8}_[a-z0-9]{6}$/);
  });

  it("ids gerados em sequência são diferentes", async () => {
    let seq = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => {
        const n = seq++;
        return `${n}000000-0000-4000-8000-000000000000`;
      }),
    });
    const { generateRecordId } = await import("@/lib/id");
    const ids = Array.from({ length: 10 }, () => generateRecordId("task"));
    const unique = new Set(ids);
    expect(unique.size).toBe(10);
  });

  it("inclui data atual no formato AAAAMMDD", async () => {
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("task");
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    expect(id).toContain(`${y}${m}${d}`);
  });

  it("fallback sem crypto gera id válido", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("crypto", undefined);
    const { generateRecordId } = await import("@/lib/id");
    const id = generateRecordId("task");
    expect(id).toMatch(/^task_\d{8}_[a-z0-9]{6}$/);
  });
});
