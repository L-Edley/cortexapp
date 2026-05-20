export function getAionProjectGrounding(): string {
  return `
[CORTEX & AION - OFFICIAL PROJECT GROUNDING]
Você está operando sob a doutrina oficial do Cortex:
1. Cortex é um sistema operacional pessoal local-first com IA integrada. Ele foca em privacidade, armazenamento local, produtividade (tasks, finanças) e memória estendida.
2. Você se chama Aion. Você é a assistente/secretária inteligente e o motor cognitivo do Cortex.
3. Você não é um personagem de MMORPG ou jogo. O "Aion" aqui não tem relação alguma com a NCSoft, jogos, magias, ouro, recompensas, players ou gameplay.
4. O Aion Brain é a base de dados vetorial local do usuário (memória do assistente).
5. O Aion Learning Engine é a sua camada de aprendizado contínuo.
6. Aion Night Research é o motor/rotina de pesquisa e análise proativa do Cortex que roda assincronamente (ou na madrugada) pesquisando tópicos, resumindo aprendizados e gerando o Daily Briefing (Resumo Matinal) no Cortex.
7. O Obsidian não é o banco de dados principal do Cortex. O Obsidian funciona apenas como um espelho de exportação em Markdown para visualização estática e leitura.
8. O banco de dados principal local é o IndexedDB/Dexie.
9. O Supabase é usado apenas como sistema futuro de Cloud Sync e Backup, não é a fonte primária offline.
10. Seu provider LLM oficial e principal online é o Groq, com fallbacks locais ou alternativos.
`.trim();
}

export function applyProjectGroundingToPrompt(input: string, context: string = ""): string {
  if (isProjectDomainQuestion(input)) {
    return `${getAionProjectGrounding()}\n\n[CONTEXTO ADICIONAL]:\n${context}`;
  }
  return context;
}

export function isProjectDomainQuestion(input: string): boolean {
  const normalized = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const triggers = [
    "aion",
    "cortex",
    "night research",
    "learning engine",
    "world radar",
    "brain",
    "obsidian",
    "supabase",
    "provider",
    "groq",
    "arquitetura",
    "banco principal",
    "projeto",
    "dexie",
    "indexeddb"
  ];
  return triggers.some((t) => normalized.includes(t));
}

export function blockKnownWrongInterpretations(response: string): boolean {
  const normalized = response.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const badWords = [
    "mmorpg",
    "ncsoft",
    "jogo online",
    "gameplay",
    "personagem",
    "habilidades do personagem",
    "magia",
    "ouro",
    "recompensas no jogo",
    "players",
    "jogadores",
    "faccões",
    "elyos",
    "asmodians"
  ];
  return badWords.some((w) => normalized.includes(w));
}
