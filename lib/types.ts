export type CortexRecordType =
  | "task"
  | "idea"
  | "expense"
  | "project_note"
  | "daily_review"
  | "focus_request"
  | "unknown";

export type Priority = "low" | "medium" | "high";
export type RecordStatus = "pending" | "done" | "archived" | "promoted";

export type CortexRecord = {
  id: string;
  type: CortexRecordType;
  title: string;
  description: string;
  priority: Priority;
  project: string | null;
  amount: number | null;
  category: string | null;
  dueDate: string | null;
  nextAction: string;
  status: RecordStatus;
  createdAt: string;
};

export type CortexApiResponse = {
  type: CortexRecordType;
  title: string;
  description: string;
  priority: Priority;
  project: string | null;
  amount: number | null;
  category: string | null;
  dueDate: string | null;
  nextAction: string;
};
