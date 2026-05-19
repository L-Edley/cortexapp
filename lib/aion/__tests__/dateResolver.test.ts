import { describe, it, expect } from "vitest";
import { resolveRelativeDatePtBR } from "../dateResolver";

const BASE = new Date("2026-05-18T12:00:00.000Z");

describe("resolveRelativeDatePtBR", () => {
  it('retorna a data base para "hoje"', () => {
    const result = resolveRelativeDatePtBR("hoje", BASE);
    expect(result).toBe("2026-05-18");
  });

  it('retorna +1 dia para "amanha"', () => {
    const result = resolveRelativeDatePtBR("amanha", BASE);
    expect(result).toBe("2026-05-19");
  });

  it('retorna +1 dia para "amanhã"', () => {
    const result = resolveRelativeDatePtBR("amanhã", BASE);
    expect(result).toBe("2026-05-19");
  });

  it('retorna +2 dias para "depois de amanha"', () => {
    const result = resolveRelativeDatePtBR("depois de amanha", BASE);
    expect(result).toBe("2026-05-20");
  });

  it('retorna a próxima sexta para "sexta"', () => {
    const result = resolveRelativeDatePtBR("sexta", BASE);
    expect(result).toBe("2026-05-22");
  });

  it('retorna próxima segunda para "semana que vem"', () => {
    const result = resolveRelativeDatePtBR("semana que vem", BASE);
    expect(result).toBe("2026-05-25");
  });

  it('retorna primeiro dia do mês seguinte para "mes que vem"', () => {
    const result = resolveRelativeDatePtBR("mes que vem", BASE);
    expect(result).toBe("2026-06-01");
  });

  it("retorna null para string sem data", () => {
    const result = resolveRelativeDatePtBR("comprar pão", BASE);
    expect(result).toBeNull();
  });

  it("retorna null para input vazio", () => {
    const result = resolveRelativeDatePtBR("", BASE);
    expect(result).toBeNull();
  });
});
