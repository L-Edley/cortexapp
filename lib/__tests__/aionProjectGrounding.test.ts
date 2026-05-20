import { describe, it, expect } from "vitest";
import { isProjectDomainQuestion, blockKnownWrongInterpretations, applyProjectGroundingToPrompt } from "../aionProjectGrounding";

describe("Aion Project Grounding", () => {
  describe("isProjectDomainQuestion", () => {
    it("detecta perguntas que mencionam o ecossistema Cortex/Aion", () => {
      expect(isProjectDomainQuestion("como estruturar o Night Research do Aion?")).toBe(true);
      expect(isProjectDomainQuestion("O que é o Cortex?")).toBe(true);
      expect(isProjectDomainQuestion("o aion brain funciona offline?")).toBe(true);
      expect(isProjectDomainQuestion("vamos usar dexie no provider?")).toBe(true);
    });

    it("ignora perguntas alheias ao domínio", () => {
      expect(isProjectDomainQuestion("quem descobriu o brasil?")).toBe(false);
      expect(isProjectDomainQuestion("como fazer bolo de cenoura?")).toBe(false);
    });
  });

  describe("blockKnownWrongInterpretations", () => {
    it("bloqueia respostas do provider com contexto de MMORPG", () => {
      expect(blockKnownWrongInterpretations("O Aion é um MMORPG da NCSoft onde você ganha ouro.")).toBe(true);
      expect(blockKnownWrongInterpretations("Para upar seu personagem e ganhar recompensas no jogo, use magias.")).toBe(true);
      expect(blockKnownWrongInterpretations("As facções Elyos lutam pelo domínio.")).toBe(true);
    });

    it("permite respostas corretas sobre o sistema", () => {
      expect(blockKnownWrongInterpretations("O Aion é a assistente do Cortex, que faz pesquisas noturnas.")).toBe(false);
      expect(blockKnownWrongInterpretations("Night Research analisa seu banco de dados local para criar briefings.")).toBe(false);
    });
  });

  describe("applyProjectGroundingToPrompt", () => {
    it("injeta o contexto quando for domínio do projeto", () => {
      const prompt = applyProjectGroundingToPrompt("como funciona o aion?", "Responda de forma simples.");
      expect(prompt).toContain("OFFICIAL PROJECT GROUNDING");
      expect(prompt).toContain("Responda de forma simples.");
    });

    it("não injeta o contexto se não for domínio do projeto", () => {
      const prompt = applyProjectGroundingToPrompt("o que é um array em javascript?", "Responda em js.");
      expect(prompt).not.toContain("OFFICIAL PROJECT GROUNDING");
      expect(prompt).toBe("Responda em js.");
    });
  });
});
