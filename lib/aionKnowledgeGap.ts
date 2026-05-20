export type LearningNeed =
  | "already_known"
  | "personal_memory"
  | "project_decision"
  | "stable_knowledge"
  | "fresh_info"
  | "trend"
  | "strategic_analysis"
  | "ignore";

/**
 * Classifica a necessidade de aprendizado com base na entrada do usuário e no contexto.
 */
export function classifyLearningNeed(input: string, context?: any): LearningNeed {
  if (!input || input.trim().length === 0) return "ignore";

  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  // 1. Memória Pessoal explícita (tratada no roteador local de memória)
  if (/^(salve|salva|registre|registra|lembre|lembra|guarde|guarda|anote|anota)\s+(que|disso)\b/i.test(normalized)) {
    return "personal_memory";
  }

  // 2. Smalltalk e comandos básicos que o Smart Router já resolve
  if (/^(oi|ol[áa]|bom\s+dia|boa\s+tarde|boa\s+noite|opa|eae)/i.test(normalized) || normalized.length < 5) {
    return "ignore";
  }

  // 3. Tarefas, Gastos, Ideias (Smart Router resolve localmente)
  if (
    /^(me\s+lembr[ae]|tenho\s+(que|de)|preciso\s+(de|que)|gastei|paguei|custou|comprei)/i.test(normalized) ||
    /^ideia[\s:]/i.test(normalized)
  ) {
    return "ignore";
  }

  // 3.5 Doutrina Oficial (Sem necessidade de chamada, doctrine resolverá)
  if (
    (normalized.includes("obsidian") && normalized.includes("banco principal")) ||
    (normalized.includes("provider") && normalized.includes("principal"))
  ) {
    return "already_known";
  }

  // 4. Decisões do Usuário
  if (/\b(decidimos|optamos|vamos\s+usar|escolhemos|decisão\s+oficial)\b/i.test(normalized)) {
    return "project_decision";
  }

  // 5. Novidades, Notícias e Tendências
  if (/\b(novidades|tend[eê]ncias|futuro|noticias|agentes\s+de\s+ia|ia\s+agents)\b/i.test(normalized)) {
    return "trend";
  }

  // 6. Informação Fresca / Volátil (Cotação, Preço, Clima hoje, Hoje)
  if (/\b(hoje|agora|atual|pre[cç]o\s+atual|cota[cç][aã]o|valor\s+do|clima)\b/i.test(normalized)) {
    return "fresh_info";
  }

  // 7. Análise Estratégica
  if (/\b(como\s+estruturar|arquitetura|estrategia|estrat[eé]gia|design\s+system|fluxo\s+de|refatorar)\b/i.test(normalized)) {
    return "strategic_analysis";
  }

  // 8. Se for uma pergunta técnica genérica ou conceito, é stable_knowledge
  if (/\b(o\s+que\s+[eé]|como\s+funciona|qual\s+a\s+diferen[cç]a|explica|tutorial|passo\s+a\s+passo)\b/i.test(normalized)) {
    return "stable_knowledge";
  }

  // Qualquer outra frase pode precisar de LLM caso não seja respondida pela Doctrine,
  // mas começaremos de forma conservadora.
  return "stable_knowledge";
}

/**
 * Detecta se existe uma lacuna de conhecimento que exija uma chamada de API.
 */
export function detectKnowledgeGap(input: string, context?: any): boolean {
  const need = classifyLearningNeed(input, context);
  // already_known, personal_memory, e ignore não exigem o Learning Engine.
  return !["already_known", "personal_memory", "ignore"].includes(need);
}

/**
 * Determina se o Aion deve engajar o Learning Engine.
 */
export function shouldUseLearningEngine(input: string, context?: any): boolean {
  // Verificações adicionais de context podem ser colocadas aqui no futuro
  return detectKnowledgeGap(input, context);
}
