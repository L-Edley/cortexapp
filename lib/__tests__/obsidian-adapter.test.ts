import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CortexRecord } from "@/lib/types";

function makeRecord(overrides: Partial<CortexRecord> = {}): CortexRecord {
  return {
    id: "rec-123",
    type: "task",
    title: "Pagar internet",
    description: "Pagar a conta de internet amanhã",
    priority: "medium",
    project: null,
    amount: null,
    category: "contas",
    dueDate: "2026-05-20",
    nextAction: "Pagar internet",
    status: "pending",
    createdAt: "2026-05-18T12:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure functions (no network)
// ---------------------------------------------------------------------------

describe("buildFrontmatter", () => {
  it("gera frontmatter com campos obrigatórios", async () => {
    const { buildFrontmatter } = await import("@/lib/obsidian-adapter");
    const fm = buildFrontmatter({
      id: "x-1",
      type: "tarefa",
      title: "Teste",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(fm).toContain("id: x-1");
    expect(fm).toContain("type: tarefa");
    expect(fm).toContain("title: Teste");
    expect(fm).toContain('createdAt: "2026-01-01T00:00:00.000Z"');
    expect(fm.startsWith("---\n")).toBe(true);
    expect(fm.endsWith("---\n")).toBe(true);
  });

  it("pula campos undefined/null", async () => {
    const { buildFrontmatter } = await import("@/lib/obsidian-adapter");
    const fm = buildFrontmatter({
      id: "x-1",
      type: "tarefa",
      title: "Teste",
      createdAt: "2026-01-01T00:00:00.000Z",
      status: undefined,
      category: null,
    });
    expect(fm).not.toContain("status:");
    expect(fm).not.toContain("category:");
  });

  it("serializa arrays como [\"a\", \"b\"]", async () => {
    const { buildFrontmatter } = await import("@/lib/obsidian-adapter");
    const fm = buildFrontmatter({
      id: "x-1",
      type: "tarefa",
      title: "Teste",
      createdAt: "2026-01-01T00:00:00.000Z",
      tags: ["tarefa", "contas"],
    });
    expect(fm).toContain('tags: ["tarefa", "contas"]');
  });
});

describe("parseFrontmatter", () => {
  it("parseia frontmatter válido", async () => {
    const { parseFrontmatter } = await import("@/lib/obsidian-adapter");
    const md = `---
id: "x-1"
type: tarefa
title: Teste
createdAt: "2026-01-01T00:00:00.000Z"
tags: ["tag1", "tag2"]
---

# Conteúdo
`;
    const result = parseFrontmatter(md);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.id).toBe("x-1");
    expect(result!.frontmatter.type).toBe("tarefa");
    expect(result!.frontmatter.title).toBe("Teste");
    expect(result!.frontmatter.tags).toEqual(["tag1", "tag2"]);
    expect(result!.body).toContain("# Conteúdo");
  });

  it("retorna null para markdown sem frontmatter", async () => {
    const { parseFrontmatter } = await import("@/lib/obsidian-adapter");
    expect(parseFrontmatter("# Apenas título")).toBeNull();
  });

  it("retorna null se campos obrigatórios faltam", async () => {
    const { parseFrontmatter } = await import("@/lib/obsidian-adapter");
    const md = `---
type: tarefa
title: Teste
---
`;
    expect(parseFrontmatter(md)).toBeNull();
  });
});

describe("createMarkdownNote", () => {
  it("cria nota completa com frontmatter + body", async () => {
    const { createMarkdownNote } = await import("@/lib/obsidian-adapter");
    const note = createMarkdownNote({
      id: "x-1",
      type: "tarefa",
      title: "Teste",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(note).toContain("id: x-1");
    expect(note).toContain("# Teste");
    expect(note).toContain("Cortex/Aion");
  });

  it("aceita body customizado", async () => {
    const { createMarkdownNote } = await import("@/lib/obsidian-adapter");
    const note = createMarkdownNote(
      { id: "x-1", type: "tarefa", title: "Teste", createdAt: "2026-01-01T00:00:00.000Z" },
      "Meu corpo personalizado"
    );
    expect(note).toContain("Meu corpo personalizado");
  });
});

describe("getFolderByRecordType", () => {
  it("mapeia todos os tipos", async () => {
    const { getFolderByRecordType } = await import("@/lib/obsidian-adapter");
    expect(getFolderByRecordType("gasto")).toBe("Financeiro");
    expect(getFolderByRecordType("receita")).toBe("Financeiro");
    expect(getFolderByRecordType("tarefa")).toBe("Tarefas");
    expect(getFolderByRecordType("habito")).toBe("Hábitos");
    expect(getFolderByRecordType("ideia")).toBe("Ideias");
    expect(getFolderByRecordType("daily")).toBe("Daily");
    expect(getFolderByRecordType("projeto")).toBe("Projetos");
    expect(getFolderByRecordType("entrada_livre")).toBe("00_Inbox");
  });

  it("fallback para 00_Inbox", async () => {
    const { getFolderByRecordType } = await import("@/lib/obsidian-adapter");
    // @ts-expect-error — tipo inválido
    expect(getFolderByRecordType("unknown")).toBe("00_Inbox");
  });
});

// ---------------------------------------------------------------------------
// recordToObsidianNote — geração de markdown oficial
// ---------------------------------------------------------------------------

describe("recordToObsidianNote", () => {
  it("task gera frontmatter com tipo 'tarefa' e campos específicos", async () => {
    const { recordToObsidianNote } = await import("@/lib/obsidian-adapter");
    const md = recordToObsidianNote(makeRecord());
    expect(md).toContain("tipo: tarefa");
    expect(md).toContain("id: rec-123");
    expect(md).toContain("descricao: Pagar a conta de internet amanhã");
    expect(md).toContain("prioridade: media");
    expect(md).toContain("deadline: 2026-05-20");
    expect(md).toContain("categoria: contas");
    expect(md).toContain("sync_status: pending");
    expect(md).toContain("aion_processed: false");
  });

  it("expense gera tipo 'gasto' com valor e categoria", async () => {
    const { recordToObsidianNote } = await import("@/lib/obsidian-adapter");
    const md = recordToObsidianNote(
      makeRecord({ type: "expense", amount: 32.5, category: "alimentacao" })
    );
    expect(md).toContain("tipo: gasto");
    expect(md).toContain("valor: 32.5");
    expect(md).toContain("categoria: alimentacao");
  });

  it("idea gera tipo 'ideia' com estado quarentena", async () => {
    const { recordToObsidianNote } = await import("@/lib/obsidian-adapter");
    const md = recordToObsidianNote(makeRecord({ type: "idea" }));
    expect(md).toContain("tipo: ideia");
    expect(md).toContain("estado: quarentena");
  });

  it("daily_review gera tipo 'daily'", async () => {
    const { recordToObsidianNote } = await import("@/lib/obsidian-adapter");
    const md = recordToObsidianNote(makeRecord({ type: "daily_review" }));
    expect(md).toContain("tipo: daily");
  });

  it("project_note gera tipo 'projeto'", async () => {
    const { recordToObsidianNote } = await import("@/lib/obsidian-adapter");
    const md = recordToObsidianNote(makeRecord({ type: "project_note" }));
    expect(md).toContain("tipo: projeto");
  });

  it("focus_request gera tipo 'tarefa'", async () => {
    const { recordToObsidianNote } = await import("@/lib/obsidian-adapter");
    const md = recordToObsidianNote(makeRecord({ type: "focus_request" }));
    expect(md).toContain("tipo: tarefa");
  });

  it("unknown gera tipo 'entrada_livre'", async () => {
    const { recordToObsidianNote } = await import("@/lib/obsidian-adapter");
    const md = recordToObsidianNote(makeRecord({ type: "unknown" }));
    expect(md).toContain("tipo: entrada_livre");
  });

  it("body contém título, descrição e metadados", async () => {
    const { recordToObsidianNote } = await import("@/lib/obsidian-adapter");
    const md = recordToObsidianNote(
      makeRecord({ nextAction: "Ligar para a operadora" })
    );
    expect(md).toContain("# Pagar internet");
    expect(md).toContain("## Descrição");
    expect(md).toContain("Pagar a conta de internet amanhã");
    expect(md).toContain("## Próxima ação");
    expect(md).toContain("Ligar para a operadora");
  });
});

// ---------------------------------------------------------------------------
// Network-dependent functions
// ---------------------------------------------------------------------------

describe("writeObsidianNote", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz PUT no proxy com path codificado", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { writeObsidianNote } = await import("@/lib/obsidian-adapter");

    const ok = await writeObsidianNote("Tarefas/rec-123.md", "# conteúdo");
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/obsidian/vault/Tarefas%2Frec-123.md",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
        body: "# conteúdo",
      })
    );
  });

  it("retorna false se fetch falhar", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));
    const { writeObsidianNote } = await import("@/lib/obsidian-adapter");
    const ok = await writeObsidianNote("x.md", "x");
    expect(ok).toBe(false);
  });

  it("retorna false se PUT retornar erro", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
    const { writeObsidianNote } = await import("@/lib/obsidian-adapter");
    const ok = await writeObsidianNote("x.md", "x");
    expect(ok).toBe(false);
  });
});

