import type { AionReasonIntent } from "./aionReason";

export interface AionContextPolicy {
  loadSemanticSearch: boolean;
  loadProfile: boolean;
  loadPatterns: boolean;
  loadRecords: boolean;
  loadDailyInsight: boolean;
  maxSessionMessages: number;
}

export function getContextPolicy(intent: AionReasonIntent): AionContextPolicy {
  switch (intent) {
    case "smalltalk":
      return {
        loadSemanticSearch: false,
        loadProfile: false,
        loadPatterns: false,
        loadRecords: false,
        loadDailyInsight: false,
        maxSessionMessages: 0,
      };

    case "record":
    case "memory":
      return {
        loadSemanticSearch: false,
        loadProfile: false,
        loadPatterns: false,
        loadRecords: false,
        loadDailyInsight: false,
        maxSessionMessages: 5,
      };

    case "question":
      return {
        loadSemanticSearch: true,
        loadProfile: true,
        loadPatterns: false,
        loadRecords: true,
        loadDailyInsight: false,
        maxSessionMessages: 10,
      };

    case "analysis":
    case "planning":
    case "review":
      return {
        loadSemanticSearch: true,
        loadProfile: true,
        loadPatterns: true,
        loadRecords: true,
        loadDailyInsight: true,
        maxSessionMessages: 10,
      };

    default:
      return {
        loadSemanticSearch: true,
        loadProfile: true,
        loadPatterns: true,
        loadRecords: true,
        loadDailyInsight: true,
        maxSessionMessages: 10,
      };
  }
}
