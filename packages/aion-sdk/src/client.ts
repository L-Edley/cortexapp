import type {
  AionConfig, AionResponse, AionAlert, AlertCheckResult, AionProfile,
  BrainHealth, BrainStats, Briefing, ConversationEnhancement, ControlOverview,
  DashboardData, DevAnalysis, DevPlan, DevReview, DevValidation,
  DoctrineAnswer, DoctrineSeedStatus, ExecutionRecord, Goal,
  GroundingResult, KnowledgeHealth, KnowledgeResponse,
  LiveFeedEntry, MemoryGraph, Notification, ProactiveResult,
  ProfileResponse, ResearchReport, ResearchTopic, ResearchTopicCheckResult,
  RuntimeState, SchedulerTask, Session, StatusResponse, StrategyEntry,
  StudyReport, SyncStatus, TeachResponse, TenantStats,
  TimelineEvent, VoiceResponse, WorkspaceState, RuntimeJob,
} from "./types.js";
import { AionUnavailableError } from "./errors.js";

export class AionClient {
  private config: Required<AionConfig>;

  constructor(config: AionConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      appId: config.appId,
      apiKey: config.apiKey,
      timeout: config.timeout ?? 10_000,
      fallback: config.fallback ?? false,
    };
  }

  // ─── Private helpers ───

  private _tenantUrl(path: string): string {
    return `${this.config.baseUrl}/v1/tenant/${this.config.appId}${path}`;
  }

  private async _fetchWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } catch (err) {
      if (Date.now() - start > this.config.timeout) throw err;
      await this._sleep(500);
      return fn();
    }
  }

  private async _request(url: string, init: RequestInit): Promise<unknown> {
    const res = await this._rawRequest(url, init, this.config.timeout);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AionUnavailableError(`AION API error ${res.status}: ${body || res.statusText}`);
    }
    return res.json();
  }

  private async _rawRequest(url: string, init: RequestInit, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Tenant-ID": this.config.appId,
      Authorization: `Bearer ${this.config.apiKey}`,
      ...(init.headers as Record<string, string> | undefined),
    };
    try {
      return await fetch(url, { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── Core ───

  async chat(input: string, userId: string, context?: object): Promise<AionResponse> {
    try {
      return await this._fetchWithRetry(async () => {
        const res = await this._request(`${this.config.baseUrl}/v1/core/chat`, {
          method: "POST",
          body: JSON.stringify({
            app_id: this.config.appId,
            user_id: userId,
            input,
            context: context ?? null,
          }),
        });
        return res as AionResponse;
      });
    } catch (err) {
      if (this.config.fallback) {
        return {
          status: "fallback",
          tenant_id: this.config.appId,
          reasoning_log: err instanceof Error ? err.message : "unavailable",
          action_executed: null,
          ui_reply: "",
          data: { used_cache: false, confidence: 0 },
          used_cache: false,
          confidence: 0,
        };
      }
      throw err instanceof Error
        ? new AionUnavailableError(err.message)
        : new AionUnavailableError();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this._rawRequest(`${this.config.baseUrl}/health`, { method: "GET" }, this.config.timeout);
      return res.status === 200;
    } catch { return false; }
  }

  async getCoreHealth(): Promise<{ status: string; service?: string; providers_available?: string[] }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/core/health`, { method: "GET" });
      return res as any;
    });
  }

  // ─── Tenant / Knowledge ───

  async getTenantStats(): Promise<TenantStats> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/tenant/${this.config.appId}/stats`, { method: "GET" });
      return res as TenantStats;
    });
  }

  async getKnowledge(query?: string, limit?: number): Promise<KnowledgeResponse> {
    return this._fetchWithRetry(async () => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const url = `${this._tenantUrl("/knowledge")}${qs ? "?" + qs : ""}`;
      const res = await this._request(url, { method: "GET" });
      return res as KnowledgeResponse;
    });
  }

  async getKnowledgeHealth(): Promise<KnowledgeHealth> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/knowledge-health"), { method: "GET" });
      return res as KnowledgeHealth;
    });
  }

  async triggerReteach(description?: string): Promise<StatusResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/reteach"), {
        method: "POST",
        body: JSON.stringify({ description: description ?? "" }),
      });
      return res as StatusResponse;
    });
  }

  // ─── Research ───

  async getResearchReport(): Promise<ResearchReport> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/research/last-report"), { method: "GET" });
      return res as ResearchReport;
    });
  }

  async getResearchTopics(): Promise<{ topics: string[] }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/research/topics"), { method: "GET" });
      return res as any;
    });
  }

  async triggerResearch(): Promise<StatusResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/research/run"), { method: "POST" });
      return res as StatusResponse;
    });
  }

  // ─── Briefing ───

  async getBriefing(): Promise<Briefing> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/briefing"), { method: "GET" });
      return res as Briefing;
    });
  }

  // ─── Study ───

  async triggerStudy(topics?: string[]): Promise<{ job_id?: string; status: string }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/study"), {
        method: "POST",
        body: JSON.stringify({ mode: "auto", topics: topics ?? [] }),
      });
      return res as any;
    });
  }

  async getLastStudy(): Promise<StudyReport> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/study/last"), { method: "GET" });
      return res as StudyReport;
    });
  }

  // ─── Dev ───

  async devAnalyze(path?: string): Promise<DevAnalysis> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/dev/analyze"), {
        method: "POST",
        body: JSON.stringify({ path: path ?? "." }),
      });
      return res as DevAnalysis;
    });
  }

  async devPlan(objective: string): Promise<DevPlan> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/dev/plan"), {
        method: "POST",
        body: JSON.stringify({ objective }),
      });
      return res as DevPlan;
    });
  }

  async devReview(): Promise<DevReview> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/dev/review"), { method: "POST" });
      return res as DevReview;
    });
  }

  async devValidate(commands?: string[]): Promise<DevValidation> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/dev/validate"), {
        method: "POST",
        body: JSON.stringify({ commands: commands ?? [] }),
      });
      return res as DevValidation;
    });
  }

  async devSaveLesson(title: string, content: string, tags?: string[]): Promise<{ status: string; saved_id?: string }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/dev/save-lesson"), {
        method: "POST",
        body: JSON.stringify({ title, content, tags: tags ?? [] }),
      });
      return res as any;
    });
  }

  // ─── Sync ───

  async getSyncStatus(): Promise<SyncStatus> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/sync"), { method: "GET" });
      return res as SyncStatus;
    });
  }

  async retrySync(): Promise<StatusResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/sync/retry-failed"), { method: "POST" });
      return res as StatusResponse;
    });
  }

  // ─── Teach ───

  async teachAsk(question: string): Promise<TeachResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/teach/ask"), {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      return res as TeachResponse;
    });
  }

  // ─── Voice ───

  async speak(text: string): Promise<VoiceResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/speak"), {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      return res as VoiceResponse;
    });
  }

  // ─── Proactive ───

  async getProactive(): Promise<ProactiveResult> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/proactive"), { method: "GET" });
      return res as ProactiveResult;
    });
  }

  // ─── Control ───

  async getControlOverview(): Promise<ControlOverview> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/control/overview"), { method: "GET" });
      return res as ControlOverview;
    });
  }

  async getBrainStatus(): Promise<any> {
    return this._fetchWithRetry(async () => {
      return this._request(this._tenantUrl("/control/brain"), { method: "GET" });
    });
  }

  async getProviderStatus(): Promise<any> {
    return this._fetchWithRetry(async () => {
      return this._request(this._tenantUrl("/control/providers"), { method: "GET" });
    });
  }

  // ─── Workspace ───

  async getWorkspaceState(): Promise<WorkspaceState> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/state`, { method: "GET" });
      return res as WorkspaceState;
    });
  }

  async getTimeline(limit?: number, category?: string): Promise<{ events: TimelineEvent[]; categories: string[] }> {
    return this._fetchWithRetry(async () => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (category) params.set("category", category);
      const qs = params.toString();
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/timeline${qs ? "?" + qs : ""}`, { method: "GET" });
      return res as any;
    });
  }

  async getStrategies(): Promise<{ strategies: Record<string, StrategyEntry>; most_used_modes: string[] }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/strategies`, { method: "GET" });
      return res as any;
    });
  }

  async getMemoryGraph(limit?: number): Promise<MemoryGraph> {
    return this._fetchWithRetry(async () => {
      const params = limit ? `?limit=${limit}` : "";
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/memory-graph${params}`, { method: "GET" });
      return res as MemoryGraph;
    });
  }

  async getWorkspaceProviders(): Promise<{ providers: any[] }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/providers`, { method: "GET" });
      return res as any;
    });
  }

  async getExecutions(limit?: number): Promise<{ executions: ExecutionRecord[]; total: number }> {
    return this._fetchWithRetry(async () => {
      const params = limit ? `?limit=${limit}` : "";
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/executions${params}`, { method: "GET" });
      return res as any;
    });
  }

  async getLiveFeed(limit?: number): Promise<{ entries: LiveFeedEntry[] }> {
    return this._fetchWithRetry(async () => {
      const params = limit ? `?limit=${limit}` : "";
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/live-feed${params}`, { method: "GET" });
      return res as any;
    });
  }

  async getDashboard(): Promise<DashboardData> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/dashboard`, { method: "GET" });
      return res as DashboardData;
    });
  }

  async getBrainStats(): Promise<BrainStats> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/brain/stats`, { method: "GET" });
      return res as BrainStats;
    });
  }

  async getBrainHealth(): Promise<BrainHealth> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/workspace/brain/health`, { method: "GET" });
      return res as BrainHealth;
    });
  }

  // ─── Runtime ───

  async getRuntimeState(): Promise<RuntimeState> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/runtime/state`, { method: "GET" });
      return res as RuntimeState;
    });
  }

  async getSessions(sessionType?: string, limit?: number): Promise<{ sessions: Session[]; active_count: number }> {
    return this._fetchWithRetry(async () => {
      const params = new URLSearchParams();
      if (sessionType) params.set("session_type", sessionType);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const res = await this._request(`${this.config.baseUrl}/v1/runtime/sessions${qs ? "?" + qs : ""}`, { method: "GET" });
      return res as any;
    });
  }

  async getGoals(activeOnly?: boolean): Promise<{ goals: Goal[] }> {
    return this._fetchWithRetry(async () => {
      const params = activeOnly !== undefined ? `?active_only=${activeOnly}` : "";
      const res = await this._request(`${this.config.baseUrl}/v1/runtime/goals${params}`, { method: "GET" });
      return res as any;
    });
  }

  async getRuntimeJobs(): Promise<{ active_jobs: RuntimeJob[]; telemetry: any }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/runtime/jobs`, { method: "GET" });
      return res as any;
    });
  }

  async getNotifications(unreadOnly?: boolean, typeFilter?: string, limit?: number): Promise<{ notifications: Notification[]; unread_count: number }> {
    return this._fetchWithRetry(async () => {
      const params = new URLSearchParams();
      if (unreadOnly) params.set("unread_only", "true");
      if (typeFilter) params.set("type_filter", typeFilter);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const res = await this._request(`${this.config.baseUrl}/v1/runtime/notifications${qs ? "?" + qs : ""}`, { method: "GET" });
      return res as any;
    });
  }

  async getSchedulerTasks(): Promise<{ tasks: SchedulerTask[]; due_count: number }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(`${this.config.baseUrl}/v1/runtime/scheduler`, { method: "GET" });
      return res as any;
    });
  }

  // ─── Doctrine ───

  async doctrineAsk(input: string): Promise<DoctrineAnswer | { status: string }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/doctrine/ask"), {
        method: "POST",
        body: JSON.stringify({ input }),
      });
      return res as any;
    });
  }

  async doctrineSeed(): Promise<StatusResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/doctrine/seed"), { method: "POST" });
      return res as StatusResponse;
    });
  }

  async doctrineSeedStatus(): Promise<DoctrineSeedStatus> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/doctrine/seed/status"), { method: "GET" });
      return res as DoctrineSeedStatus;
    });
  }

  async doctrineSeedReset(): Promise<StatusResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/doctrine/seed/reset"), { method: "POST" });
      return res as StatusResponse;
    });
  }

  async doctrineGrounding(input: string, context?: string): Promise<GroundingResult> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/doctrine/grounding"), {
        method: "POST",
        body: JSON.stringify({ input, context: context ?? "" }),
      });
      return res as GroundingResult;
    });
  }

  async doctrineGroundingDefault(): Promise<{ grounding: string }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/doctrine/grounding/default"), { method: "GET" });
      return res as any;
    });
  }

  // ─── Profile ───

  async getProfile(): Promise<ProfileResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/profile"), { method: "GET" });
      return res as ProfileResponse;
    });
  }

  async updateProfile(patch: { userName?: string; currentGoal?: string }): Promise<{ status: string; profile: AionProfile }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/profile/update"), {
        method: "POST",
        body: JSON.stringify(patch),
      });
      return res as any;
    });
  }

  async analyzeProfile(): Promise<{ status: string; profile: AionProfile }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/profile/analyze"), { method: "POST" });
      return res as any;
    });
  }

  // ─── Alerts ───

  async getAlerts(unshownOnly?: boolean): Promise<{ alerts: AionAlert[]; total: number }> {
    return this._fetchWithRetry(async () => {
      const params = unshownOnly ? "?unshown_only=true" : "";
      const res = await this._request(this._tenantUrl(`/alerts${params}`), { method: "GET" });
      return res as any;
    });
  }

  async checkAlerts(): Promise<AlertCheckResult> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/alerts/check"), { method: "POST" });
      return res as AlertCheckResult;
    });
  }

  async dismissAlert(alertId: string): Promise<StatusResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/alerts/dismiss"), {
        method: "POST",
        body: JSON.stringify({ alert_id: alertId }),
      });
      return res as StatusResponse;
    });
  }

  async clearOldAlerts(days?: number): Promise<{ status: string; removed: number }> {
    return this._fetchWithRetry(async () => {
      const params = days ? `?days=${days}` : "";
      const res = await this._request(this._tenantUrl(`/alerts/clear-old${params}`), { method: "POST" });
      return res as any;
    });
  }

  // ─── Research Topics (CRUD) ───

  async listResearchTopics(enabledOnly?: boolean): Promise<{ topics: ResearchTopic[]; total: number }> {
    return this._fetchWithRetry(async () => {
      const params = enabledOnly ? "?enabled_only=true" : "";
      const res = await this._request(this._tenantUrl(`/research/topics${params}`), { method: "GET" });
      return res as any;
    });
  }

  async addResearchTopic(topic: { title: string; query: string; category?: string; priority?: string; enabled?: boolean; frequency?: string; tags?: string[]; id?: string }): Promise<{ status: string; topic: ResearchTopic }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/research/topics"), {
        method: "POST",
        body: JSON.stringify(topic),
      });
      return res as any;
    });
  }

  async updateResearchTopic(topicId: string, patch: Partial<ResearchTopic>): Promise<{ status: string; topic: ResearchTopic }> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl(`/research/topics/${topicId}`), {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      return res as any;
    });
  }

  async deleteResearchTopic(topicId: string): Promise<StatusResponse> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl(`/research/topics/${topicId}`), { method: "DELETE" });
      return res as StatusResponse;
    });
  }

  async shouldCheckResearchTopic(topicId: string): Promise<ResearchTopicCheckResult> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl(`/research/topics/${topicId}/should-check`), { method: "GET" });
      return res as ResearchTopicCheckResult;
    });
  }

  // ─── Conversation ───

  async enhanceConversation(input: string, reply: string, options?: {
    voiceReply?: string; action?: string; record?: any; confidence?: number; providerUsed?: string; suggestion?: string; followUpQuestion?: string; tips?: string[];
  }): Promise<ConversationEnhancement> {
    return this._fetchWithRetry(async () => {
      const res = await this._request(this._tenantUrl("/conversation/enhance"), {
        method: "POST",
        body: JSON.stringify({
          input,
          reply,
          voice_reply: options?.voiceReply,
          action: options?.action ?? "chat",
          record: options?.record,
          confidence: options?.confidence ?? 1.0,
          provider_used: options?.providerUsed ?? "local",
          suggestion: options?.suggestion,
          follow_up_question: options?.followUpQuestion,
          tips: options?.tips,
        }),
      });
      return res as ConversationEnhancement;
    });
  }
}
