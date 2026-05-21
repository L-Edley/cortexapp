import { describe, it, expect } from "vitest";
import { understandAionRequest, detectAmbiguity, extractEntities } from "../aionRequestUnderstanding";

describe("understandAionRequest", () => {
  describe("1. Comando pessoal explícito → smart_router", () => {
    it("entende 'me lembra de pagar internet amanhã' como create_task", () => {
      const result = understandAionRequest("me lembra de pagar internet amanhã");

      expect(result.primaryIntent).toBe("create_task");
      expect(result.routeHint).toBe("smart_router");
      expect(result.shouldUseLLM).toBe(false);
      expect(result.shouldUseWeb).toBe(false);
      expect(result.entities.some(e => e.type === "task_title" && e.value === "Pagar internet")).toBe(true);
      expect(result.entities.some(e => e.type === "date" && (e.value === "amanhã" || e.value === "amanha"))).toBe(true);
    });

    it("limpa título da tarefa (remove data do final)", () => {
      const result = understandAionRequest("me lembra de comprar pão amanhã");

      expect(result.primaryIntent).toBe("create_task");
      const title = result.entities.find(e => e.type === "task_title");
      expect(title).toBeDefined();
      expect(title!.value).toBe("Comprar pão");
      expect(title!.value).not.toContain("amanh");
    });

    it("entende 'gastei 50 reais em café' como create_expense", () => {
      const result = understandAionRequest("gastei 50 reais em café");

      expect(result.primaryIntent).toBe("create_expense");
      expect(result.routeHint).toBe("smart_router");
      expect(result.shouldUseLLM).toBe(false);
      expect(result.entities.some(e => e.type === "money")).toBe(true);
    });

    it("entende 'salve que sou desenvolvedor' como save_memory", () => {
      const result = understandAionRequest("salve que sou desenvolvedor");

      expect(result.primaryIntent).toBe("save_memory");
      expect(result.routeHint).toBe("smart_router");
      expect(result.shouldSaveMemory).toBe(true);
      expect(result.shouldUseWeb).toBe(false);
      expect(result.shouldUseLLM).toBe(false);
    });

    it("entende 'anote que a prioridade do Cortex é offline' como save_memory", () => {
      const result = understandAionRequest("anote que a prioridade do Cortex é funcionar bem offline no celular");

      expect(result.primaryIntent).toBe("save_memory");
      expect(result.routeHint).toBe("smart_router");
      expect(result.shouldSaveMemory).toBe(true);
      expect(result.shouldUseWeb).toBe(false);
    });

    it("entende 'registra que hoje é terça' como save_memory", () => {
      const result = understandAionRequest("registra que hoje é terça");

      expect(result.primaryIntent).toBe("save_memory");
      expect(result.routeHint).toBe("smart_router");
      expect(result.entities.some(e => e.type === "date")).toBe(true);
    });

    it("não aplica freshness warning em save_memory (shouldUseWeb=false)", () => {
      const result = understandAionRequest("salve que eu gosto de pizza");

      expect(result.shouldUseWeb).toBe(false);
      expect(result.shouldUseLLM).toBe(false);
      expect(result.primaryIntent).toBe("save_memory");
    });
  });

  describe("2. Doutrina oficial → official_doctrine", () => {
    it("entende pergunta sobre Obsidian como ask_project_doctrine", () => {
      const result = understandAionRequest("o Obsidian é o banco principal?");

      expect(result.primaryIntent).toBe("ask_project_doctrine");
      expect(result.routeHint).toBe("official_doctrine");
      expect(result.shouldUseLLM).toBe(false);
      expect(result.shouldUseWeb).toBe(false);
    });

    it("entende pergunta sobre Groq como ask_project_doctrine", () => {
      const result = understandAionRequest("qual provider principal do Aion?");

      expect(result.primaryIntent).toBe("ask_project_doctrine");
      expect(result.routeHint).toBe("official_doctrine");
    });

    it("entende 'arquitetura oficial' como doutrina", () => {
      const result = understandAionRequest("qual é a arquitetura oficial do Cortex?");

      expect(result.primaryIntent).toBe("ask_project_doctrine");
      expect(result.routeHint).toBe("official_doctrine");
    });

    it("entende 'prioridade atual' como doutrina", () => {
      const result = understandAionRequest("qual é a prioridade atual do Cortex?");

      expect(result.primaryIntent).toBe("ask_project_doctrine");
      expect(result.routeHint).toBe("official_doctrine");
    });

    it("Official Doctrine tem prioridade sobre LLM", () => {
      const result = understandAionRequest("o Obsidian é o banco principal?");

      expect(result.shouldUseLLM).toBe(false);
      expect(result.shouldUseWeb).toBe(false);
      expect(result.routeHint).toBe("official_doctrine");
    });
  });

  describe("3. Ação por voz/contexto → voice_action", () => {
    it("entende 'transforma isso em tarefas' como voice_action", () => {
      const result = understandAionRequest("transforma isso em tarefas");

      expect(result.primaryIntent).toBe("voice_action");
      expect(result.routeHint).toBe("voice_action");
      expect(result.shouldUseLLM).toBe(true);
    });

    it("extrai action_reference de 'transforma isso em tarefas'", () => {
      const result = understandAionRequest("transforma isso em tarefas");

      expect(result.entities.some(e => e.type === "action_reference" && e.value === "isso")).toBe(true);
    });

    it("entende 'aceita esse plano' como voice_action", () => {
      const result = understandAionRequest("aceita esse plano");

      expect(result.primaryIntent).toBe("voice_action");
      expect(result.routeHint).toBe("voice_action");
    });

    it("entende 'continua de onde paramos' como voice_action", () => {
      const result = understandAionRequest("continua de onde paramos");

      expect(result.primaryIntent).toBe("voice_action");
      expect(result.routeHint).toBe("voice_action");
    });

    it("entende 'aprova só a primeira' como voice_action", () => {
      const result = understandAionRequest("aprova só a primeira");

      expect(result.primaryIntent).toBe("voice_action");
      expect(result.routeHint).toBe("voice_action");
    });
  });

  describe("4. Informação atual/volátil → web_research", () => {
    it("entende 'quais notícias de IA agents' como ask_web_research", () => {
      const result = understandAionRequest("quais notícias de IA agents podem impactar o Cortex?");

      expect(result.primaryIntent).toBe("ask_web_research");
      expect(result.routeHint).toBe("web_research");
      expect(result.shouldUseWeb).toBe(true);
    });

    it("entende 'cotação do dólar hoje' como web_research", () => {
      const result = understandAionRequest("cotação do dólar hoje");

      expect(result.primaryIntent).toBe("ask_web_research");
      expect(result.routeHint).toBe("web_research");
      expect(result.shouldUseWeb).toBe(true);
    });

    it("entende 'lançamento do Next.js' como web_research", () => {
      const result = understandAionRequest("quais os lançamentos do Next.js?");

      expect(result.primaryIntent).toBe("ask_web_research");
      expect(result.routeHint).toBe("web_research");
      expect(result.shouldUseWeb).toBe(true);
    });

    it("entende 'tendências de front-end' como web_research", () => {
      const result = understandAionRequest("quais as tendências de front-end?");

      expect(result.primaryIntent).toBe("ask_web_research");
      expect(result.routeHint).toBe("web_research");
      expect(result.shouldUseWeb).toBe(true);
    });
  });

  describe("5. Estratégia/projeto → learning_engine", () => {
    it("entende 'como estruturar Night Research' como ask_strategy", () => {
      const result = understandAionRequest("como estruturar o Night Research do Aion?");

      expect(result.primaryIntent).toBe("ask_strategy");
      expect(result.routeHint).toBe("learning_engine");
      expect(result.shouldUseLLM).toBe(true);
    });

    it("entende 'qual melhor próximo passo' como ask_strategy", () => {
      const result = understandAionRequest("qual o melhor próximo passo para o projeto?");

      expect(result.primaryIntent).toBe("ask_strategy");
      expect(result.routeHint).toBe("learning_engine");
    });

    it("entende 'o que você acha de usar Dexie' como ask_strategy", () => {
      const result = understandAionRequest("o que você acha de usar Dexie como banco local?");

      expect(result.primaryIntent).toBe("ask_strategy");
      expect(result.routeHint).toBe("learning_engine");
    });

    it("entende 'como eu deveria organizar' como ask_strategy", () => {
      const result = understandAionRequest("como eu deveria organizar o módulo de agenda?");

      expect(result.primaryIntent).toBe("ask_strategy");
      expect(result.routeHint).toBe("learning_engine");
    });
  });

  describe("6. Conversa casual → local_conversation", () => {
    it("entende 'bom dia' como casual_chat", () => {
      const result = understandAionRequest("bom dia");

      expect(result.primaryIntent).toBe("casual_chat");
      expect(result.routeHint).toBe("local_conversation");
      expect(result.shouldUseLLM).toBe(false);
    });

    it("entende 'obrigado' como casual_chat", () => {
      const result = understandAionRequest("obrigado");

      expect(result.primaryIntent).toBe("casual_chat");
      expect(result.routeHint).toBe("local_conversation");
    });

    it("entende 'sim' como casual_chat", () => {
      const result = understandAionRequest("sim");

      expect(result.primaryIntent).toBe("casual_chat");
      expect(result.routeHint).toBe("local_conversation");
    });
  });

  describe("7. Ambiguidade e fallback", () => {
    it("entrada vazia retorna unknown", () => {
      const result = understandAionRequest("");

      expect(result.primaryIntent).toBe("unknown");
      expect(result.routeHint).toBe("llm");
    });

    it("entrada muito curta e desconhecida gera clarification", () => {
      const result = understandAionRequest("x");

      expect(result.primaryIntent).toBe("clarification");
      expect(result.shouldAskClarification).toBe(true);
      expect(result.clarificationQuestion).toBeDefined();
    });

    it("'isso' isolado gera pedido de clarificação", () => {
      const result = understandAionRequest("isso");

      expect(result.primaryIntent).toBe("clarification");
      expect(result.shouldAskClarification).toBe(true);
    });

    it("frase desconhecida de 2+ palavras vai para llm", () => {
      const result = understandAionRequest("alguma coisa qualquer");

      expect(result.primaryIntent).toBe("unknown");
      expect(result.routeHint).toBe("llm");
      expect(result.shouldUseLLM).toBe(true);
    });
  });

  describe("8. Regras de proteção contra interceptação", () => {
    it("Learning Engine não intercepta tarefa simples", () => {
      const result = understandAionRequest("me lembra de pagar internet amanhã");

      expect(result.routeHint).toBe("smart_router");
      expect(result.primaryIntent).toBe("create_task");
    });

    it("Web Research não intercepta memória pessoal", () => {
      const result = understandAionRequest("salve que eu gosto de pizza");

      expect(result.routeHint).toBe("smart_router");
      expect(result.primaryIntent).toBe("save_memory");
      expect(result.shouldUseWeb).toBe(false);
    });

    it("Official Doctrine tem prioridade sobre LLM mesmo em pergunta", () => {
      const result = understandAionRequest("o Obsidian é o banco principal?");

      expect(result.routeHint).toBe("official_doctrine");
      expect(result.shouldUseLLM).toBe(false);
    });

    it("comando 'gastei' não vai para web research", () => {
      const result = understandAionRequest("gastei 50 reais em café");

      expect(result.routeHint).toBe("smart_router");
      expect(result.primaryIntent).toBe("create_expense");
      expect(result.shouldUseWeb).toBe(false);
    });
  });

  describe("9. Entidades e extração", () => {
    it("extrai entidades de data corretamente", () => {
      const entities = extractEntities("pagar internet amanhã", "create_task");

      expect(entities.some(e => e.type === "date" && (e.value === "amanhã" || e.value === "amanha"))).toBe(true);
    });

    it("extrai entidades de dinheiro corretamente", () => {
      const entities = extractEntities("gastei 50 reais em café", "create_expense");

      expect(entities.some(e => e.type === "money")).toBe(true);
    });

    it("extrai entidades de projeto corretamente", () => {
      const entities = extractEntities("como estruturar o Aion?", "ask_strategy");

      expect(entities.some(e => e.type === "project" && e.value === "aion")).toBe(true);
    });

    it("extrai entidades de tópico para web research", () => {
      const entities = extractEntities("quais as novidades sobre IA agents?", "ask_web_research");

      expect(entities.some(e => e.type === "topic")).toBe(true);
    });
  });

  describe("10. detectAmbiguity", () => {
    it("detecta ambiguidade em input muito curto", () => {
      const result = detectAmbiguity("x", "unknown");
      expect(result.ambiguous).toBe(true);
    });

    it("detecta 'isso' como ambíguo", () => {
      const result = detectAmbiguity("isso", "unknown");
      expect(result.ambiguous).toBe(true);
    });

    it("não detecta ambiguidade em frase normal", () => {
      const result = detectAmbiguity("como estruturar o Night Research?", "ask_strategy");
      expect(result.ambiguous).toBe(false);
    });
  });

  describe("11. routeHint correto para cada caso", () => {
    const cases: Array<{ input: string; expectedRoute: string; expectedIntent: string }> = [
      { input: "me lembra de comprar pão", expectedRoute: "smart_router", expectedIntent: "create_task" },
      { input: "gastei 30 reais em uber", expectedRoute: "smart_router", expectedIntent: "create_expense" },
      { input: "salve que sou dev", expectedRoute: "smart_router", expectedIntent: "save_memory" },
      { input: "o Obsidian é o banco principal?", expectedRoute: "official_doctrine", expectedIntent: "ask_project_doctrine" },
      { input: "transforma isso em tarefas", expectedRoute: "voice_action", expectedIntent: "voice_action" },
      { input: "quais as novidades sobre IA?", expectedRoute: "web_research", expectedIntent: "ask_web_research" },
      { input: "como estruturar o Night Research?", expectedRoute: "learning_engine", expectedIntent: "ask_strategy" },
      { input: "bom dia", expectedRoute: "local_conversation", expectedIntent: "casual_chat" },
    ];

    for (const { input, expectedRoute, expectedIntent } of cases) {
      it(`"${input}" → routeHint: ${expectedRoute}, intent: ${expectedIntent}`, () => {
        const result = understandAionRequest(input);
        expect(result.routeHint).toBe(expectedRoute as any);
        expect(result.primaryIntent).toBe(expectedIntent as any);
      });
    }
  });
});
