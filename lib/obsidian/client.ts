function isClient(): boolean {
  return typeof window !== "undefined";
}

function isServer(): boolean {
  return typeof window === "undefined";
}

export type ObsidianClientConfig = {
  enabled: boolean;
  baseUrl: string;
};

export function getObsidianConfig(): ObsidianClientConfig {
  const restUrl =
    (isServer()
      ? process.env.OBSIDIAN_REST_URL
      : process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL) ?? null;
  const enabled = isClient()
    ? process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED === "true"
    : !!restUrl;
  return {
    enabled,
    baseUrl: restUrl || "http://127.0.0.1:27123",
  };
}

export async function obsidianRequest(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `/api/obsidian/${path.replace(/^\//, "")}`;
  return fetch(url, { ...options });
}

export async function checkObsidianConnection(): Promise<boolean> {
  if (!isClient()) return false;
  const config = getObsidianConfig();
  if (!config.enabled) return false;
  try {
    const res = await fetch("/api/obsidian/health");
    const data = await res.json();
    return data.online === true;
  } catch {
    return false;
  }
}

export async function writeVaultFile(
  path: string,
  content: string
): Promise<void> {
  const config = getObsidianConfig();
  if (!config.enabled) return;
  const encoded = encodeURIComponent(path);
  const res = await obsidianRequest(`vault/${encoded}`, {
    method: "PUT",
    body: content,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Obsidian write failed (${res.status}): ${body}`);
  }
}

export async function deleteVaultFile(path: string): Promise<void> {
  const config = getObsidianConfig();
  if (!config.enabled) return;
  const encoded = encodeURIComponent(path);
  const res = await obsidianRequest(`vault/${encoded}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Obsidian delete failed (${res.status}): ${body}`);
  }
}

export async function readVaultFile(path: string): Promise<string | null> {
  const config = getObsidianConfig();
  if (!config.enabled) return null;
  try {
    const encoded = encodeURIComponent(path);
    const res = await obsidianRequest(`vault/${encoded}`);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}
