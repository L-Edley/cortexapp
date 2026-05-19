/** @deprecated Use funções de lib/obsidian-adapter.ts para escrever/ler no vault. */
export { generateDashboardMarkdown, generateDailyNoteMarkdown } from "./markdown";
export { getObsidianPath, sanitizeFileName, copyVaultStructure, VAULT_STRUCTURE, RECOMMENDED_PLUGINS } from "./paths";
export {
  exportRecordAsMarkdown,
  exportAllRecordsAsMarkdown,
  exportDashboardMarkdown,
  exportDailyNoteMarkdown,
  copyMarkdownToClipboard,
  generateVaultReadme,
  copyVaultReadmeToClipboard,
} from "./export";
export { checkObsidianConnection, writeVaultFile, readVaultFile, deleteVaultFile, getObsidianConfig } from "./client";
export { getObsidianHealth } from "./health";
export type { ObsidianHealthStatus } from "./health";
export type { SyncResult, BulkSyncResult, StorageProvider } from "./vaultStorage";
