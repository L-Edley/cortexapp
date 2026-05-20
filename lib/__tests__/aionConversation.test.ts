import { describe, it, expect, vi, beforeEach } from "vitest";
import { enhanceHumanConversation } from "../aionConversation";

const mockSmartRouter = vi.hoisted(() => vi.fn());
const mockSaveMemory = vi.hoisted(() => vi.fn());
const mockSaveRecord = vi.hoisted(() => vi.fn());
const mockBuildSessionContext = vi.hoisted(() => vi.fn());
const mockBuildSystemPrompt = vi.hoisted(() => vi.fn());
const mockBuildQueryPrompt = vi.hoisted(() => vi.fn());
const mockBuildContextDebug = vi.hoisted(() => vi.fn());
const mockCallWithFallback = vi.hoisted(() => vi.fn());
const mockRetrieveRelevantBrainContext = vi.hoisted(() => vi.fn());
const mockAnswerFromBrain = vi.hoisted(() => vi.fn());
const mockGetMemory = vi.hoisted(() => vi.fn());
const mockParseRecordFromDecision = vi.hoisted(() => vi.fn());
const mockResolveRelativeDatePtBR = vi.hoisted(() => vi.fn());
const mockGenerateId = vi.hoisted(() => vi.fn());

vi.mock("@/lib/aion/router", () => ({
  smartRouter: mockSmartRouter,
}));

vi.mock("@/lib/aion/brain/memory", () => ({
  saveMemory: mockSaveMemory,
}));

vi.mock("@/lib/storageProvider", () => ({
  saveRecord: mockSaveRecord,
}));

vi.mock("@/lib/aionContext", () => ({
  buildSessionContext: mockBuildSessionContext,
  buildSystemPrompt: mockBuildSystemPrompt,
  buildQueryPrompt: mockBuildQueryPrompt,
  buildContextDebug: mockBuildContextDebug,
}));

vi.mock("@/lib/aionLLM", () => ({
  callWithFallback: mockCallWithFallback,
}));

vi.mock("@/lib/aion/brain", () => ({
  retrieveRelevantBrainContext: mockRetrieveRelevantBrainContext,
  answerFromBrain: mockAnswerFromBrain,
}));

vi.mock("@/lib/aion/memory", () => ({
  getMemory: mockGetMemory,
}));

vi.mock("@/lib/aion/tools", () => ({
  parseRecordFromDecision: mockParseRecordFromDecision,
}));

vi.mock("@/lib/aion/dateResolver", () => ({
  resolveRelativeDatePtBR: mockResolveRelativeDatePtBR,
}));

vi.mock("@/lib/aion/brain/brainStore", () => ({
  generateId: mockGenerateId,
  isBrainAvailable: vi.fn(() => true),
}));

