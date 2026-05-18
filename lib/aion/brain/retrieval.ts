import type { AionBrainItem } from "./types";
import { getBrainStore } from "./brainStore";

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

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractKeywords(text: string): string[] {
  const tokens = normalize(text).split(/\s+/).filter((t) => t.length > 2);
  return [...new Set(tokens.filter((t) => !STOP_WORDS.has(t)))];
}

export async function retrieveRelevantBrainContext(
  message: string
): Promise<AionBrainItem[]> {
  const store = getBrainStore();
  const allItems = await store.records.toArray();

  if (allItems.length === 0) return [];

  const keywords = extractKeywords(message);
  if (keywords.length === 0) return [];

  const now = Date.now();

  const scored = allItems
    .map((item) => {
      if (item.expiresAt && new Date(item.expiresAt).getTime() < now) {
        return null;
      }

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

      return { item, score };
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null
    )
    .filter(({ score }) => score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const { item } of scored) {
    item.lastUsedAt = new Date().toISOString();
    await store.records.put(item);
  }

  return scored.map(({ item }) => item);
}