describe("readObsidianNote", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz GET no proxy com path codificado", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("# conteúdo", {
        status: 200,
        headers: { "Content-Type": "text/markdown" },
      })
    );
    const { readObsidianNote } = await import("@/lib/obsidian-adapter");

    const content = await readObsidianNote("Tarefas/rec-123.md");
    expect(content).toBe("# conteúdo");
    expect(fetch).toHaveBeenCalledWith(
      "/api/obsidian/vault/Tarefas%2Frec-123.md"
    );
  });

  it("retorna null se fetch falhar", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));
    const { readObsidianNote } = await import("@/lib/obsidian-adapter");
    const content = await readObsidianNote("x.md");
    expect(content).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Save / Update / Delete — dependem de isObsidianAvailable
// ---------------------------------------------------------------------------

describe("exportRecordToObsidian / exportUpdatedRecordToObsidian / deleteExportedRecordFromObsidian", () => {
  const envRestore: Record<string, string | undefined> = {};

  beforeEach(() => {
    envRestore.OBSIDIAN_REST_URL = process.env.OBSIDIAN_REST_URL;
    envRestore.NEXT_PUBLIC_OBSIDIAN_REST_URL =
      process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL;
    envRestore.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED =
      process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL = "http://127.0.0.1:27123";
    delete process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env.OBSIDIAN_REST_URL = envRestore.OBSIDIAN_REST_URL;
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL =
      envRestore.NEXT_PUBLIC_OBSIDIAN_REST_URL;
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED =
      envRestore.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
    vi.unstubAllGlobals();
  });

  it("exportRecordToObsidian chama PUT no path baseado em id", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const { exportRecordToObsidian } = await import("@/lib/obsidian-adapter");
    const ok = await exportRecordToObsidian(makeRecord());
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/obsidian/vault/Tarefas%2Frec-123.md",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("exportRecordToObsidian gera path Financeiro/{id}.md para expense", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const { exportRecordToObsidian } = await import("@/lib/obsidian-adapter");
    await exportRecordToObsidian(
      makeRecord({ type: "expense", id: "exp-456" })
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/obsidian/vault/Financeiro%2Fexp-456.md",
      expect.anything()
    );
  });

  it("exportRecordToObsidian gera path Ideias/{id}.md para idea", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const { exportRecordToObsidian } = await import("@/lib/obsidian-adapter");
    await exportRecordToObsidian(makeRecord({ type: "idea", id: "idea-789" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/obsidian/vault/Ideias%2Fidea-789.md",
      expect.anything()
    );
  });

  it("mudar title não muda o path", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const { exportRecordToObsidian } = await import("@/lib/obsidian-adapter");
    await exportRecordToObsidian(makeRecord({ id: "fixo", title: "Original" }));
    const call1 = (fetch as ReturnType<typeof vi.fn>).mock.lastCall[0];
    await exportRecordToObsidian(makeRecord({ id: "fixo", title: "Alterado" }));
    const call2 = (fetch as ReturnType<typeof vi.fn>).mock.lastCall[0];
    expect(call1).toBe(call2);
  });

  it("dois registros com mesmo title geram paths diferentes", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const { exportRecordToObsidian } = await import("@/lib/obsidian-adapter");
    await exportRecordToObsidian(makeRecord({ id: "aaa", title: "Mesmo" }));
    const call1 = (fetch as ReturnType<typeof vi.fn>).mock.lastCall[0];
    await exportRecordToObsidian(makeRecord({ id: "bbb", title: "Mesmo" }));
    const call2 = (fetch as ReturnType<typeof vi.fn>).mock.lastCall[0];
    expect(call1).not.toBe(call2);
  });

  it("falha no Obsidian não lança exceção — retorna false", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));

    const { exportRecordToObsidian } = await import("@/lib/obsidian-adapter");
    await expect(
      exportRecordToObsidian(makeRecord())
    ).resolves.toBe(false);
  });

  it("exportUpdatedRecordToObsidian chama PUT no path correto", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const { exportUpdatedRecordToObsidian } = await import("@/lib/obsidian-adapter");
    const ok = await exportUpdatedRecordToObsidian(makeRecord());
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("Tarefas%2Frec-123.md"),
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("deleteExportedRecordFromObsidian chama DELETE no path correto", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const { deleteExportedRecordFromObsidian } = await import("@/lib/obsidian-adapter");
    const ok = await deleteExportedRecordFromObsidian(makeRecord());
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("Tarefas%2Frec-123.md"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("deleteExportedRecordFromObsidian aceita 404 como sucesso", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    const { deleteExportedRecordFromObsidian } = await import("@/lib/obsidian-adapter");
    const ok = await deleteExportedRecordFromObsidian(makeRecord());
    expect(ok).toBe(true);
  });

});

