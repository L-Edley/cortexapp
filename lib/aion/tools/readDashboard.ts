import type { CortexRecord } from "@/lib/types";

export type DashboardSummary = {
  totalRecords: number;
  pendingTasks: number;
  completedTasks: number;
  totalExpenses: number;
  expenseCount: number;
  ideasCount: number;
  latestEntries: CortexRecord[];
};

export function summarizeRecords(
  records: CortexRecord[]
): DashboardSummary {
  if (!records || records.length === 0) {
    return {
      totalRecords: 0,
      pendingTasks: 0,
      completedTasks: 0,
      totalExpenses: 0,
      expenseCount: 0,
      ideasCount: 0,
      latestEntries: [],
    };
  }

  const pendingTasks = records.filter(
    (r) => r.type === "task" && r.status === "pending"
  ).length;

  const completedTasks = records.filter(
    (r) => r.type === "task" && r.status === "done"
  ).length;

  const expenses = records.filter((r) => r.type === "expense");
  const totalExpenses = expenses.reduce(
    (sum, r) => sum + (r.amount || 0),
    0
  );
  const expenseCount = expenses.length;

  const ideasCount = records.filter((r) => r.type === "idea").length;

  return {
    totalRecords: records.length,
    pendingTasks,
    completedTasks,
    totalExpenses,
    expenseCount,
    ideasCount,
    latestEntries: records.slice(0, 5),
  };
}
