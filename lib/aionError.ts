export type AionErrorType =
  | "stream_failed"
  | "provider_timeout"
  | "provider_failed"
  | "tts_failed"
  | "speech_recognition_failed"
  | "storage_failed"
  | "semantic_search_failed"
  | "obsidian_offline"
  | "unknown";

export interface AionNormalizedError {
  type: AionErrorType;
  message: string;
  originalMessage?: string;
}

export function normalizeAionError(error: unknown): AionNormalizedError {
  const errMsg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : JSON.stringify(error || "");

  let type: AionErrorType = "unknown";

  const lower = errMsg.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timedout") || lower.includes("abort")) {
    type = "provider_timeout";
  } else if (
    lower.includes("stream") ||
    lower.includes("sse") ||
    lower.includes("readablestream") ||
    lower.includes("chunk")
  ) {
    type = "stream_failed";
  } else if (
    lower.includes("obsidian") ||
    lower.includes("vault") ||
    lower.includes("23531") ||
    lower.includes("refused")
  ) {
    type = "obsidian_offline";
  } else if (
    lower.includes("speech") ||
    lower.includes("recognition") ||
    lower.includes("mic") ||
    lower.includes("microphone") ||
    lower.includes("not-allowed") ||
    lower.includes("transcript")
  ) {
    type = "speech_recognition_failed";
  } else if (
    lower.includes("tts") ||
    lower.includes("elevenlabs") ||
    lower.includes("voice") ||
    lower.includes("speak") ||
    lower.includes("audio") ||
    lower.includes("synthesis")
  ) {
    type = "tts_failed";
  } else if (
    lower.includes("storage") ||
    lower.includes("indexeddb") ||
    lower.includes("db") ||
    lower.includes("firebase") ||
    lower.includes("firestore") ||
    lower.includes("save")
  ) {
    type = "storage_failed";
  } else if (
    lower.includes("semantic") ||
    lower.includes("vector") ||
    lower.includes("embed") ||
    lower.includes("similarity")
  ) {
    type = "semantic_search_failed";
  } else if (
    lower.includes("provider") ||
    lower.includes("groq") ||
    lower.includes("opencode") ||
    lower.includes("ollama") ||
    lower.includes("llm") ||
    lower.includes("fetch") ||
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    type = "provider_failed";
  }

  return {
    type,
    message: getUserFriendlyErrorMessage(type),
    originalMessage: errMsg,
  };
}

export function getUserFriendlyErrorMessage(type: AionErrorType): string {
  switch (type) {
    case "stream_failed":
      return "Tive um problema na transmissão da resposta em tempo real, mas consegui recuperar o texto completo.";
    case "provider_timeout":
      return "O servidor de inteligência demorou para responder. Tentei novamente.";
    case "provider_failed":
      return "Tive uma instabilidade ao conectar com meu cérebro principal. Tentei um caminho alternativo.";
    case "tts_failed":
      return "A voz falhou temporariamente, mas a resposta textual está totalmente operacional.";
    case "speech_recognition_failed":
      return "O microfone não pôde ser ativado ou não está disponível. Você pode digitar normalmente.";
    case "storage_failed":
      return "Tive um problema ao salvar as informações, mas podemos continuar conversando normalmente.";
    case "semantic_search_failed":
      return "Tive um problema na busca de memória de longo prazo, mas processei sua solicitação com o contexto disponível.";
    case "obsidian_offline":
      return "O aplicativo Obsidian parece offline ou inacessível no momento.";
    case "unknown":
    default:
      return "Tive um comportamento inesperado, mas já recuperei o controle e estou pronto.";
  }
}

export function shouldRetry(type: AionErrorType): boolean {
  return type === "stream_failed" || type === "provider_timeout" || type === "provider_failed";
}

export function getFallbackAction(type: AionErrorType): string {
  switch (type) {
    case "stream_failed":
      return "Recuar para a rota padrão síncrona /api/aion.";
    case "provider_timeout":
      return "Tentar novamente com maior limite de tempo ou modelo local.";
    case "provider_failed":
      return "Ativar o pipeline de backup local ou Ollama.";
    case "tts_failed":
      return "Desativar sintetização de voz e manter apenas exibição de texto.";
    case "speech_recognition_failed":
      return "Mudar automaticamente para entrada via teclado de texto.";
    case "storage_failed":
      return "Manter dados apenas em memória temporária da sessão.";
    case "semantic_search_failed":
      return "Ignorar resultados vetoriais e proceder apenas com o histórico básico.";
    case "obsidian_offline":
      return "Desativar sincronização do Obsidian temporariamente.";
    case "unknown":
    default:
      return "Restabelecer estado inicial seguro do CommandCenter.";
  }
}
