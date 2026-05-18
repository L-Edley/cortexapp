import type { CortexApiResponse } from "@/lib/types";

export function parseRecordFromDecision(
  record: unknown,
  message: string
): CortexApiResponse | null {
  if (!record || typeof record !== "object") return null;

  const r = record as Record<string, unknown>;

  const validTypes = [
    "task",
    "idea",
    "expense",
    "project_note",
    "daily_review",
    "focus_request",
    "unknown",
  ] as const;

  const validPriorities = ["low", "medium", "high"] as const;

  return {
    type: validTypes.includes(r.type as never)
      ? (r.type as CortexApiResponse["type"])
      : "unknown",
    title:
      typeof r.title === "string" && r.title.trim().length > 0
        ? r.title.trim()
        : message.trim(),
    description:
      typeof r.description === "string" ? r.description : "",
    priority: validPriorities.includes(r.priority as never)
      ? (r.priority as CortexApiResponse["priority"])
      : "medium",
    project:
      typeof r.project === "string" && r.project.trim().length > 0
        ? r.project.trim()
        : null,
    amount: typeof r.amount === "number" ? r.amount : null,
    category:
      typeof r.category === "string" && r.category.trim().length > 0
        ? r.category.trim()
        : null,
    dueDate:
      typeof r.dueDate === "string" && r.dueDate.trim().length > 0
        ? r.dueDate.trim()
        : null,
    nextAction:
      typeof r.nextAction === "string" ? r.nextAction : "",
  };
}
