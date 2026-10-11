"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { LoginRequest, Plan, SavedPlanItem, User } from "@/lib/types";

export const keys = {
  plan: (id: string) => ["plan", id] as const,
  saved: ["plans", "saved"] as const,
  me: ["me"] as const,
};

export function usePlan(id: string, enabled = true) {
  return useQuery({
    queryKey: keys.plan(id),
    queryFn: ({ signal }) => apiFetch<Plan>(`/plans/${encodeURIComponent(id)}`, { signal }),
    enabled,
  });
}

export function useSavedPlans() {
  return useQuery({
    queryKey: keys.saved,
    queryFn: ({ signal }) => apiFetch<SavedPlanItem[]>("/plans/saved", { signal }),
  });
}

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Plan>(`/plans/${encodeURIComponent(id)}/save`, { method: "POST" }),
    onSuccess: (plan) => {
      qc.setQueryData(keys.plan(plan.id), plan);
      void qc.invalidateQueries({ queryKey: keys.saved });
    },
  });
}

/** Resolves to `null` when signed out (401) so callers can branch without error handling. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<User>("/auth/me", { signal });
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 501)) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: LoginRequest) => apiFetch<User>("/auth/login", { method: "POST", body: values }),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(keys.me, null);
      qc.removeQueries({ queryKey: keys.saved });
    },
  });
}
