// Typed wrappers around the shared api client, kept local to app/planner
// since @/lib/api-client itself is shared by the other two apps too.

import { api } from "@/lib/api-client";
import type { Report } from "@/lib/calc/planner";

export interface Category {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  userId: string;
  categoryId: string;
  month: string;
  amountMinorUnits: number;
  createdAt: string;
  updatedAt: string;
}

export interface Actual {
  id: string;
  userId: string;
  categoryId: string;
  month: string;
  amountMinorUnits: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PeriodLock {
  id: string;
  userId: string;
  month: string;
  createdAt: string;
}

export const plannerKeys = {
  categories: ["planner", "categories"] as const,
  plans: (from: string, to: string) => ["planner", "plans", from, to] as const,
  actuals: (from: string, to: string) => ["planner", "actuals", from, to] as const,
  locks: ["planner", "locks"] as const,
  report: (from: string, to: string) => ["planner", "report", from, to] as const,
};

export const plannerApi = {
  listCategories: () => api.get<{ categories: Category[] }>("/api/planner/categories"),
  createCategory: (name: string) => api.post<{ category: Category }>("/api/planner/categories", { name }),
  updateCategory: (id: string, name: string) =>
    api.patch<{ category: Category }>(`/api/planner/categories/${id}`, { name }),
  deleteCategory: (id: string) => api.delete<void>(`/api/planner/categories/${id}`),

  listPlans: (from: string, to: string) => api.get<{ plans: Plan[] }>(`/api/planner/plans?from=${from}&to=${to}`),
  upsertPlan: (body: { categoryId: string; month: string; amountMinorUnits: number }) =>
    api.put<{ plan: Plan }>("/api/planner/plans", body),

  listActuals: (from: string, to: string, categoryId?: string) =>
    api.get<{ actuals: Actual[] }>(
      `/api/planner/actuals?from=${from}&to=${to}${categoryId ? `&categoryId=${categoryId}` : ""}`,
    ),
  createActual: (body: { categoryId: string; month: string; amountMinorUnits: number; note?: string }) =>
    api.post<{ actual: Actual }>("/api/planner/actuals", body),
  updateActual: (
    id: string,
    body: Partial<{ categoryId: string; month: string; amountMinorUnits: number; note: string | null }>,
  ) => api.patch<{ actual: Actual }>(`/api/planner/actuals/${id}`, body),
  deleteActual: (id: string) => api.delete<void>(`/api/planner/actuals/${id}`),
  importActuals: (csv: string) => api.post<{ imported: number }>("/api/planner/actuals/import", { csv }),

  listLocks: () => api.get<{ locks: PeriodLock[] }>("/api/planner/locks"),
  lockMonth: (month: string) => api.post<{ lock: PeriodLock }>("/api/planner/locks", { month }),
  unlockMonth: (month: string) => api.delete<void>(`/api/planner/locks/${month}`),

  getReport: (from: string, to: string) => api.get<Report>(`/api/planner/report?from=${from}&to=${to}`),
};
