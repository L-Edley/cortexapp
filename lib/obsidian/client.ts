export type ObsidianClientConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
};

export function getObsidianConfig(): ObsidianClientConfig {
  return {
    enabled:
      (typeof process !== "undefined"
        ? process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED
        : "false") === "true",
    baseUrl:
      (typeof process !== "undefined"
        ? process.env.NEXT_PUBLIC_OBSIDIAN_REST_URL
        : undefined) || "http://127.0.0.1:27123",
    apiKey:
      typeof process !== "undefined"
        ? process.env.NEXT_PUBLIC_OBSIDIAN_API_KEY
        : undefined,
  };
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

export async function obsidianRequest(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const config = getObsidianConfig();
  const url = `${config.baseUrl}/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  return fetch(url, { ...options, headers });
}

export async function checkObsidianConnection(): Promise<boolean> {
  if (!isClient()) return false;
  const config = getObsidianConfig();
  if (!config.enabled) return false;
  try {
    const res = await obsidianRequest("");
    return res.ok;
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
    throw new Error(
      `Obsidian write failed (${res.status}): ${res.statusText}`
    );
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
    throw new Error(
      `Obsidian delete failed (${res.status}): ${res.statusText}`
    );
  }
}

export async function readVaultFile(
  path: string
): Promise<string | null> {
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
