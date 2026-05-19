import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIndexBrainItemInBackground = vi.fn();

vi.mock("@/lib/aion/vector/background", () => ({
  indexBrainItemInBackground: mockIndexBrainItemInBackground,
}));

const mockTable = {
  put: vi.fn(),
};

const mockDb = {
  table: vi.fn(() => mockTable),
};

vi.mock("@/lib/aion/brain/brainStore", () => ({
  getBrainDB: vi.fn(async () => mockDb),
  isBrainAvailable: vi.fn(() => true),
  generateId: vi.fn(() => "learn-id-1"),
  isBrowser: vi.fn(() => true),
}));

describe("learning -- vector indexing integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("learnFromInteraction que passa nos filtros chama indexBrainItemInBackground", async () => {
    const { learnFromInteraction } = await import("../learning");
    const result = await learnFromInteraction(
      "Percebi que sempre procrastino quando tenho tarefas grandes",
      "Vou dividir tarefas grandes em partes menores"
    );

    expect(result).not.toBeNull();
    expect(mockIndexBrainItemInBackground).toHaveBeenCalled();
  });

  it("learnFromInteraction não indexa dados sensíveis", async () => {
    const { learnFromInteraction } = await import("../learning");
    const result = await learnFromInteraction(
      "Minha senha do banco é 123456",
      "Resposta sobre segurança"
    );

    expect(result).toBeNull();
    expect(mockIndexBrainItemInBackground).not.toHaveBeenCalled();
  });

  it("learnFromInteraction não indexa quando ação é create_record", async () => {
    const { learnFromInteraction } = await import("../learning");
    const result = await learnFromInteraction(
      "Percebi que academia ajuda no foco",
      "Ótima observação! Vou criar uma task",
      { action: "create_record" }
    );

    expect(result).toBeNull();
    expect(mockIndexBrainItemInBackground).not.toHaveBeenCalled();
  });

  it("learnFromInteraction funciona mesmo com background indexing", async () => {
    const { learnFromInteraction } = await import("../learning");
    const result = await learnFromInteraction(
      "Percebi que acordar cedo melhora produtividade",
      "Vou manter esse hábito"
    );

    expect(result).not.toBeNull();
    expect(mockIndexBrainItemInBackground).toHaveBeenCalled();
  });
});
