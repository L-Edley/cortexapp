import type { AionBrainItem, AionBrainItemType } from "./types";
import { getBrainDB, isBrainAvailable, generateId } from "./brainStore";
import { indexBrainItemInBackground } from "@/lib/aion/vector/background";

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
const PROJECT_PATTERNS =
  /(cortex|aion|projeto|app|sistema|arquitetura|estrutura|módulo|modulo|componente|lib|api|rota|provider|store|banco|db|dados)/i;
const PREFERENCE_PATTERNS =
  /(prefiro|gosto|quero|queria|gostaria|melhor para mim|meu estilo|jeito|minha forma)/i;

const STOP_WORDS = new Set([
  "para", "como", "que", "com", "dos", "das", "uma", "mas", "por", "mais",
  "qual", "quem", "onde", "quando", "isso", "essa", "este", "aquele", "entao",
  "tambem", "sobre", "depois", "antes", "entre", "ate", "aqui", "ali", "la",
  "muito", "pouco", "voce", "seu", "sua", "seus", "suas",
  "pode", "podem", "ser", "estar", "ficar", "ter", "haver", "fazer",
]);

const SENSITIVE_PATTERNS =
  /(senha|password|token|api_key|secret|credential|cartão|cvv|cpf|rg|documento|credencial|sigilo|confidencial)/i;

const PERSONAL_SENSITIVE =
  /(médico|medico|diagnóstico|diagnostico|sintoma|doença|doenca|cirurgia|exame|receita|sexual|sexo|intimo|advogado|processo judicial|divida|dívida|salário|salario|renda|banco|conta bancária|cartão de crédito)/i;

function extractTags(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))].slice(0, 6);
}

function shouldNotSave(message: string, response: string): boolean {
  const combined = `${message} ${response}`;
  if (SENSITIVE_PATTERNS.test(combined)) return true;
  if (PERSONAL_SENSITIVE.test(combined)) return true;
  return false;
}

export async function learnFromInteraction(
  message: string,
  response: string,
  options?: {
    action?: string;
    confidence?: number;
    providerUsed?: string;
  }
): Promise<AionBrainItem | null> {
  if (!isBrainAvailable()) return null;

  if (!message || message.trim().length < 8) return null;
  if (!response || response.trim().length < 8) return null;

  if (shouldNotSave(message, response)) return null;

  if (options?.action === "create_record") return null;

  if (options?.confidence !== undefined && options.confidence < 0.65) return null;

  if ((!options?.action || options.action === "none") && response.length < 20) return null;

  const isDecision = DECISION_PATTERNS.test(message);
  const isProcedure = PROCEDURE_PATTERNS.test(message);
  const isResearch = RESEARCH_PATTERNS.test(message);
  const isRecurrent = RECURRENT_PATTERNS.test(message);
  const isPattern = PATTERN_PATTERNS.test(message);
  const isProject = PROJECT_PATTERNS.test(message);
  const isPreference = PREFERENCE_PATTERNS.test(message);

  if (
    !isDecision &&
    !isProcedure &&
    !isResearch &&
    !isRecurrent &&
    !isPattern &&
    !isProject &&
    !isPreference
  ) {
    return null;
  }

  let type: AionBrainItemType;

  if (isDecision) type = "decision";
  else if (isProcedure) type = "procedure";
  else if (isResearch) type = "research";
  else if (isPattern) type = "pattern";
  else if (isPreference) type = "user_preference";
  else if (isProject) type = "project_context";
  else type = "pattern";

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

  const db = await getBrainDB();
  if (!db) return null;

  try {
    await db.table("knowledge").put(item);
    indexBrainItemInBackground(item);
    return item;
  } catch (err) {
    console.warn("[BRAIN] learnFromInteraction erro ao salvar:", err);
    return null;
  }
}
