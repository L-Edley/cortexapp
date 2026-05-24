import { getAlerts, checkAlerts, dismissAlert, clearOldAlerts as coreClearOld } from "@/lib/aion/coreProxy";
import type { CoreAlertItem } from "@/lib/aion/coreProxy";

export type AionAlertType =
  | "FINANCEIRO_ALTO"
  | "HABITO_ABANDONADO"
  | "PROJETO_INATIVO"
  | "META_EM_RISCO"
  | "TAREFA_VENCENDO"
  | "PADRAO_POSITIVO";

export type AionAlertUrgency = "low" | "medium" | "high";

export type AionAlert = {
  id: string;
  type: AionAlertType;
  title: string;
  description: string;
  urgency: AionAlertUrgency;
  suggestedAction?: string;
  createdAt: string;
  shown: boolean;
  sourceId?: string;
};

function mapCoreAlert(a: CoreAlertItem): AionAlert {
  return {
    id: a.id,
    type: a.type as AionAlertType,
    title: a.title,
    description: a.description,
    urgency: a.urgency as AionAlertUrgency,
    suggestedAction: a.suggestedAction,
    createdAt: a.createdAt,
    shown: a.shown,
    sourceId: a.sourceId,
  };
}

export async function checkAllAlerts(): Promise<AionAlert[]> {
  const result = await checkAlerts();
  if (result?.new_alerts) {
    return result.new_alerts.map(mapCoreAlert);
  }
  return [];
}

export async function getUnshownAlerts(): Promise<AionAlert[]> {
  const result = await getAlerts(true);
  if (result?.alerts) {
    return result.alerts.map(mapCoreAlert);
  }
  return [];
}

export async function markAlertShown(id: string): Promise<void> {
  await dismissAlert(id);
}

export async function clearOldAlerts(days = 30): Promise<void> {
  await coreClearOld(days);
}
