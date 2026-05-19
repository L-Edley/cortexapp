const PREFIX_MAP: Record<string, string> = {
  task: "task",
  expense: "fin",
  idea: "idea",
  daily_review: "daily",
  focus_request: "task",
  project_note: "project",
  unknown: "note",
  note: "note",
  memory: "note",
};

function prefixForType(type?: string): string {
  if (type && type in PREFIX_MAP) {
    return PREFIX_MAP[type];
  }
  return "rec";
}

function suffix(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  }
  return Math.random().toString(36).slice(2, 8);
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function generateRecordId(type?: string): string {
  const prefix = prefixForType(type);
  const stamp = todayStamp();
  return `${prefix}_${stamp}_${suffix()}`;
}