// Teste isolado: sem env vars configuradas
describe("exportRecordToObsidian — sem config", () => {
  const envRestore: Record<string, string | undefined> = {};

  beforeEach(() => {
    envRestore.OBSIDIAN_REST_URL = process.env.OBSIDIAN_REST_URL;
    envRestore.NEXT_PUBLIC_OBSIDIAN_REST_URL =
      process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL;
    envRestore.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED =
      process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
    delete process.env.OBSIDIAN_REST_URL;
    delete process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL;
    delete process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env.OBSIDIAN_REST_URL = envRestore.OBSIDIAN_REST_URL;
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL =
      envRestore.NEXT_PUBLIC_OBSIDIAN_REST_URL;
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED =
      envRestore.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
    vi.unstubAllGlobals();
  });

  it("retorna false sem chamar fetch se Obsidian não está configurado", async () => {
    const { exportRecordToObsidian } = await import("@/lib/obsidian-adapter");
    const ok = await exportRecordToObsidian(makeRecord());
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("desabilitado com NEXT_PUBLIC_OBSIDIAN_REST_ENABLED=false", async () => {
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED = "false";
    const { exportRecordToObsidian } = await import("@/lib/obsidian-adapter");
    const ok = await exportRecordToObsidian(makeRecord());
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("aliases deprecated ainda funcionam", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL = "http://127.0.0.1:27123";
    delete process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL;
    vi.unstubAllGlobals();
  });

  it("saveRecordToObsidian alias funciona como exportRecordToObsidian", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const mod = await import("@/lib/obsidian-adapter");
    const ok = await mod.saveRecordToObsidian(makeRecord());
    expect(ok).toBe(true);
  });

  it("updateRecordInObsidian alias funciona como exportUpdatedRecordToObsidian", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const mod = await import("@/lib/obsidian-adapter");
    const ok = await mod.updateRecordInObsidian(makeRecord());
    expect(ok).toBe(true);
  });

  it("deleteRecordFromObsidian alias funciona como deleteExportedRecordFromObsidian", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const mod = await import("@/lib/obsidian-adapter");
    const ok = await mod.deleteRecordFromObsidian(makeRecord());
    expect(ok).toBe(true);
  });

  it("chama fetch quando NEXT_PUBLIC_OBSIDIAN_REST_ENABLED=true (sem URL)", async () => {
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED = "true";
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { saveRecordToObsidian } = await import("@/lib/obsidian-adapter");
    const ok = await saveRecordToObsidian(makeRecord());
    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/obsidian/vault/"),
      expect.objectContaining({ method: "PUT" })
    );
  });
});
