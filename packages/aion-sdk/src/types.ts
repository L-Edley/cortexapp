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

export interface TenantStats {
  app_id: string;
  memories: number;
  knowledge: number;
  decisions: number;
  initialized: boolean;
  last_activity: string | null;
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

export interface AionConfig {
  baseUrl: string;
  appId: string;
  apiKey: string;
  timeout?: number;
  fallback?: boolean;
}
