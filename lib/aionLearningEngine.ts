import { callWithFallback } from "@/lib/aionLLM";
import { classifyLearningNeed, type LearningNeed } from "./aionKnowledgeGap";
import { applyProjectGroundingToPrompt, blockKnownWrongInterpretations, isProjectDomainQuestion } from "./aionProjectGrounding";
import { getOfficialDoctrineAnswer } from "./aionOfficialDoctrine";

export interface LearningEngineResult {
  reply: string;
  providerUsed: string;
  source: "cache" | "provider";
  learningSaved: boolean;
  learningType: LearningNeed;
  input: string;
}

export function classifyProviderLearning(input: string): LearningNeed {
  return classifyLearningNeed(input);
}

export async function askProviderForLearning(input: string, contextPrompt: string) {
  return await callWithFallback(input, contextPrompt);
}

export async function runLearningEngine(
  input: string,
  context?: string,
  options?: any
): Promise<LearningEngineResult | null> {
  const needType = classifyProviderLearning(input);

  // 1. Chamar provider
  let systemPrompt = `Você é o motor de pesquisa profunda do Cortex. Forneça respostas diretas, ricas e precisas. ${context || ""}`;

  if (needType === "trend" && isProjectDomainQuestion(input)) {
    systemPrompt += `\nDiretriz: Ao falar de tendências (ex: IA agents), aplique-as DIRETAMENTE ao ecossistema do Cortex (um OS pessoal local-first). Relacione com impactos reais como: agentes com memória persistente, agentes proativos, tool use, multimodal/voz, local-first + cloud sync, personal AI OS, e automação com aprovação humana.`;
  }

  const finalPrompt = applyProjectGroundingToPrompt(input, systemPrompt);
  const result = await askProviderForLearning(input, finalPrompt);

  if (!result || !result.text) {
    return null;
  }

  // Adicionar regra anti-confusão (MMORPG)
  if (isProjectDomainQuestion(input) && blockKnownWrongInterpretations(result.text)) {
    const doctrine = getOfficialDoctrineAnswer(input);
    if (doctrine) {
      return {
        reply: doctrine.reply,
        providerUsed: "official-doctrine-fallback",
        source: "cache",
        learningSaved: false, // fallback nativo não precisa ser salvo
        learningType: "already_known",
        input
      };
    }
    return {
      reply: "O Night Research do Aion deve ser estruturado como uma rotina proativa do Cortex: analisar registros do dia anterior, pesquisar tópicos monitorados, salvar aprendizados no Brain e gerar um briefing estratégico no primeiro acesso do dia. (O Aion é a assistente inteligente do Cortex, não um jogo/MMORPG).",
      providerUsed: "grounding-guardrail",
      source: "cache",
      learningSaved: false,
      learningType: "already_known",
      input
    };
  }

  return {
    reply: result.text,
    providerUsed: result.providerUsed || "groq",
    source: "provider",
    learningSaved: false, // O Client será encarregado de efetuar o save se aplicável
    learningType: needType,
    input
  };
}
