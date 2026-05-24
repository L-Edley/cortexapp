import type { ControlOverview, BrainStatus, ProviderStatus, SyncOverview, StudyOverview, DevOverview, JobsOverview } from "@/lib/aionControlTypes";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Erro ${res.status} ao consultar ${url}`);
  }
  return res.json();
}

export async function getControlOverview(): Promise<ControlOverview> {
  return fetchJson<ControlOverview>("/api/aion/control/overview");
}

export async function getBrainStatus(): Promise<BrainStatus> {
  return fetchJson<BrainStatus>("/api/aion/control/brain");
}

export async function getProviderStatus(): Promise<ProviderStatus> {
  return fetchJson<ProviderStatus>("/api/aion/control/providers");
}

export async function getSyncOverview(): Promise<SyncOverview> {
  return fetchJson<SyncOverview>("/api/aion/control/sync");
}

export async function getStudyOverview(): Promise<StudyOverview> {
  return fetchJson<StudyOverview>("/api/aion/control/study");
}

export async function getDevOverview(): Promise<DevOverview> {
  return fetchJson<DevOverview>("/api/aion/control/dev");
}

export async function getJobsOverview(): Promise<JobsOverview> {
  return fetchJson<JobsOverview>("/api/aion/control/jobs");
}
