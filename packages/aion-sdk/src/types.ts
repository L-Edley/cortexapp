// ── Core ──
export interface AionConfig {
  baseUrl: string;
  appId: string;
  apiKey: string;
  timeout?: number;
  fallback?: boolean;
}

export interface AionRequest {
  app_id: string;
  user_id: string;
  input: string;
  context?: Record<string, unknown>;
}

export interface AionResponseData {
  used_cache: boolean;
  confidence: number;
}

export interface AionResponse {
  status: string;
  tenant_id: string;
  reasoning_log: string;
  action_executed: string | null;
  ui_reply: string;
  data: AionResponseData;
  used_cache?: boolean;
  confidence?: number;
}

// ── Tenant ──
export interface TenantStats {
  app_id: string;
  memories: number;
  knowledge: number;
  decisions: number;
  initialized: boolean;
  last_activity: string | null;
}

export interface KnowledgeEntry {
  id: string;
  app_id: string;
  content: string;
  tags: string[];
  confidence: number;
  expires_at: string | null;
  domain?: string;
  niche?: string;
  topic?: string;
  scope?: string;
  source_mode?: string;
  created_at: string;
}

export interface KnowledgeResponse {
  app_id: string;
  items: KnowledgeEntry[];
  total: number;
}

export interface KnowledgeHealth {
  tenant_id: string;
  total_knowledge: number;
  expired_count: number;
  low_confidence_count: number;
  healthy_count: number;
  last_reteaching: string | null;
  days_since_last_reteaching: number | null;
}

// ── Research ──
export interface ResearchReport {
  status?: string;
  summary?: string;
  topics_analyzed?: string[];
  created_at?: string;
}

export interface ResearchTopic {
  id: string;
  title: string;
  query: string;
  category: string;
  priority: string;
  enabled: boolean;
  frequency: string;
  lastCheckedAt?: string;
  tags: string[];
}

export interface ResearchTopicCheckResult {
  topic_id: string;
  should_check: boolean;
  frequency: string;
  last_checked_at: string | null;
}

// ── Briefing ──
export interface Briefing {
  summary?: string;
  insights?: string[];
  date?: string;
}

// ── Study ──
export interface StudyReport {
  status?: string;
  summary?: string;
  topics?: string[];
  knowledge_saved?: number;
  created_at?: string;
}

// ── Dev ──
export interface DevAnalysis {
  analysis?: string;
  suggestions?: string[];
}

export interface DevPlan {
  plan?: string;
  steps?: string[];
}

export interface DevReview {
  review?: string;
  issues?: string[];
}

export interface DevValidation {
  status?: string;
  errors?: string[];
  warnings?: string[];
}

// ── Sync ──
export interface SyncStatus {
  status?: string;
  pending_count?: number;
  last_sync?: string | null;
}

// ── Control ──
export interface ControlOverview {
  brain?: any;
  providers?: any;
  sync?: any;
  study?: any;
  dev?: any;
  jobs?: any;
}

export interface BrainStats {
  total_memories?: number;
  total_knowledge?: number;
  total_decisions?: number;
  domain_distribution?: Record<string, number>;
}

export interface BrainHealth {
  status?: string;
  vector_store?: string;
  obsidian_vault?: string;
  providers_available?: string[];
}

// ── Workspace ──
export interface WorkspaceState {
  active_goal?: string;
  active_modes?: string[];
  active_provider?: string;
  orchestrator_status?: string;
  cognitive_load?: number;
  active_jobs?: number;
  recent_events?: any[];
}

export interface TimelineEvent {
  id: string;
  type: string;
  category: string;
  title: string;
  description?: string;
  created_at: string;
}

export interface StrategyEntry {
  goal_type: string;
  best_mode?: string;
  best_provider?: string;
  success_rate?: number;
  total_executions?: number;
}

export interface MemoryGraph {
  nodes: any[];
  edges: any[];
  domain_stats?: Record<string, number>;
}

export interface ExecutionRecord {
  id: string;
  goal: string;
  goal_type?: string;
  modes_used?: string[];
  success?: boolean;
  duration_seconds?: number;
  confidence_score?: number;
  created_at?: string;
}

export interface LiveFeedEntry {
  id: string;
  type: string;
  message: string;
  icon?: string;
  created_at: string;
}

export interface DashboardData {
  strategies?: Record<string, StrategyEntry>;
  most_used_modes?: string[];
  brain?: BrainStats;
  recent_timeline?: string[];
}

// ── Runtime ──
export interface RuntimeState {
  status?: string;
  started_at?: string | null;
  active_jobs?: number;
  active_sessions?: number;
}

export interface Session {
  id: string;
  type: string;
  status?: string;
  started_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  status?: string;
  progress?: number;
  created_at?: string;
}

export interface RuntimeJob {
  id?: string;
  type?: string;
  status?: string;
  created_at?: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  read?: boolean;
  created_at: string;
}

export interface SchedulerTask {
  id: string;
  task_type: string;
  interval?: string;
  next_run?: string;
  enabled?: boolean;
}

// ── Doctrine ──
export interface DoctrineAnswer {
  reply: string;
  voice_reply: string;
  matched_rule?: string;
}

export interface DoctrineSeedStatus {
  app_id: string;
  seeded: boolean;
}

export interface GroundingResult {
  is_project_domain: boolean;
  grounding: string;
  applied_prompt: string;
  has_confusion: boolean;
}

// ── Profile ──
export interface EnergyPattern {
  period: string;
  label: string;
}

export interface BehaviorTrigger {
  trigger: string;
  context: string;
  count: number;
}

export interface ActiveProject {
  name: string;
  lastInteraction: string;
}

export interface CategorySpending {
  category: string;
  average: number;
  count: number;
}

export interface HabitInfo {
  name: string;
  consistency: number;
  lastDate: string;
}

export interface AionProfile {
  version: number;
  updatedAt: string;
  userName: string;
  energyPattern: EnergyPattern[];
  behaviorTriggers: BehaviorTrigger[];
  activeProjects: ActiveProject[];
  categorySpending: CategorySpending[];
  consistentHabits: HabitInfo[];
  abandonedHabits: HabitInfo[];
  currentGoal: string;
  lastFinancialReview: string | null;
  lastGoalReview: string | null;
}

export interface ProfileResponse {
  profile: AionProfile;
  formatted: string;
}

// ── Alert ──
export type AlertType =
  | "FINANCEIRO_ALTO" | "HABITO_ABANDONADO" | "PROJETO_INATIVO"
  | "META_EM_RISCO" | "TAREFA_VENCENDO" | "PADRAO_POSITIVO";

export interface AionAlert {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  urgency: "low" | "medium" | "high";
  suggestedAction?: string;
  createdAt: string;
  shown: boolean;
  sourceId?: string;
}

export interface AlertCheckResult {
  status: string;
  new_alerts: AionAlert[];
  count: number;
}

// ── Conversation ──
export interface ConversationEnhancement {
  conversationalOpening?: string;
  humanizedReply: string;
  suggestion?: string;
  followUpQuestion?: string;
  emotionalTone?: string;
  shouldAskFollowUp: boolean;
  shouldContinueConversation: boolean;
}

// ── Teach ──
export interface TeachResponse {
  answer?: string;
  source?: string;
}

// ── Voice ──
export interface VoiceResponse {
  audio_url?: string;
  text?: string;
}

// ── Proactive ──
export interface ProactiveResult {
  should_speak?: boolean;
  message?: string;
}

// ── Generic ──
export interface StatusResponse {
  status: string;
  app_id: string;
  message?: string;
}
