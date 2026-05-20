export interface OfficialDoctrineAnswer {
  reply: string;
  voiceReply: string;
}

/**
 * Roteador estático para perguntas sobre a doutrina oficial do Cortex/Aion.
 * Retorna uma resposta homologada sem acionar a LLM ou busca web.
 */
export function getOfficialDoctrineAnswer(input: string): OfficialDoctrineAnswer | null {
  if (!input || typeof input !== "string" || input.trim().length === 0) {
    return null;
  }

  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  // 1. Obsidian como banco principal?
  if (
    normalized.includes("obsidian") &&
    (normalized.includes("banco principal") ||
      normalized.includes("banco de dados principal") ||
      normalized.includes("bd principal") ||
      normalized.includes("backend principal") ||
      normalized.includes("banco de dados oficial") ||
      normalized.includes("e o banco principal"))
  ) {
    return {
      reply:
        "Não. O Obsidian não é o banco principal do Cortex. Ele funciona como exportação/espelho Markdown. A base local atual é IndexedDB/Dexie, e o Supabase será usado futuramente para sincronização online.",
      voiceReply:
        "Não. O Obsidian não é o banco principal do Cortex. Ele funciona como exportação/espelho Markdown.",
    };
  }

  // 2. Qual provider principal do Aion?
  if (
    (normalized.includes("provider") || normalized.includes("provedor")) &&
    (normalized.includes("principal") || normalized.includes("do aion") || normalized.includes("groq"))
  ) {
    return {
      reply:
        "O provider online principal do Aion é Groq. OpenCode, OpenRouter, NVIDIA e Gemini ficam como fallback. Ollama é opcional/local.",
      voiceReply: "O provider online principal do Aion é Groq.",
    };
  }

  // 3. Qual é a prioridade atual do Cortex?
  if (
    normalized.includes("prioridade") &&
    (normalized.includes("atual") || normalized.includes("cortex") || normalized.includes("celular") || normalized.includes("offline"))
  ) {
    return {
      reply:
        "A prioridade atual do Cortex é funcionar bem offline no celular, com dados locais primeiro e sincronização cloud futura.",
      voiceReply: "A prioridade atual do Cortex é funcionar bem offline no celular.",
    };
  }

  // 4. Qual é a arquitetura oficial do Cortex?
  if (
    normalized.includes("arquitetura") &&
    (normalized.includes("oficial") || normalized.includes("cortex") || normalized.includes("local-first"))
  ) {
    return {
      reply:
        "O Cortex é local-first e mobile-first. A fonte local principal atual é IndexedDB/Dexie. Supabase será o banco central online futuro. Obsidian é exportação/espelho Markdown, não backend obrigatório.",
      voiceReply: "O Cortex é local-first e mobile-first.",
    };
  }

  // 5. Supabase
  if (normalized.includes("supabase")) {
    return {
      reply:
        "O Supabase é documentado apenas como base online secundária para backup e sincronização em nuvem futuramente. Nenhuma operação crítica depende dele atualmente.",
      voiceReply: "O Supabase é para backup e sincronização em nuvem futuros.",
    };
  }

  // 6. IndexedDB / Dexie
  if (normalized.includes("indexeddb") || normalized.includes("dexie")) {
    return {
      reply:
        "O IndexedDB com a biblioteca Dexie.js é a fonte local de dados principal do Cortex atual, armazenando tarefas, gastos, ideias e o Brain.",
      voiceReply: "Dexie e IndexedDB são a fonte de dados principal do Cortex.",
    };
  }

  // 7. Fallbacks de IA
  if (normalized.includes("fallback")) {
    return {
      reply:
        "Os fallbacks de IA do Aion são OpenCode, OpenRouter, NVIDIA e Gemini, que entram em ação automaticamente se o provider principal (Groq) falhar.",
      voiceReply: "OpenCode, OpenRouter, NVIDIA e Gemini são os fallbacks de IA.",
    };
  }

  // 8. Ollama
  if (normalized.includes("ollama")) {
    return {
      reply:
        "O Ollama é uma opção opcional e local de IA para o Aion, não sendo obrigatório para o funcionamento do Cortex.",
      voiceReply: "O Ollama é opcional e local.",
    };
  }

  // 9. Regra de busca web
  if (
    normalized.includes("busca web") ||
    normalized.includes("pesquisa web") ||
    normalized.includes("regra de busca") ||
    normalized.includes("quando busca")
  ) {
    return {
      reply:
        "A busca web no Aion só deve ser usada quando a informação solicitada for volátil, atualizada ou desconhecida no conhecimento local.",
      voiceReply: "A busca web só é usada para informações voláteis ou desconhecidas.",
    };
  }

  // 10. Fase atual do projeto
  if (
    normalized.includes("fase") &&
    (normalized.includes("atual") || normalized.includes("projeto") || normalized.includes("status"))
  ) {
    return {
      reply:
        "Atualmente o Cortex está na fase de refinamento da camada de conversação humana, estabilidade de respostas e regras de doutrina oficial do Aion.",
      voiceReply: "Estamos refinando a conversação humana e a confiabilidade do Aion.",
    };
  }

  return null;
}
