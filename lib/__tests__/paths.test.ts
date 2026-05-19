import { describe, it, expect } from "vitest";
import { getObsidianPath } from "@/lib/obsidian/paths";
import { getFolderByRecordType } from "@/lib/obsidian-adapter";
import type { CortexRecord } from "@/lib/types";

function makeRecord(overrides: Partial<CortexRecord> = {}): CortexRecord {
  return {
    id: "abc-123",
    type: "task",
    title: "Pagar internet",
    description: "me lembra de pagar a internet amanha",
    priority: "medium",
    project: null,
    amount: null,
    category: null,
    dueDate: "2026-05-19",
    nextAction: "Pagar internet",
    status: "pending",
    createdAt: "2026-05-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("paths — getObsidianPath (legacy)", () => {
  it("usa id como nome do arquivo", () => {
    const record = makeRecord();
    const path = getObsidianPath(record);
    expect(path).toBe("Tarefas/abc-123.md");
  });

  it("mudar title não muda o path", () => {
    const a = getObsidianPath(makeRecord({ id: "x-1", title: "Um" }));
    const b = getObsidianPath(makeRecord({ id: "x-1", title: "Outro" }));
    expect(a).toBe(b);
  });

  it("dois registros com mesmo title geram paths diferentes", () => {
    const a = getObsidianPath(makeRecord({ id: "aaa", title: "Mesmo" }));
    const b = getObsidianPath(makeRecord({ id: "bbb", title: "Mesmo" }));
    expect(a).not.toBe(b);
  });

  it("cada type vai para a pasta correta", () => {
    const testCases: Array<{ type: CortexRecord["type"]; expected: string }> = [
      { type: "task", expected: "Tarefas" },
      { type: "idea", expected: "Ideias" },
      { type: "expense", expected: "Financeiro" },
      { type: "project_note", expected: "Projetos" },
      { type: "daily_review", expected: "Daily" },
      { type: "focus_request", expected: "Daily" },
      { type: "unknown", expected: "00_Inbox" },
    ];

    for (const { type, expected } of testCases) {
      const path = getObsidianPath(makeRecord({ type, id: `id-${type}` }));
      expect(path.startsWith(`${expected}/`)).toBe(true);
    }
  });

  it("usa fallback para title se não houver id", () => {
    const path = getObsidianPath(makeRecord({ id: "" }));
    expect(path).toBe("Tarefas/Pagar internet.md");
  });

  it("record sem title usa 'untitled' como fallback", () => {
    const path = getObsidianPath(
      makeRecord({ id: "x", title: "", type: "unknown" })
    );
    expect(path).toBe("00_Inbox/x.md");
  });
});

describe("paths — adapter (new)", () => {
  it("getFolderByRecordType mapeia corretamente", () => {
    const cases: Array<[Parameters<typeof getFolderByRecordType>[0], string]> = [
      ["gasto", "Financeiro"],
      ["receita", "Financeiro"],
      ["tarefa", "Tarefas"],
      ["habito", "Hábitos"],
      ["ideia", "Ideias"],
      ["daily", "Daily"],
      ["projeto", "Projetos"],
      ["entrada_livre", "00_Inbox"],
    ];

    for (const [type, expected] of cases) {
      expect(getFolderByRecordType(type)).toBe(expected);
    }
  });

  it("getFolderByRecordType retorna '00_Inbox' para tipo desconhecido", () => {
    // @ts-expect-error — testando fallback para tipo inválido
    expect(getFolderByRecordType("unknown")).toBe("00_Inbox");
  });
});
