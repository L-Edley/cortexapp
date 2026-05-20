import { describe, it, expect, vi, beforeEach } from "vitest";

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

let reasonMod: typeof import("@/lib/aionReason");

async function loadModules() {
  vi.resetModules();
  reasonMod = await import("@/lib/aionReason");
}

describe("Aion Official Doctrine & Freshness Guard Tests", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadModules();
    
    // Default mock behaviors
    mockSmartRouter.mockReturnValue({ route: "api" });
    mockGenerateId.mockReturnValue("test-id-123");
    mockGetMemory.mockReturnValue({
      formatConversationContext: () => "",
    });
  });

  // 1. "salve que a prioridade do Cortex..." não recebe freshness warning
  it("salve que a prioridade do Cortex... não recebe freshness warning e salva no DB", async () => {
    mockSaveMemory.mockResolvedValue({
      id: "test-id-123",
      type: "user_preference",
      title: "A prioridade do Cortex é funcionar bem offline no celular",
      content: "a prioridade do Cortex é funcionar bem offline no celular",
      tags: ["memory", "user-saved"],
      source: "user",
      confidence: 0.95,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await reasonMod.reason("salve que a prioridade do Cortex é funcionar bem offline no celular");

    expect(result.intent).toBe("memory");
    expect(result.route).toBe("brain");
    expect(result.actionsExecuted).toContain("save_memory");
    expect(result.text).toContain("Vou guardar isso como prioridade do Cortex: funcionar bem offline no celular");
    expect(result.text).not.toContain("desatualizada");
    expect(mockSaveMemory).toHaveBeenCalled();
  });

  // 2. memory intent não chama web_search
  it("memory intent não chama web_search", async () => {
    mockSaveMemory.mockResolvedValue({ id: "id" });
    const result = await reasonMod.reason("registre que o café está pronto");
    expect(result.intent).toBe("memory");
    expect(result.actionsExecuted).not.toContain("web_search");
    expect(mockCallWithFallback).not.toHaveBeenCalled();
  });

  // 3. memory intent não diz "desatualizada"
  it("memory intent não diz desatualizada", async () => {
    mockSaveMemory.mockResolvedValue({ id: "id" });
    const result = await reasonMod.reason("lembre que hoje é terça");
    expect(result.intent).toBe("memory");
    expect(result.text).not.toContain("desatualizada");
  });

  // 4. "qual é a prioridade atual do Cortex?" responde offline no celular
  it("qual é a prioridade atual do Cortex? responde offline no celular", async () => {
    const result = await reasonMod.reason("qual é a prioridade atual do Cortex?");
    expect(result.providerUsed).toBe("official-doctrine");
    expect(result.route).toBe("brain");
    expect(result.text).toContain("funcionar bem offline no celular");
    expect(mockCallWithFallback).not.toHaveBeenCalled(); // Não chama LLM
  });

  // 5. "o Obsidian é o banco principal?" responde não
  it("o Obsidian é o banco principal? responde não", async () => {
    const result = await reasonMod.reason("o Obsidian é o banco principal?");
    expect(result.providerUsed).toBe("official-doctrine");
    expect(result.route).toBe("brain");
    expect(result.text).toContain("Não. O Obsidian não é o banco principal do Cortex");
    expect(mockCallWithFallback).not.toHaveBeenCalled(); // Não chama LLM
  });

  // 6. "qual provider principal do Aion?" responde Groq
  it("qual provider principal do Aion? responde Groq", async () => {
    const result = await reasonMod.reason("qual provider principal do Aion?");
    expect(result.providerUsed).toBe("official-doctrine");
    expect(result.route).toBe("brain");
    expect(result.text).toContain("Groq");
    expect(mockCallWithFallback).not.toHaveBeenCalled(); // Não chama LLM
  });

  // 7. official doctrine não chama LLM
  it("official doctrine não chama LLM", async () => {
    await reasonMod.reason("qual é a arquitetura oficial do Cortex?");
    expect(mockCallWithFallback).not.toHaveBeenCalled();
  });

  // 8. resposta nunca contém "Obsidian é o banco principal"
  // 9. resposta nunca contém "não há provider principal definido"
  // 10. resposta nunca contém "até meu conhecimento"
  it("guardrails limpam termos proibidos na resposta final", () => {
    const text = "Obsidian é o banco principal, além disso não há provider principal definido e até meu conhecimento não sabemos.";
    const cleaned = reasonMod.applyDoctrineGuardrails(text);
    
    expect(cleaned).not.toContain("Obsidian é o banco principal");
    expect(cleaned).not.toContain("não há provider principal definido");
    expect(cleaned).not.toContain("até meu conhecimento");
    expect(cleaned).toContain("O Obsidian não é o banco principal do Cortex. Ele funciona como exportação/espelho Markdown");
    expect(cleaned).toContain("o provider principal é o Groq");
  });

  // 11. action/record/memory continuam funcionando
  it("action/record/memory continuam funcionando normalmente", async () => {
    // Record flow
    mockSmartRouter.mockReturnValue({
      route: "local",
      response: {
        reply: "Gasto registrado com sucesso",
        voiceReply: "Gasto registrado.",
        action: "create_record",
        record: { type: "expense", title: "Café", amount: 5 },
        confidence: 0.9,
      }
    });

    const result = await reasonMod.reason("gastei 5 reais em café");
    expect(result.intent).toBe("record");
    expect(result.route).toBe("local");
    expect(result.actionsExecuted).toContain("create_record");
  });
});
