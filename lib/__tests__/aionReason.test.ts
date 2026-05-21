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
  getBrainDB: vi.fn(async () => null),
}));

vi.mock("@/lib/aionKnowledgeGap", () => ({
  shouldUseLearningEngine: vi.fn(() => false),
}));

let mod: typeof import("@/lib/aionReason");

async function loadModule() {
  vi.resetModules();
  mod = await import("@/lib/aionReason");
  return mod;
}

function makeLocalResponse(overrides?: Record<string, unknown>) {
  return {
    route: "local" as const,
    response: {
      reply: "Resposta local",
      voiceReply: "Resposta local.",
      action: "none",
      record: null,
      confidence: 1,
      fallbackUsed: false,
      ...(overrides?.response as Record<string, unknown>),
    },
  };
}

function makeApiRoute() {
  return { route: "api" as const };
}

describe("classifyIntent", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadModule();
  });

  it("classifica 'salve que' como memory", () => {
    expect(mod.classifyIntent("salve que eu gosto de pizza")).toBe("memory");
    expect(mod.classifyIntent("salva que hoje foi um bom dia")).toBe("memory");
    expect(mod.classifyIntent("guarde que o cliente prefere email")).toBe("memory");
    expect(mod.classifyIntent("lembre que tenho reunião toda segunda")).toBe("memory");
    expect(mod.classifyIntent("lembra disso")).toBe("memory");
  });

  it("classifica 'me lembra de' como record", () => {
    expect(mod.classifyIntent("me lembra de comprar pão")).toBe("record");
    expect(mod.classifyIntent("me lembre de pagar o aluguel")).toBe("record");
  });

  it("classifica 'tenho que' / 'preciso' como record", () => {
    expect(mod.classifyIntent("tenho que pagar a conta de luz")).toBe("record");
    expect(mod.classifyIntent("preciso de mais informações")).toBe("record");
    expect(mod.classifyIntent("não esquecer de levar o carro")).toBe("record");
  });

  it("classifica 'gastei' como record", () => {
    expect(mod.classifyIntent("gastei 50 reais no almoço")).toBe("record");
    expect(mod.classifyIntent("paguei a conta de internet")).toBe("record");
    expect(mod.classifyIntent("recebi o pagamento hoje")).toBe("record");
    expect(mod.classifyIntent("comprei um livro novo")).toBe("record");
  });

  it("classifica 'ideia' como record", () => {
    expect(mod.classifyIntent("ideia: criar um app de tarefas")).toBe("record");
    expect(mod.classifyIntent("pensando em fazer uma horta")).toBe("record");
    expect(mod.classifyIntent("e se a gente fizesse um podcast")).toBe("record");
    expect(mod.classifyIntent("que tal organizar um evento")).toBe("record");
  });

  it("classifica pergunta como question", () => {
    expect(mod.classifyIntent("qual é a previsão do tempo?")).toBe("question");
    expect(mod.classifyIntent("como funciona o sistema?")).toBe("question");
    expect(mod.classifyIntent("quem é você?")).toBe("question");
    expect(mod.classifyIntent("o que é o Cortex?")).toBe("question");
    expect(mod.classifyIntent("onde está meu relatório?")).toBe("question");
    expect(mod.classifyIntent("quanto gastei esse mês?")).toBe("question");
  });

  it("classifica análise como analysis", () => {
    expect(mod.classifyIntent("analise meus gastos do mês")).toBe("analysis");
    expect(mod.classifyIntent("o que percebe sobre meu comportamento")).toBe("analysis");
    expect(mod.classifyIntent("qual padrão você nota na minha produtividade")).toBe("analysis");
    expect(mod.classifyIntent("o que você acha dessa abordagem")).toBe("analysis");
  });

  it("classifica planejamento como planning", () => {
    expect(mod.classifyIntent("planeje minha semana de trabalho")).toBe("planning");
    expect(mod.classifyIntent("crie um plano de estudos")).toBe("planning");
    expect(mod.classifyIntent("próximos passos para o projeto")).toBe("planning");
    expect(mod.classifyIntent("qual a estratégia para esse mês")).toBe("planning");
  });

  it("classifica revisão como review", () => {
    expect(mod.classifyIntent("revise meu desempenho hoje")).toBe("review");
    expect(mod.classifyIntent("resuma meu dia")).toBe("review");
    expect(mod.classifyIntent("como estou essa semana")).toBe("review");
    expect(mod.classifyIntent("como foi meu dia hoje")).toBe("review");
  });

  it("classifica saudação como smalltalk", () => {
    expect(mod.classifyIntent("oi")).toBe("smalltalk");
    expect(mod.classifyIntent("bom dia")).toBe("smalltalk");
    expect(mod.classifyIntent("obrigado")).toBe("smalltalk");
    expect(mod.classifyIntent("valeu")).toBe("smalltalk");
  });

  it("retorna unknown para entradas não classificadas", () => {
    expect(mod.classifyIntent("123")).toBe("unknown");
    expect(mod.classifyIntent("abc")).toBe("unknown");
    expect(mod.classifyIntent("x")).toBe("unknown");
    expect(mod.classifyIntent("")).toBe("unknown");
  });
});

