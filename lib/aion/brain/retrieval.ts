import type { AionBrainItem, AionBrainItemType, AionBrainScoredItem } from "./types";
import type { VectorSearchResult } from "@/lib/aion/vector/server-safe";
import { getBrainDB, isBrainAvailable } from "./brainStore";

const STOP_WORDS = new Set([
  "para", "como", "que", "com", "dos", "das", "uma", "mas", "por", "mais",
  "qual", "quem", "onde", "quando", "isso", "essa", "este", "aquele", "entao",
  "tambem", "sobre", "depois", "antes", "entre", "ate", "aqui", "ali", "la",
  "muito", "pouco", "sempre", "nunca", "jamais", "assim", "pois", "portanto",
  "contudo", "todavia", "voce", "voces", "seu", "sua", "seus", "suas", "meu",
  "minha", "meus", "minhas", "nosso", "nossa", "dela", "dele", "delas", "deles",
  "pode", "podem", "poder", "ser", "estar", "ficar", "ter", "haver", "fazer",
  "dizer", "saber", "ficou", "tem", "temos", "era", "foram",
]);

const RRF_K = 60;
const KEYWORD_WEIGHT = 0.55;
const SEMANTIC_WEIGHT = 0.35;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .toLowerCase();
}

function extractKeywords(text: string): string[] {
  const tokens = normalize(text).split(/\s+/).filter((t) => t.length > 2);
  return [...new Set(tokens.filter((t) => !STOP_WORDS.has(t)))];
}

function rrfScore(rank: number): number {
  return 1 / (RRF_K + rank);
}

export async function retrieveRelevantBrainContext(
  message: string
): Promise<AionBrainItem[]> {
  if (!isBrainAvailable()) return [];

  const db = await getBrainDB();
  if (!db) return [];

  const keywords = extractKeywords(message);
  if (keywords.length === 0) return [];

  const now = Date.now();

  try {
    const memories = (await db.table("memories").toArray()) as AionBrainItem[];
    const knowledge = (await db.table("knowledge").toArray()) as AionBrainItem[];
    const allItems = [...memories, ...knowledge];

    if (allItems.length === 0) return [];

    const validItems = allItems.filter((item) => {
      if (item.expiresAt && new Date(item.expiresAt).getTime() < now) {
        return false;
      }
      return true;
    });

    if (validItems.length === 0) return [];

    const keywordScored: AionBrainScoredItem[] = validItems
      .map((item) => {
        const searchText = normalize(
          `${item.title} ${item.content} ${item.tags.join(" ")}`
        );
        let score = 0;

        for (const kw of keywords) {
          if (searchText.includes(kw)) {
            score += 0.2;
          }
        }

        for (const kw of keywords) {
          if (item.tags.some((t) => normalize(t).includes(kw))) {
            score += 0.3;
          }
        }

        if (item.lastUsedAt) {
          const daysSince =
            (now - new Date(item.lastUsedAt).getTime()) / 86_400_000;
          if (daysSince < 7) score += 0.15;
          else if (daysSince < 30) score += 0.1;
          else if (daysSince < 90) score += 0.05;
        }

        if (item.updatedAt) {
          const daysSinceUpdate =
            (now - new Date(item.updatedAt).getTime()) / 86_400_000;
          if (daysSinceUpdate < 7) score += 0.1;
        }

        score *= item.confidence;

        return {
          ...item,
          relevanceScore: Math.round(score * 100) / 100,
        };
      })
      .filter(({ relevanceScore }) => relevanceScore > 0.3);

    keywordScored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const seenIds = new Set(keywordScored.map((i) => i.id));

    let semanticResults: VectorSearchResult[] = [];
    try {
      const { semanticSearch } = await import("@/lib/aion/vector/semanticIndex");
      semanticResults = await semanticSearch(message, { topK: 10, threshold: 0.3 });
    } catch {
      semanticResults = [];
    }

    const combined: AionBrainScoredItem[] = [];

    for (let i = 0; i < keywordScored.length; i++) {
      const kwRank = i;
      const kwScore = rrfScore(kwRank) * KEYWORD_WEIGHT;
      combined.push({
        ...keywordScored[i],
        relevanceScore: kwScore,
      });
    }

    for (const sem of semanticResults) {
      if (seenIds.has(sem.sourceId)) continue;

      const item = validItems.find((v) => v.id === sem.sourceId);
      if (!item) continue;

      const semRank = combined.length;
      const semScore = rrfScore(semRank) * SEMANTIC_WEIGHT;
      combined.push({
        ...item,
        relevanceScore: Math.round(semScore * 100) / 100,
      });
      seenIds.add(item.id);
    }

    combined.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topResults = combined.slice(0, 5);

    for (const item of topResults) {
      item.lastUsedAt = new Date().toISOString();
      item.relevanceScore = Math.round(item.relevanceScore * 100) / 100;
      try {
        const table = db.table("memories");
        await table.put(item);
      } catch {
        try {
          const table = db.table("knowledge");
          await table.put(item);
        } catch {
        }
      }
    }

    return topResults;
  } catch {
    return [];
  }
}

export type SafeBrainItem = {
  id: string;
  type: AionBrainItemType;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  updatedAt: string;
};

const SENSITIVE_TAGS = new Set([
  "sensitive", "private", "medical", "legal", "financial_personal",
]);

export function prepareBrainContextForApi(
  items: AionBrainItem[]
): SafeBrainItem[] {
  return items
    .filter((item) => !item.tags.some((t) => SENSITIVE_TAGS.has(t)))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content.slice(0, 800),
      tags: item.tags,
      confidence: item.confidence,
      updatedAt: item.updatedAt,
    }));
}
