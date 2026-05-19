import { describe, it, expect } from "vitest";
import { buildVectorTextFromRecord, buildVectorTextFromBrainItem } from "../text";

describe("buildVectorTextFromRecord", () => {
  it("monta texto para task", () => {
    const result = buildVectorTextFromRecord({
      id: "1",
      type: "task",
      title: "Pagar internet",
      description: "Vencimento dia 10",
      priority: "high",
      project: null,
      amount: null,
      category: "contas",
      dueDate: "2026-05-19",
      nextAction: "",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toContain("task: Pagar internet.");
    expect(result).toContain("Vencimento dia 10");
    expect(result).toContain("Categoria: contas.");
    expect(result).toContain("Prazo: 2026-05-19.");
    expect(result).toContain("Prioridade: high.");
    expect(result).toContain("Status: pending.");
  });

  it("monta texto para expense/finance com amount", () => {
    const result = buildVectorTextFromRecord({
      id: "2",
      type: "expense",
      title: "Almoço",
      description: "Restaurante X",
      priority: "medium",
      project: null,
      amount: 45.9,
      category: "alimentação",
      dueDate: null,
      nextAction: "",
      status: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toContain("expense: Almoço.");
    expect(result).toContain("Restaurante X");
    expect(result).toContain("Valor: 45.9.");
    expect(result).toContain("Categoria: alimentação.");
    expect(result).toContain("Prioridade: medium.");
    expect(result).toContain("Status: done.");
  });

  it("monta texto para idea", () => {
    const result = buildVectorTextFromRecord({
      id: "3",
      type: "idea",
      title: "App de meditação",
      description: "App que sugere meditações baseadas no humor",
      priority: "low",
      project: null,
      amount: null,
      category: null,
      dueDate: null,
      nextAction: "",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toContain("idea: App de meditação.");
    expect(result).toContain("App que sugere meditações baseadas no humor");
    expect(result).not.toContain("Categoria:");
    expect(result).not.toContain("Valor:");
    expect(result).not.toContain("Prazo:");
  });

  it("monta texto para SyncRecord com tags", () => {
    const result = buildVectorTextFromRecord({
      id: "4",
      type: "task",
      title: "Estudar React",
      description: "Curso de Next.js",
      priority: "medium",
      status: "pending",
      tags: ["estudo", "programação"],
      source: "cortex",
      sync_status: "pending",
      aion_processed: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toContain("task: Estudar React.");
    expect(result).toContain("Curso de Next.js");
    expect(result).toContain("Tags: estudo, programação.");
  });

  it("lida com record sem campos opcionais", () => {
    const result = buildVectorTextFromRecord({
      id: "5",
      type: "idea",
      title: "Ideia simples",
      priority: "low",
      project: null,
      amount: null,
      category: null,
      dueDate: null,
      nextAction: "",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toContain("idea: Ideia simples.");
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("null");
  });
});

describe("buildVectorTextFromBrainItem", () => {
  it("monta texto para AionBrainItem", () => {
    const result = buildVectorTextFromBrainItem({
      id: "b1",
      type: "user_preference",
      title: "Preferência de horário",
      content: "Usuário prefere trabalhar pela manhã",
      tags: ["horário", "produtividade"],
      source: "user",
      confidence: 0.9,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toContain("user_preference: Preferência de horário.");
    expect(result).toContain("Usuário prefere trabalhar pela manhã");
    expect(result).toContain("Tags: horário, produtividade.");
  });

  it("lida com item sem tags", () => {
    const result = buildVectorTextFromBrainItem({
      id: "b2",
      type: "research",
      title: "Pesquisa sobre IA",
      content: "Artigos sobre transformers",
      tags: [],
      source: "web",
      confidence: 0.7,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toContain("research: Pesquisa sobre IA.");
    expect(result).toContain("Artigos sobre transformers");
    expect(result).not.toContain("Tags:");
  });
});