describe("reason", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGenerateId.mockReturnValue("test-id-123");
    mockGetMemory.mockReturnValue({
      addMessage: vi.fn(),
      formatConversationContext: vi.fn(() => ""),
      getHistory: vi.fn(() => []),
    });
    mockResolveRelativeDatePtBR.mockReturnValue(null);
    await loadModule();
  });

  it("retorna resposta local para entrada vazia", async () => {
    const result = await mod.reason("");
    expect(result.text).toContain("Digite uma mensagem");
    expect(result.route).toBe("local");
    expect(result.intent).toBe("unknown");
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  it("retorna resposta local quando smartRouter resolve", async () => {
    mockSmartRouter.mockReturnValue(makeLocalResponse());

    const result = await mod.reason("oi");
    expect(result.route).toBe("local");
    expect(result.text).toBe("Resposta local");
    expect(mockSmartRouter).toHaveBeenCalledWith("oi");
  });

  it("salva memória no Brain para intent memory", async () => {
    mockSmartRouter.mockReturnValue(makeApiRoute());
    mockSaveMemory.mockResolvedValue({
      id: "test-id-123",
      type: "user_preference",
      title: "Eu gosto de pizza",
      content: "eu gosto de pizza",
      tags: ["memory", "user-saved"],
      source: "user",
      confidence: 0.95,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const result = await mod.reason("salve que eu gosto de pizza");

    expect(result.intent).toBe("memory");
    expect(result.route).toBe("brain");
    expect(result.actionsExecuted).toContain("save_memory");
    expect(result.text).toContain("Anotado");
    expect(result.voiceReply).toBe("Memória salva.");
    expect(mockSaveMemory).toHaveBeenCalled();
  });

  it("continua criando task local para 'me lembra de'", async () => {
    mockSmartRouter.mockReturnValue(
      makeLocalResponse({
        response: {
          reply: "Tarefa registrada: \"Comprar pão\".",
          voiceReply: "Tarefa registrada.",
          action: "create_record",
          record: { type: "task", title: "Comprar pão", priority: "medium" },
          confidence: 0.9,
        },
      })
    );

    const result = await mod.reason("me lembra de comprar pão amanhã");

    expect(result.route).toBe("local");
    expect(result.actionsExecuted).toContain("create_record");
    expect(result.text).toContain("Tarefa registrada");
  });

  it("continua criando finance local para 'gastei'", async () => {
    mockSmartRouter.mockReturnValue(
      makeLocalResponse({
        response: {
          reply: "Registrei um gasto de R$ 50.00.",
          voiceReply: "Gasto registrado.",
          action: "create_record",
          record: { type: "expense", title: "Gasto de R$ 50.00", amount: 50 },
          confidence: 0.9,
        },
      })
    );

    const result = await mod.reason("gastei 50 no almoço");

    expect(result.route).toBe("local");
    expect(result.actionsExecuted).toContain("create_record");
    expect(result.text).toContain("Registrei um gasto");
  });

  it("usa LLM Router para análise", async () => {
    mockSmartRouter.mockReturnValue(makeApiRoute());
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockAnswerFromBrain.mockResolvedValue(null);
    mockBuildSessionContext.mockResolvedValue({
      profile: null,
      dailyInsight: null,
      patterns: {},
      recentRecords: [],
      relevantBrainItems: [],
      semanticResults: [],
      currentDateTime: new Date().toISOString(),
      systemState: { totalRecords: 0, pendingTasks: 0, todayExpenses: 0 },
    });
    mockBuildContextDebug.mockReturnValue({
      contextUsed: false,
      recentRecordsUsed: 0,
      brainItemsUsed: 0,
      semanticResultsUsed: 0,
      profileUsed: false,
      dailyInsightUsed: false,
    });
    mockBuildSystemPrompt.mockReturnValue("system prompt");
    mockBuildQueryPrompt.mockReturnValue("query prompt");
    mockCallWithFallback.mockResolvedValue({
      text: JSON.stringify({
        reply: "Análise completa dos seus gastos.",
        voiceReply: "Análise concluída.",
        action: "none",
        confidence: 0.9,
      }),
      providerUsed: "gemini",
      ollamaAvailable: false,
      route: "gemini",
    });

    const result = await mod.reason("analise meus gastos do mês");

    expect(result.intent).toBe("analysis");
    expect(result.route).toBe("llm");
    expect(result.text).toContain("Análise");
    expect(mockCallWithFallback).toHaveBeenCalled();
  });

  it("Smart Router local não chama LLM", async () => {
    mockSmartRouter.mockReturnValue(makeLocalResponse());
    mockCallWithFallback.mockClear();

    const result = await mod.reason("oi");

    expect(result.route).toBe("local");
    expect(mockCallWithFallback).not.toHaveBeenCalled();
  });

  it("falha da LLM retorna fallback útil", async () => {
    mockSmartRouter.mockReturnValue(makeApiRoute());
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockAnswerFromBrain.mockResolvedValue(null);
    mockBuildSessionContext.mockResolvedValue({
      profile: null,
      dailyInsight: null,
      patterns: {},
      recentRecords: [],
      relevantBrainItems: [],
      semanticResults: [],
      currentDateTime: new Date().toISOString(),
      systemState: { totalRecords: 0, pendingTasks: 0, todayExpenses: 0 },
    });
    mockBuildContextDebug.mockReturnValue({
      contextUsed: false,
      recentRecordsUsed: 0,
      brainItemsUsed: 0,
      semanticResultsUsed: 0,
      profileUsed: false,
      dailyInsightUsed: false,
    });
    mockBuildSystemPrompt.mockReturnValue("system prompt");
    mockBuildQueryPrompt.mockReturnValue("query prompt");
    mockCallWithFallback.mockResolvedValue({
      text: "",
      providerUsed: "none",
      ollamaAvailable: false,
      route: "fallback",
    });

    const result = await mod.reason("alguma pergunta qualquer");

    expect(result.route).toBe("fallback");
    expect(result.text).toContain("Não consegui processar");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("voiceReply é curta", async () => {
    mockSmartRouter.mockReturnValue(
      makeLocalResponse({
        response: {
          reply: "Uma resposta muito longa que deveria ser resumida em uma versão de voz curta.",
          voiceReply: "Uma resposta muito longa que deveria ser resumida em uma versão de voz curta.",
          action: "none",
          confidence: 1,
        },
      })
    );

    const result = await mod.reason("teste");
    expect(result.voiceReply.split(".").filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(result.voiceReply.length).toBeLessThan(201);
  });

  it("resposta não vem em ALL CAPS", async () => {
    mockSmartRouter.mockReturnValue(makeApiRoute());
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockAnswerFromBrain.mockResolvedValue(null);
    mockBuildSessionContext.mockResolvedValue({
      profile: null,
      dailyInsight: null,
      patterns: {},
      recentRecords: [],
      relevantBrainItems: [],
      semanticResults: [],
      currentDateTime: new Date().toISOString(),
      systemState: { totalRecords: 0, pendingTasks: 0, todayExpenses: 0 },
    });
    mockBuildContextDebug.mockReturnValue({
      contextUsed: false,
      recentRecordsUsed: 0,
      brainItemsUsed: 0,
      semanticResultsUsed: 0,
      profileUsed: false,
      dailyInsightUsed: false,
    });
    mockBuildSystemPrompt.mockReturnValue("system prompt");
    mockBuildQueryPrompt.mockReturnValue("query prompt");
    mockCallWithFallback.mockResolvedValue({
      text: JSON.stringify({
        reply: "ESTOU GRITANDO COM VOCÊ",
        voiceReply: "ESTOU GRITANDO",
        action: "none",
        confidence: 0.5,
      }),
      providerUsed: "gemini",
      ollamaAvailable: false,
      route: "gemini",
    });

    const result = await mod.reason("teste");
    expect(result.text).not.toBe("ESTOU GRITANDO COM VOCÊ");
    expect(result.voiceReply).not.toBe("ESTOU GRITANDO.");
  });

  it("debug inclui route, intent, providerUsed e timeMs", async () => {
    mockSmartRouter.mockReturnValue(
      makeLocalResponse({
        response: {
          reply: "ok",
          voiceReply: "ok.",
          action: "none",
          confidence: 1,
        },
      })
    );

    const result = await mod.reason("oi");

    expect(result.timeMs).toBeGreaterThanOrEqual(0);
    expect(result.route).toBe("local");
    expect(result.intent).toBe("smalltalk");
    expect(result.providerUsed).toBe("smart-router");
  });

  it("pergunta contextual usa buildSessionContext", async () => {
    mockSmartRouter.mockReturnValue(makeApiRoute());
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockAnswerFromBrain.mockResolvedValue(null);
    mockBuildSessionContext.mockResolvedValue({
      profile: { userName: "Teste" },
      dailyInsight: null,
      patterns: {},
      recentRecords: [],
      relevantBrainItems: [],
      semanticResults: [],
      currentDateTime: new Date().toISOString(),
      systemState: { totalRecords: 5, pendingTasks: 2, todayExpenses: 0 },
    });
    mockBuildContextDebug.mockReturnValue({
      contextUsed: true,
      recentRecordsUsed: 0,
      brainItemsUsed: 0,
      semanticResultsUsed: 0,
      profileUsed: true,
      dailyInsightUsed: false,
    });
    mockBuildSystemPrompt.mockReturnValue("system prompt with profile");
    mockBuildQueryPrompt.mockReturnValue("query prompt");
    mockCallWithFallback.mockResolvedValue({
      text: JSON.stringify({
        reply: "Resposta contextual.",
        voiceReply: "Resposta.",
        action: "none",
        confidence: 0.85,
      }),
      providerUsed: "gemini",
      ollamaAvailable: false,
      route: "gemini",
    });

    const result = await mod.reason("qual meu foco neste semestre?");

    expect(result.route).toBe("llm");
    expect(mockBuildSessionContext).toHaveBeenCalled();
    expect(mockBuildContextDebug).toHaveBeenCalled();
  });
});

describe("integração com agent.ts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGenerateId.mockReturnValue("test-id-123");
    mockGetMemory.mockReturnValue({
      addMessage: vi.fn(),
      formatConversationContext: vi.fn(() => ""),
      getHistory: vi.fn(() => []),
    });
    mockResolveRelativeDatePtBR.mockReturnValue(null);
    await loadModule();
  });

  it("agent.ts mantém contrato antigo via reasonResult", async () => {
    mockSmartRouter.mockReturnValue(
      makeLocalResponse({
        response: {
          reply: "Olá! Como posso ajudar?",
          voiceReply: "Olá! Como posso ajudar?",
          action: "none",
          record: null,
          confidence: 1,
          fallbackUsed: false,
        },
      })
    );

    const result = await mod.reason("oi");

    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("voiceReply");
    expect(result).toHaveProperty("intent");
    expect(result).toHaveProperty("actionsExecuted");
    expect(result).toHaveProperty("nextSteps");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("providerUsed");
    expect(result).toHaveProperty("route");
    expect(result).toHaveProperty("timeMs");

    expect(typeof result.text).toBe("string");
    expect(typeof result.voiceReply).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(Array.isArray(result.actionsExecuted)).toBe(true);
    expect(Array.isArray(result.nextSteps)).toBe(true);
    expect(typeof result.timeMs).toBe("number");
  });
});

describe("Aion Latency optimizations & instrumentation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGenerateId.mockReturnValue("test-id-123");
    mockGetMemory.mockReturnValue({
      addMessage: vi.fn(),
      formatConversationContext: vi.fn(() => ""),
      getHistory: vi.fn(() => []),
    });
    mockResolveRelativeDatePtBR.mockReturnValue(null);
    await loadModule();
  });

  it("retorna rápido para local fast paths de criação de tarefa sem chamar LLM", async () => {
    // Para 'criar tarefa', o smartRouter retorna a rota local
    const localRes = makeLocalResponse({
      response: {
        reply: "Tarefa registrada localmente",
        voiceReply: "Tarefa registrada.",
        action: "create_record",
        record: { type: "task", title: "estudar física" },
        confidence: 0.9,
      }
    });
    mockSmartRouter.mockReturnValue(localRes);

    const result = await mod.reason("criar tarefa estudar física");

    expect(result.route).toBe("local");
    expect(result.actionsExecuted).toContain("create_record");
    expect(result.debug?.latencyMetrics).toBeDefined();
    expect(result.debug?.latencyMetrics?.smartRouterMs).toBeLessThanOrEqual(50);
    expect(mockCallWithFallback).not.toHaveBeenCalled();
  });

  it("smalltalk pula a busca semântica pesada", async () => {
    mockSmartRouter.mockReturnValue(makeApiRoute());
    mockRetrieveRelevantBrainContext.mockResolvedValue([]);
    mockBuildSessionContext.mockResolvedValue({
      profile: null,
      dailyInsight: null,
      patterns: {},
      recentRecords: [],
      relevantBrainItems: [],
      semanticResults: [],
      currentDateTime: new Date().toISOString(),
      systemState: { totalRecords: 0, pendingTasks: 0, todayExpenses: 0 },
    });
    mockBuildContextDebug.mockReturnValue({});
    mockBuildSystemPrompt.mockReturnValue("system");
    mockBuildQueryPrompt.mockReturnValue("query");
    mockCallWithFallback.mockResolvedValue({
      text: JSON.stringify({ reply: "olá amigo", voiceReply: "olá", action: "none", confidence: 0.9 }),
      providerUsed: "mock-llm",
    });

    const result = await mod.reason("oi tudo bem");

    expect(result.intent).toBe("smalltalk");
    // smalltalk pula retrieveRelevantBrainContext se options?.brainContextFromClient não for passado
    expect(mockRetrieveRelevantBrainContext).not.toHaveBeenCalled();
    expect(result.debug?.latencyMetrics?.semanticSearchMs).toBe(0);
  });

  it("métricas do Aion não salvam conteúdo sensível do input", async () => {
    const localRes = makeLocalResponse({
      response: { reply: "Entendido", voiceReply: "Entendido.", action: "none", confidence: 1 }
    });
    mockSmartRouter.mockReturnValue(localRes);

    const result = await mod.reason("salvar senha secreta 123");

    const metrics = result.debug?.latencyMetrics;
    expect(metrics).toBeDefined();
    // Nenhuma propriedade nas métricas deve guardar o texto
    expect(JSON.stringify(metrics)).not.toContain("senha secreta 123");
  });

  describe("P6.10 Understanding Layer Integration", () => {
    it("adiciona understanding debug no resultado", async () => {
      mockSmartRouter.mockReturnValue(makeApiRoute());
      mockCallWithFallback.mockResolvedValue({
        text: JSON.stringify({ reply: "resposta", voiceReply: "voz", action: "none", confidence: 0.9 }),
        providerUsed: "mock-llm",
      });

      const result = await mod.reason("o que é PWA?");

      expect(result.debug?.understandingIntent).toBeDefined();
      expect(result.debug?.routeHint).toBeDefined();
      expect(result.debug?.understandingConfidence).toBeDefined();
      expect(result.debug?.extractedEntities).toBeDefined();
      expect(result.debug?.shouldUseWeb).toBeDefined();
      expect(result.debug?.shouldUseLLM).toBeDefined();
    });

    it("Learning Engine não intercepta tarefa simples (routeHint: smart_router)", async () => {
      mockSmartRouter.mockReturnValue(makeLocalResponse({
        response: {
          reply: "Tarefa registrada: \"Comprar pão\".",
          voiceReply: "Tarefa registrada.",
          action: "create_record",
          record: { type: "task", title: "Comprar pão" },
          confidence: 0.9,
        },
      }));

      const result = await mod.reason("me lembra de comprar pão amanhã");

      expect(result.debug?.routeHint).toBe("smart_router");
      expect(result.route).toBe("local");
      expect(result.actionsExecuted).toContain("create_record");
      expect(mockCallWithFallback).not.toHaveBeenCalled();
    });

    it("Official Doctrine tem prioridade sobre LLM e inclui understanding", async () => {
      const result = await mod.reason("o Obsidian é o banco principal?");

      expect(result.debug?.routeHint).toBe("official_doctrine");
      expect(result.debug?.understandingIntent).toBe("ask_project_doctrine");
      expect(result.providerUsed).toBe("official-doctrine");
      expect(mockCallWithFallback).not.toHaveBeenCalled();
    });

    it("save_memory inclui routeHint e understandingIntent", async () => {
      mockSaveMemory.mockResolvedValue({ id: "id" });

      const result = await mod.reason("salve que eu gosto de pizza");

      expect(result.debug?.routeHint).toBe("smart_router");
      expect(result.debug?.understandingIntent).toBe("save_memory");
      expect(result.intent).toBe("memory");
      expect(mockSaveMemory).toHaveBeenCalled();
    });
  });
});
