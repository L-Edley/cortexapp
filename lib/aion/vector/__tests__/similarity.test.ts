import { describe, it, expect } from "vitest";
import { cosineSimilarity, dotProduct, normalizeVector } from "../similarity";

describe("cosineSimilarity", () => {
  it("retorna 1 para vetores iguais", () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it("retorna 0 para vetores ortogonais", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 10);
  });

  it("retorna -1 para vetores opostos", () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 10);
  });

  it("retorna 0 para vetores vazios", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [])).toBe(0);
    expect(cosineSimilarity([], [1, 2])).toBe(0);
  });

  it("retorna 0 para dimensões diferentes", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([1], [1, 2, 3])).toBe(0);
  });

  it("calcula similaridade corretamente", () => {
    const a = [4, 3];
    const b = [1, 0];
    // (4*1 + 3*0) / (sqrt(16+9) * sqrt(1)) = 4 / 5 = 0.8
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.8, 10);
  });

  it("funciona com vetores normalizados", () => {
    const a = [0.6, 0.8];
    const b = [0.8, 0.6];
    // (0.48 + 0.48) / (1 * 1) = 0.96
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.96, 10);
  });
});

describe("dotProduct", () => {
  it("retorna produto escalar correto", () => {
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it("retorna 0 para vetores vazios", () => {
    expect(dotProduct([], [])).toBe(0);
    expect(dotProduct([1], [])).toBe(0);
  });

  it("retorna 0 para dimensões diferentes", () => {
    expect(dotProduct([1, 2], [3])).toBe(0);
  });
});

describe("normalizeVector", () => {
  it("normaliza vetor para comprimento unitário", () => {
    const result = normalizeVector([3, 4]);
    expect(result[0]).toBeCloseTo(0.6, 10);
    expect(result[1]).toBeCloseTo(0.8, 10);
  });

  it("retorna vetor original se norma for zero", () => {
    expect(normalizeVector([0, 0])).toEqual([0, 0]);
  });

  it("vetor unitário permanece inalterado", () => {
    const result = normalizeVector([1, 0]);
    expect(result[0]).toBeCloseTo(1, 10);
    expect(result[1]).toBeCloseTo(0, 10);
  });
});
