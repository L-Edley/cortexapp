import type { CortexRecord } from "@/lib/types";
import type { AionBrainItem } from "@/lib/aion/brain/types";
import type { AionClientContext } from "@/lib/aion/types";

export type AionContextDebug = {
  contextUsed: boolean;
  recentRecordsUsed: number;
  brainItemsUsed: number;
  semanticResultsUsed: number;
  profileUsed: boolean;
  dailyInsightUsed: boolean;
  clientContextUsed?: boolean;
  serverSemanticDisabled?: boolean;
};

export async function buildSessionContext(
  _userInput: string,
  _options?: {
    brainItems?: AionBrainItem[];
    recentRecords?: CortexRecord[];
    profileContext?: string;
    sessionMessages?: any[];
    clientContext?: AionClientContext;
  }
): Promise<any> {
  return { contextUsed: false };
}

export function buildContextDebug(_context: any): AionContextDebug {
  return {
    contextUsed: false,
    recentRecordsUsed: 0,
    brainItemsUsed: 0,
    semanticResultsUsed: 0,
    profileUsed: false,
    dailyInsightUsed: false,
  };
}

export function buildSystemPrompt(_context: any): string {
  return "Aion Core offline.";
}

export function buildQueryPrompt(_input: string, _context: any): string {
  return _input;
}
