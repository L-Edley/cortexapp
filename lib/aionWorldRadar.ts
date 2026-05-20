import { getEnabledResearchTopics, shouldCheckTopic, updateResearchTopic, type AionResearchTopic } from "./aionResearchTopics";
import { askProviderForLearning, learnFromProviderResponse, classifyProviderLearning } from "./aionLearningEngine";

export interface WorldRadarOptions {
  forceAll?: boolean;
  maxTopics?: number;
}

export interface WorldRadarResult {
  topicId: string;
  success: boolean;
  learningSaved: boolean;
  learningType?: string;
  error?: string;
}

/**
 * Roda o radar para os tópicos pendentes ou forçados.
 */
export async function runWorldRadar(options?: WorldRadarOptions): Promise<WorldRadarResult[]> {
  const enabled = getEnabledResearchTopics();
  const toCheck = options?.forceAll ? enabled : enabled.filter(shouldCheckTopic);

  const limit = options?.maxTopics || 3; // Evitar estourar limites gratuitos em um só disparo
  const sliced = toCheck.slice(0, limit);
  const results: WorldRadarResult[] = [];

  for (const topic of sliced) {
    const res = await researchTopic(topic);
    results.push(res);
  }

  return results;
}

/**
 * Pesquisa individual de um tópico de interesse.
 */
export async function researchTopic(topic: AionResearchTopic): Promise<WorldRadarResult> {
  try {
    const systemPrompt = `Você é o analista de tendências do Cortex. 
Foco do Tópico: ${topic.title} (${topic.category}).
Forneça as novidades mais recentes, destaques e oportunidades de forma resumida e estratégica.
Não crie uma resposta excessivamente longa.`;

    const result = await askProviderForLearning(topic.query, systemPrompt);

    if (!result || !result.text) {
      return { topicId: topic.id, success: false, learningSaved: false, error: "Empty provider response" };
    }

    const summary = summarizeResearchResult(result.text);
    const needType = classifyLearningType(summary);

    const saved = await saveWorldLearning(topic.query, summary, needType);

    // Atualiza a data da última checagem independente de ter salvo ou não (para não engasgar)
    updateResearchTopic(topic.id, { lastCheckedAt: new Date().toISOString() });

    return {
      topicId: topic.id,
      success: true,
      learningSaved: saved,
      learningType: needType,
    };
  } catch (err: any) {
    return {
      topicId: topic.id,
      success: false,
      learningSaved: false,
      error: err?.message || "Unknown error",
    };
  }
}

/**
 * Opcionalmente sumariza para manter o Brain limpo. No radar atual, 
 * podemos delegar ao próprio tamanho restrito do LLM no prompt.
 */
export function summarizeResearchResult(result: string): string {
  // Poderíamos fazer outro passo com LLM, mas para salvar tokens usamos diretamente o texto 
  // já podado.
  return result.trim();
}

/**
 * Classifica a resposta do radar para direcionar ao armazenamento correto.
 */
export function classifyLearningType(content: string) {
  // Pelo contexto do radar, a maioria das coisas será trend ou fresh_info.
  // Vamos usar a mesma engine de classificação baseada na query original ou conteúdo.
  return classifyProviderLearning(content);
}

/**
 * Encapsula o salvamento usando as regras do engine de aprendizado.
 */
export async function saveWorldLearning(query: string, content: string, needType: any): Promise<boolean> {
  // Override para garantir que o radar gere outputs de tendência e estratégicos
  let finalType = needType;
  if (["ignore", "personal_memory", "already_known", "project_decision"].includes(needType)) {
    finalType = "trend"; // Força trend caso a classificação erre o tom do Radar
  }
  return await learnFromProviderResponse(query, content, finalType);
}
