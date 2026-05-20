// lib/aion/vector/client.ts
// Este barrel contém apenas exports seguros para server-side.
// Se precisar de generateEmbedding, semanticSearch, etc.,
// importe diretamente de "./browserEmbedding" ou "./semanticIndex"
// via dynamic import dentro de funções browser-only.
export * from "./server-safe";
