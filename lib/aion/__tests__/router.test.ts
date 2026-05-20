import { describe, it, expect, vi } from "vitest";
import { smartRouter } from "../router";

vi.mock("../dateResolver", () => ({
  resolveRelativeDatePtBR: vi.fn((msg: string) => {
    if (msg.includes("amanha") || msg.includes("amanhã")) return "2026-05-19";
    return null;
  }),
}));

describe("smartRouter", () => {
  it('task: "me lembra de pagar a internet amanha"', () => {
    const result = smartRouter("me lembra de pagar a internet amanha");
    expect(result.route).toBe("local");
    expect(result.response.action).toBe("create_record");
    expect(result.response.record?.type).toBe("task");
    expect(result.response.record?.title).toBe("Pagar internet");
    expect(result.response.record?.dueDate).toBe("2026-05-19");
    expect(result.response.reply).toContain("Fechado, deixei para");
    expect(result.response.reply).not.toContain("Quer definir um projeto");
  });

  it('task: limpa formatos de data complexos "na sexta às 18h"', () => {
    const result = smartRouter("me lembra de pagar a internet na sexta às 18h");
    expect(result.response.record?.title).toBe("Pagar internet");
  });

  it('expense: "gastei 32 reais no almoço"', () => {
    const result = smartRouter("gastei 32 reais no almoço");
    expect(result.route).toBe("local");
    expect(result.response.action).toBe("create_record");
    expect(result.response.record?.type).toBe("expense");
    expect(result.response.record?.amount).toBe(32);
  });

  it('idea: "ideia: criar banco de inteligência do Aion"', () => {
    const result = smartRouter("ideia: criar banco de inteligência do Aion");
    expect(result.route).toBe("local");
    expect(result.response.action).toBe("create_record");
    expect(result.response.record?.type).toBe("idea");
  });

  it('greeting: "oi"', () => {
    const result = smartRouter("oi");
    expect(result.route).toBe("local");
    expect(result.response.action).toBe("none");
    expect(result.response.debug?.route).toBe("local");
  });

  it('empty message returns local with "Digite uma mensagem"', () => {
    const result = smartRouter("");
    expect(result.route).toBe("local");
    expect(result.response.reply).toContain("Digite uma mensagem");
  });
});
