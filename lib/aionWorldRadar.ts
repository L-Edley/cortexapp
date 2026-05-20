import { getEnabledResearchTopics, shouldCheckTopic, updateResearchTopic, type AionResearchTopic } from "./aionResearchTopics";
import { runWebResearch } from "./aionWebResearch";

export interface WorldRadarOptions {
  forceAll?: boolean;
  maxTopics?: number;
}

export interface WorldRadarResult {
  topicId: string;
  success: boolean;
  learningSaved: boolean;
  learningType?: string;
  error?: string;
  debug?: {
    webResearchUsed?: boolean;
    webSearchProvider?: string;
    sourcesCount?: number;
    cacheHit?: boolean;
    webResearchSkippedReason?: string;
  };
}

export async function runWorldRadar(options?: WorldRadarOptions): Promise<WorldRadarResult[]> {
  const enabled = getEnabledResearchTopics();
  const toCheck = options?.forceAll ? enabled : enabled.filter(shouldCheckTopic);

  const limit = options?.maxTopics || 3;
  const sliced = toCheck.slice(0, limit);
  const results: WorldRadarResult[] = [];

  for (const topic of sliced) {
    const res = await researchTopic(topic);
    results.push(res);
  }

  return results;
}

export async function researchTopic(topic: AionResearchTopic): Promise<WorldRadarResult> {
  try {
    const webResult = await runWebResearch(topic.query);

    if (webResult.webResearchSkippedReason) {
      return {
        topicId: topic.id,
        success: false,
        learningSaved: false,
        error: webResult.webResearchSkippedReason,
        debug: {
          webResearchUsed: webResult.webResearchUsed,
          webSearchProvider: webResult.webSearchProvider,
          sourcesCount: webResult.sourcesCount,
          cacheHit: webResult.cacheHit,
          webResearchSkippedReason: webResult.webResearchSkippedReason,
        },
      };
    }

    if (!webResult.summary) {
      return {
        topicId: topic.id,
        success: false,
        learningSaved: false,
        error: "Empty research result",
        debug: {
          webResearchUsed: webResult.webResearchUsed,
          webSearchProvider: webResult.webSearchProvider,
          sourcesCount: webResult.sourcesCount,
          cacheHit: webResult.cacheHit,
        },
      };
    }

    updateResearchTopic(topic.id, { lastCheckedAt: new Date().toISOString() });

    return {
      topicId: topic.id,
      success: true,
      learningSaved: true,
      learningType: webResult.learningType,
      debug: {
        webResearchUsed: true,
        webSearchProvider: webResult.webSearchProvider,
        sourcesCount: webResult.sourcesCount,
        cacheHit: webResult.cacheHit,
      },
    };
  } catch (err: any) {
    return {
      topicId: topic.id,
      success: false,
      learningSaved: false,
      error: err?.message || "Unknown error",
    };
  }
}