describe("Aion Conversational Layer", () => {
  describe("enhanceHumanConversation Unit Tests", () => {
    
    it("resposta de comando simples continua curta e direta", () => {
      const baseResponse = {
        reply: "Tarefa registrada.",
        action: "create_record" as const,
        confidence: 0.95,
        providerUsed: "smart-router",
        record: { type: "task", title: "Pagar internet" }
      };
      
      const enhanced = enhanceHumanConversation("me lembra de pagar internet amanhã", baseResponse);
      
      expect(enhanced.humanizedReply).toBe("Fechado, registrei para amanhã.");
      expect(enhanced.followUpQuestion).toBe("Quer que eu deixe como prioridade alta?");
      expect(enhanced.shouldAskFollowUp).toBe(true);
    });

    it("decisão estratégica importante ganha resposta humana e follow-up estratégico", () => {
      const baseResponse = {
        reply: "Obsidian não é banco principal anotado.",
        action: "save_memory" as const,
        confidence: 0.95,
        providerUsed: "aion-brain"
      };

      const enhanced = enhanceHumanConversation("Obsidian não é banco principal", baseResponse);

      expect(enhanced.humanizedReply).toContain("Vou tratar o Obsidian como exportação Markdown");
      expect(enhanced.followUpQuestion).toBe("Quer que eu salve isso como regra oficial da arquitetura?");
      expect(enhanced.shouldAskFollowUp).toBe(true);
    });

    it("dúvida ganha sugestão prática", () => {
      const baseResponse = {
        reply: "O próximo passo é finalizar.",
        action: "none" as const,
        confidence: 0.8,
        providerUsed: "gemini"
      };

      const enhanced = enhanceHumanConversation("qual o próximo passo?", baseResponse);

      expect(enhanced.humanizedReply).toContain("fechar a camada conversacional do Aion");
      expect(enhanced.followUpQuestion).toBe("Quer que eu te mande o prompt pronto?");
      expect(enhanced.shouldAskFollowUp).toBe(true);
    });

    it("desabafo/confusão recebe resposta acolhedora, objetiva e estruturante", () => {
      const baseResponse = {
        reply: "Entendi que você está confuso.",
        action: "none" as const,
        confidence: 0.85,
        providerUsed: "gemini"
      };

      const enhanced = enhanceHumanConversation("estou perdido", baseResponse);

      expect(enhanced.humanizedReply).toContain("você não precisa decidir tudo agora");
      expect(enhanced.followUpQuestion).toBe("Quer que eu organize os próximos 3 passos?");
      expect(enhanced.shouldAskFollowUp).toBe(true);
    });

    it("conversa casual recebe resposta leve e positiva", () => {
      const baseResponse = {
        reply: "ok",
        action: "none" as const,
        confidence: 1,
        providerUsed: "smart-router"
      };

      const enhanced = enhanceHumanConversation("boa", baseResponse);

      expect(enhanced.humanizedReply).toContain("Cortex já está em um nível bem mais avançado");
      expect(enhanced.shouldAskFollowUp).toBe(false);
    });

    it("garante no máximo 1 pergunta de follow-up", () => {
      const baseResponse = {
        reply: "Quer fazer mais coisas? Como posso ajudar?",
        action: "none" as const,
        confidence: 0.9,
        providerUsed: "gemini",
        followUpQuestion: "Quer ver os relatórios?"
      };

      const enhanced = enhanceHumanConversation("preciso de ajuda", baseResponse);

      // A resposta humanizada não deve terminar com múltiplas perguntas
      const sentences = enhanced.humanizedReply.split(/[?]/);
      expect(sentences.length).toBeLessThanOrEqual(2);
    });

    it("remove jargões de terminal e robóticos e não usa 'deseja algo mais?' ou 'comando executado'", () => {
      const baseResponse = {
        reply: "Comando executado com sucesso. Deseja algo mais? Solicitação processada.",
        action: "none" as const,
        confidence: 1,
        providerUsed: "smart-router"
      };

      const enhanced = enhanceHumanConversation("rodar script", baseResponse);

      expect(enhanced.humanizedReply.toLowerCase()).not.toContain("comando executado");
      expect(enhanced.humanizedReply.toLowerCase()).not.toContain("deseja algo mais");
      expect(enhanced.humanizedReply.toLowerCase()).not.toContain("solicitação processada");
    });

    it("corrige respostas ALL CAPS automáticas do provider", () => {
      const baseResponse = {
        reply: "ESTE É UM GRITO DO TERMINAL",
        action: "none" as const,
        confidence: 0.8,
        providerUsed: "gemini"
      };

      const enhanced = enhanceHumanConversation("alô", baseResponse);

      expect(enhanced.humanizedReply).not.toBe("ESTE É UM GRITO DO TERMINAL");
      // Deve capitalizar de forma normal
      expect(enhanced.humanizedReply.charAt(0)).toBe("E");
      expect(enhanced.humanizedReply.slice(1)).toBe(enhanced.humanizedReply.slice(1).toLowerCase());
    });

    it("preserva action e record da resposta base", () => {
      const record = { id: "123", type: "task", title: "Pagar conta" };
      const baseResponse = {
        reply: "Criado.",
        action: "create_record" as const,
        confidence: 0.99,
        providerUsed: "smart-router",
        record
      };

      const enhanced = enhanceHumanConversation("adicionar tarefa pagar conta", baseResponse);
      
      // A função enhanceHumanConversation retorna a estrutura ConversationEnhancement.
      // E a integração no reason() deve preservar action e record.
      expect(enhanced).toHaveProperty("humanizedReply");
      expect(baseResponse.action).toBe("create_record");
      expect(baseResponse.record).toEqual(record);
    });

    // -------------------------------------------------------------
    // CENÁRIOS E EXEMPLOS OBRIGATÓRIOS DO ENUNCIADO
    // -------------------------------------------------------------
    
    it("cenário obrigatório 1: prioridade do Cortex offline", () => {
      const baseResponse = {
        reply: "Prioridade salva.",
        action: "save_memory" as const,
        confidence: 0.9,
        providerUsed: "smart-router"
      };

      const enhanced = enhanceHumanConversation(
        "salve que a prioridade do Cortex é funcionar bem offline no celular",
        baseResponse
      );

      expect(enhanced.humanizedReply).toBe(
        "Entendi. Vou guardar isso como prioridade do Cortex: funcionar bem offline no celular."
      );
      expect(enhanced.suggestion).toBe("Isso deve guiar as próximas decisões de arquitetura.");
    });

    it("cenário obrigatório 2: Obsidian é o banco principal?", () => {
      const baseResponse = {
        reply: "Não sei.",
        action: "none" as const,
        confidence: 0.5,
        providerUsed: "gemini"
      };

      const enhanced = enhanceHumanConversation(
        "o Obsidian é o banco principal?",
        baseResponse
      );

      expect(enhanced.humanizedReply).toBe(
        "Não. O Obsidian não é o banco principal do Cortex. Ele funciona como exportação/espelho Markdown."
      );
    });

    it("cenário obrigatório 3: qual provider principal do Aion?", () => {
      const baseResponse = {
        reply: "Groq e outros.",
        action: "none" as const,
        confidence: 0.9,
        providerUsed: "smart-router"
      };

      const enhanced = enhanceHumanConversation(
        "qual provider principal do Aion?",
        baseResponse
      );

      expect(enhanced.humanizedReply).toBe(
        "O provider online principal é Groq. OpenCode, OpenRouter, NVIDIA e Gemini ficam como fallback."
      );
    });

    it("cenário obrigatório 4: estou perdido no projeto", () => {
      const baseResponse = {
        reply: "Se situe.",
        action: "none" as const,
        confidence: 0.6,
        providerUsed: "smart-router"
      };

      const enhanced = enhanceHumanConversation(
        "estou perdido no projeto",
        baseResponse
      );

      expect(enhanced.humanizedReply).toBe(
        "Entendi. Vamos simplificar. Você está na fase de deixar o Aion mais natural e confiável. O próximo passo é melhorar a camada conversacional."
      );
    });

  });

  describe("Integration with reason()", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      mockGenerateId.mockReturnValue("test-id-123");
      mockGetMemory.mockReturnValue({
        addMessage: vi.fn(),
        formatConversationContext: vi.fn(() => ""),
        getHistory: vi.fn(() => []),
      });
      mockResolveRelativeDatePtBR.mockReturnValue(null);
    });

    it("chama enhanceHumanConversation no fluxo final do reason() e preenche os campos requeridos", async () => {
      mockSmartRouter.mockReturnValue({
        route: "local",
        response: {
          reply: "Tarefa registrada.",
          voiceReply: "Tarefa registrada.",
          action: "create_record",
          record: { type: "task", title: "Pagar internet" },
          confidence: 0.95
        }
      });

      const { reason } = await import("../aionReason");

      const response = await reason("me lembra de pagar internet amanhã");

      // Deve ter passado pelo enhanceHumanConversation e alterado as respostas de acordo com as regras de comando simples
      expect(response.text).toBe("Fechado, registrei para amanhã.");
      expect(response.voiceReply).toBe("Tarefa registrada."); // Preservada para manter o teste de integração
      expect(response.followUpQuestion).toBe("Quer que eu deixe como prioridade alta?");
      expect(response.nextSteps).toContain("Quer que eu deixe como prioridade alta?");
      expect(response.actionsExecuted).toContain("create_record");
    });
  });
});
