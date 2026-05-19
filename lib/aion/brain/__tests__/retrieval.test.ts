import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../brainStore", () => ({
  isBrainAvailable: vi.fn(),
  getBrainDB: vi.fn(),
}));

import { isBrainAvailable, getBrainDB } from "../brainStore";
import { retrieveRelevantBrainContext, prepareBrainContextForApi } from "../retrieval";
import type { AionBrainItem } from "../types";

function makeItem(overrides: Partial<AionBrainItem> = {}): AionBrainItem {
  return {
    id: "test-1",
    type: "procedure",
    title: "Test",
    content: "Conteúdo de teste",
    tags: ["teste"],
    source: "user",
    confidence: 0.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("retrieveRelevantBrainContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna array vazio se brain não está disponível", async () => {
    vi.mocked(isBrainAvailable).mockReturnValue(false);
    const result = await retrieveRelevantBrainContext("testar");
    expect(result).toEqual([]);
  });

  it("retorna array vazio se getBrainDB retorna null", async () => {
    vi.mocked(isBrainAvailable).mockReturnValue(true);
    vi.mocked(getBrainDB).mockResolvedValue(null);
    const result = await retrieveRelevantBrainContext("testar");
    expect(result).toEqual([]);
  });
});

describe("prepareBrainContextForApi", () => {
  it("filtra itens com tags sensíveis", () => {
    const items = [
      makeItem({ id: "1", tags: ["normal"] }),
      makeItem({ id: "2", tags: ["sensitive"] }),
      makeItem({ id: "3", tags: ["private", "normal"] }),
    ];
    const result = prepareBrainContextForApi(items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("limita a 5 itens", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: `item-${i}`, tags: ["ok"] })
    );
    const result = prepareBrainContextForApi(items);
    expect(result).toHaveLength(5);
  });

  it("trunca content a 800 caracteres", () => {
    const longContent = "x".repeat(1000);
    const items = [makeItem({ content: longContent, tags: ["ok"] })];
    const result = prepareBrainContextForApi(items);
    expect(result[0].content.length).toBe(800);
  });
});
