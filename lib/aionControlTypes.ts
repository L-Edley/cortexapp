export interface ControlOverview {
  app_id: string
  status: "ok" | "degraded" | "error" | "offline"
  version: string
  uptime_seconds: number
  mode_summary: Record<string, string>
  brain: BrainStatus
  providers: ProviderStatus
  sync: SyncOverview
  study: StudyOverview
  dev: DevOverview
  jobs: JobsOverview
  warnings: string[]
  generated_at: string
}

export interface BrainStatus {
  sqlite: string
  chroma: string
  obsidian: string
  supabase: string
  memories_count: number
  knowledge_count: number
  decisions_count: number
  total_vectors: number
  last_activity: string | null
  warnings: string[]
}

export interface ProviderStatus {
  groq: string
  gemini: string
  openai: string
  ollama: string
  mock: string
  preferred_provider: string
  warnings: string[]
}

export interface SyncOverview {
  pending: number
  syncing: number
  synced: number
  failed: number
  last_sync_at: string | null
  scheduler_enabled: boolean
  warnings: string[]
}

export interface StudyOverview {
  last_study_report: Record<string, unknown> | null
  last_desktop_study_report: Record<string, unknown> | null
  active_desktop_sessions: number
  knowledge_saved_total: number
  last_run_at: string | null
  warnings: string[]
}

export interface DevOverview {
  last_project_analyzed: string | null
  last_dev_lesson: string | null
  last_validation: string | null
  dev_lessons_count: number
  warnings: string[]
}

export interface JobsOverview {
  active_jobs: number
  recent_jobs: { id: string; type: string; status: string }[]
  failed_jobs: { id: string; type: string; error: string }[]
  rebuild_jobs: number
  study_jobs: number
  desktop_study_sessions: number
  warnings: string[]
}

export interface OfflineResponse {
  status: "offline"
  error: string
  warnings: string[]
}
