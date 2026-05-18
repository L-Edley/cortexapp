import { checkObsidianConnection, getObsidianConfig } from "./client";

export type ObsidianHealthStatus = {
  configured: boolean;
  online: boolean;
  url: string;
};

export async function getObsidianHealth(): Promise<ObsidianHealthStatus> {
  const config = getObsidianConfig();
  const online = config.enabled ? await checkObsidianConnection() : false;
  return {
    configured: config.enabled,
    online,
    url: config.baseUrl,
  };
}
