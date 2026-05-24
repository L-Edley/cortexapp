import { listResearchTopics, saveResearchTopic as coreSave, updateResearchTopicCore, deleteResearchTopic, shouldCheckTopicCore } from "@/lib/aion/coreProxy";
import type { CoreResearchTopic } from "@/lib/aion/coreProxy";

export interface AionResearchTopic {
  id: string;
  title: string;
  query: string;
  category: "cortex" | "tech" | "business" | "fitness" | "marketing" | "personal";
  priority: "low" | "medium" | "high";
  enabled: boolean;
  frequency: "daily" | "weekly" | "manual";
  lastCheckedAt?: string;
  tags: string[];
}

function mapCoreTopic(t: CoreResearchTopic): AionResearchTopic {
  return {
    id: t.id,
    title: t.title,
    query: t.query,
    category: t.category as AionResearchTopic["category"],
    priority: t.priority as AionResearchTopic["priority"],
    enabled: t.enabled,
    frequency: t.frequency as AionResearchTopic["frequency"],
    lastCheckedAt: t.lastCheckedAt,
    tags: t.tags,
  };
}

export function getDefaultResearchTopics(): AionResearchTopic[] {
  return [
    { id: "topic-ia-agents", title: "IA agents", query: "Novidades, tendências e novos frameworks de agentes de Inteligência Artificial", category: "tech", priority: "high", enabled: true, frequency: "weekly", tags: ["ai", "agents", "tech"] },
    { id: "topic-automation", title: "automação pessoal", query: "Melhores práticas e ferramentas de automação pessoal e produtividade", category: "personal", priority: "medium", enabled: true, frequency: "weekly", tags: ["productivity", "automation"] },
    { id: "topic-nextjs", title: "Next.js", query: "Atualizações, releases e melhores práticas de Next.js", category: "tech", priority: "medium", enabled: true, frequency: "weekly", tags: ["nextjs", "react", "frontend"] },
    { id: "topic-supabase", title: "Supabase", query: "Atualizações e releases do Supabase", category: "tech", priority: "low", enabled: true, frequency: "weekly", tags: ["supabase", "backend", "db"] },
    { id: "topic-local-first", title: "local-first apps", query: "Arquitetura e novidades sobre aplicações local-first e offline-first", category: "tech", priority: "high", enabled: true, frequency: "weekly", tags: ["local-first", "offline", "architecture"] },
    { id: "topic-pwa", title: "PWA offline", query: "Evolução e capacidades de Progressive Web Apps offline", category: "tech", priority: "medium", enabled: true, frequency: "weekly", tags: ["pwa", "mobile"] },
    { id: "topic-productivity", title: "produtividade/TDAH", query: "Técnicas de produtividade, organização e foco para mentes dispersas e TDAH", category: "personal", priority: "high", enabled: true, frequency: "weekly", tags: ["adhd", "productivity", "focus"] },
    { id: "topic-saas", title: "SaaS tools", query: "Novas ferramentas SaaS interessantes para negócios e desenvolvedores", category: "business", priority: "low", enabled: true, frequency: "weekly", tags: ["saas", "tools"] },
    { id: "topic-marketing", title: "marketing digital", query: "Tendências de marketing digital e SEO para produtos indie", category: "marketing", priority: "medium", enabled: true, frequency: "weekly", tags: ["marketing", "seo"] },
    { id: "topic-fitness", title: "fitness SaaS", query: "Novidades tecnológicas e aplicativos no setor de fitness", category: "fitness", priority: "low", enabled: true, frequency: "weekly", tags: ["fitness", "saas"] },
    { id: "topic-natuforce", title: "NatuForce OS", query: "Referências de mercado para gerenciamento de suplementos e saúde natural", category: "business", priority: "medium", enabled: true, frequency: "weekly", tags: ["natuforce", "health"] },
    { id: "topic-cortex", title: "Cortex/Aion", query: "Conceitos de assistentes de bolso, memex, segunda mente e inteligência artificial", category: "cortex", priority: "high", enabled: true, frequency: "weekly", tags: ["cortex", "aion", "vision"] },
  ];
}

export async function getEnabledResearchTopics(): Promise<AionResearchTopic[]> {
  const result = await listResearchTopics(true);
  if (result?.topics) {
    return result.topics.map(mapCoreTopic);
  }
  return getDefaultResearchTopics().filter((t) => t.enabled);
}

export async function saveResearchTopic(topic: AionResearchTopic): Promise<void> {
  await coreSave(topic);
}

export async function updateResearchTopic(id: string, patch: Partial<AionResearchTopic>): Promise<void> {
  await updateResearchTopicCore(id, patch as Partial<CoreResearchTopic>);
}

export async function disableResearchTopic(id: string): Promise<void> {
  await deleteResearchTopic(id);
}

export async function shouldCheckTopic(topic: AionResearchTopic): Promise<boolean> {
  const result = await shouldCheckTopicCore(topic.id);
  if (result) return true;
  if (!topic.enabled) return false;
  if (topic.frequency === "manual") return false;
  if (!topic.lastCheckedAt) return true;
  const lastCheck = new Date(topic.lastCheckedAt).getTime();
  const now = Date.now();
  const diffHours = (now - lastCheck) / (1000 * 60 * 60);
  if (topic.frequency === "daily" && diffHours >= 24) return true;
  if (topic.frequency === "weekly" && diffHours >= 168) return true;
  return false;
}
