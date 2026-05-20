import { saveKnowledge, getKnowledge, deleteKnowledge } from "@/lib/aion/brain/knowledge";
import { getLocalStorage, setLocalStorage, removeLocalStorage } from "@/lib/settings";
import { isBrainAvailable } from "@/lib/aion/brain/brainStore";
import type { AionBrainItem } from "@/lib/aion/brain/types";

// Chave utilizada no localStorage
export const KNOWLEDGE_SEED_FLAG = "aion_knowledge_seeded";

/**
 * Retorna o conjunto inicial de conhecimentos/regras (semente) do Aion
 */
export function getDefaultKnowledgeSeed(): AionBrainItem[] {
  const now = new Date().toISOString();
  
  return [
    {
      id: "seed-cortex-identity",
      type: "project_context",
      title: "Identidade do Cortex",
      content: "Cortex é um sistema operacional pessoal local-first com inteligência artificial nativa, focado em privacidade, velocidade e produtividade do usuário.",
      tags: ["cortex", "strategy"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-aion-identity",
      type: "project_context",
      title: "Identidade do Aion",
      content: "Aion é a secretária/assistente inteligente e estratégica do Cortex. Ela se comunica de forma direta, natural e premium, ajudando a planejar e organizar a vida pessoal e financeira do usuário.",
      tags: ["cortex", "aion-behavior"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-architecture",
      type: "project_context",
      title: "Arquitetura oficial do Cortex",
      content: "A arquitetura oficial atual do Cortex é local-first e mobile-first, com interface altamente responsiva. O processamento de dados e busca híbrida acontecem no próprio cliente.",
      tags: ["architecture", "strategy"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-stack",
      type: "project_context",
      title: "Stack Principal do Cortex",
      content: "A stack principal do Cortex utiliza Next.js (React 19, TypeScript), Dexie.js (IndexedDB local), estilização com Vanilla CSS e embeddings de IA rodando localmente via Hugging Face Transformers.",
      tags: ["architecture", "strategy"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-providers",
      type: "project_context",
      title: "IA Providers e Smart Router do Aion",
      content: "Groq é o provider online principal do Aion para respostas de LLM. OpenCode, OpenRouter, NVIDIA e Gemini funcionam como fallback automáticos. Ollama é opcional e local, não obrigatório. Para comandos simples e saudações, o Aion utiliza o Smart Router local.",
      tags: ["providers", "architecture"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-offline-first",
      type: "project_context",
      title: "Estratégia Offline-first",
      content: "O app é mobile-first e deve funcionar perfeitamente offline no celular. O IndexedDB/Dexie é a base local atual que armazena todas as tarefas, gastos, ideias e o próprio Brain. O SQLite será considerado para o app nativo futuro.",
      tags: ["offline-first", "strategy", "architecture"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-supabase",
      type: "project_context",
      title: "Estratégia Supabase",
      content: "O Supabase é documentado apenas como base online secundária para backup e sincronização em nuvem futuramente (Supabase Foundation). Nenhuma operação crítica ou em tempo real do app ou do Aion depende dele para leitura ou escrita primária.",
      tags: ["supabase", "strategy", "architecture"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-obsidian",
      type: "project_context",
      title: "Estratégia Obsidian",
      content: "O Obsidian funciona apenas como um espelho e adaptador de exportação de arquivos Markdown. Ele não é um backend obrigatório e o Cortex não depende dele para funcionar no dia a dia.",
      tags: ["obsidian", "strategy", "architecture"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-aion-behavior",
      type: "project_context",
      title: "Regras de Comportamento do Aion",
      content: "O Aion deve se comunicar como uma secretária real, usando memória semântica para contexto e Smart Router para comandos simples. Deve buscar na web somente quando a informação for volátil, atual ou desconhecida. Deve ser direto, estratégico e natural. Deve salvar aprendizados úteis, mas evitar salvar informações voláteis.",
      tags: ["aion-behavior", "cortex"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "seed-what-not-to-do",
      type: "project_context",
      title: "O que o Aion nunca deve fazer",
      content: "O Aion nunca deve usar respostas robóticas como 'Comando executado', 'Solicitação processada' ou 'Registro criado com sucesso'. Também nunca deve dizer 'até meu conhecimento' ou 'meu conhecimento vai até' e nunca deve responder em ALL CAPS ou encerrar toda resposta com 'deseja algo mais?'.",
      tags: ["aion-behavior"],
      source: "system_seed",
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    }
  ];
}

/**
 * Retorna true se a base já tiver sido seedada
 */
export function hasSeededAionKnowledge(): boolean {
  return getLocalStorage(KNOWLEDGE_SEED_FLAG) === "true";
}

/**
 * Executa o seeding inicial salvando e indexando a semente de conhecimento no Aion Brain
 */
export async function seedAionKnowledgeBase(): Promise<boolean> {
  if (!isBrainAvailable()) {
    return false;
  }
  
  if (hasSeededAionKnowledge()) {
    return true;
  }
  
  try {
    const seeds = getDefaultKnowledgeSeed();
    
    // Para cada item, salvar no Aion Brain (knowledge table)
    // saveKnowledge automaticamente indexa no semanticIndex via indexBrainItemInBackground se não for sensível
    for (const seed of seeds) {
      await saveKnowledge(seed);
    }
    
    setLocalStorage(KNOWLEDGE_SEED_FLAG, "true");
    console.log("[KNOWLEDGE_SEED] Aion Knowledge Base seeded successfully!");
    return true;
  } catch (err) {
    console.error("[KNOWLEDGE_SEED] Erro ao seedar semente de conhecimento do Aion:", err);
    return false;
  }
}

/**
 * Reseta o estado do seeding inicial, removendo a flag e deletando os itens seedados
 */
export async function resetAionKnowledgeSeed(): Promise<boolean> {
  removeLocalStorage(KNOWLEDGE_SEED_FLAG);
  
  if (!isBrainAvailable()) {
    return true;
  }
  
  try {
    const currentKnowledge = await getKnowledge();
    const seedItems = currentKnowledge.filter(item => item.source === "system_seed");
    
    for (const item of seedItems) {
      await deleteKnowledge(item.id);
    }
    
    console.log("[KNOWLEDGE_SEED] Aion Knowledge Seed has been reset.");
    return true;
  } catch (err) {
    console.error("[KNOWLEDGE_SEED] Erro ao resetar semente de conhecimento do Aion:", err);
    return false;
  }
}
