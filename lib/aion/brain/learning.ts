import type { AionBrainItem, AionBrainItemType } from "./types";
import { getBrainStore, generateId } from "./brainStore";

const DECISION_PATTERNS =
  /(decidi|vou|vamos|melhor|escolhi|optar|definir|decidido|decidimos|decidiram)/i;
const PROCEDURE_PATTERNS =
  /(como|passo|forma|maneira|modo|tutorial|instrução|guia|processo|metodo|fluxo)/i;
const RESEARCH_PATTERNS =
  /(pesquisar|buscar|saber|descobrir|encontrar|aprender|entender|significa|conceito|definição)/i;
const RECURRENT_PATTERNS =
  /(sempre|nunca|toda|todo|frequentemente|geralmente|normalmente|costumo|rotina|habitualmente)/i;
const PATTERN_PATTERNS =
  /(percebi|notei|reparei|padrão|comportamento|habito|costume|repetido)/i;

const STOP_WORDS = new Set([
  "para", "como", "que", "com", "dos", "das", "uma", "mas", "por", "mais",
  "qual", "quem", "onde", "quando", "isso", "essa", "este", "aquele", "entao",
  "tambem", "sobre", "depois", "antes", "entre", "ate", "aqui", "ali", "la",
  "muito", "pouco", "voce", "seu", "sua", "seus", "suas",
  "pode", "podem", "ser", "estar", "ficar", "ter", "haver", "fazer",
]);

function extractTags(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))].slice(0, 6);
}

function hasSensitiveContent(text: string): boolean {
  return /(senha|password|token|api_key|secret|credential|cartão|cvv|cpf|rg|documento)/i.test(
    text
  );
}

export async function learnFromInteraction(
  message: string,
  response: string,
  action: string
): Promise<AionBrainItem | null> {
  if (!message || message.trim().length < 8) return null;
  if (!response || response.trim().length < 8) return null;
  if (hasSensitiveContent(message) || hasSensitiveContent(response)) return null;

  if (action === "create_record") return null;

  if (action === "none" && response.length < 20) return null;

  const isDecision = DECISION_PATTERNS.test(message);
  const isProcedure = PROCEDURE_PATTERNS.test(message);
  const isResearch = RESEARCH_PATTERNS.test(message);
  const isRecurrent = RECURRENT_PATTERNS.test(message);
  const isPattern = PATTERN_PATTERNS.test(message);

  if (!isDecision && !isProcedure && !isResearch && !isRecurrent && !isPattern) {
    return null;
  }

  let type: AionBrainItemType;
  if (isDecision) type = "decision";
  else if (isProcedure) type = "procedure";
  else if (isResearch) type = "research";
  else if (isPattern) type = "pattern";
  else type = "user_preference";

  const tags = extractTags(message);
  let expiresAt: string | undefined;

  if (isResearch || isProcedure) {
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 3);
    expiresAt = expiryDate.toISOString();
  }

  const item: AionBrainItem = {
    id: generateId(),
    type,
    title: message.length > 80 ? message.slice(0, 80) + "..." : message,
    content: response,
    tags,
    source: "llm",
    confidence: 0.7,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt,
  };

  const store = getBrainStore();
  await store.records.add(item);

  await store.knowledge.add({ ...item, id: generateId() });

  return item;
}
