"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createRun,
  explainCustomer,
  fetchCalibration,
  fetchImportance,
  fetchKpis,
  fetchRun,
  fetchRuns,
  type KpiQuery,
  type RunCreate,
} from "@/lib/api/runs";
import { queryKeys } from "@/lib/query-keys";

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const POLL_INTERVAL_MS = 2000;

export function useRunsQuery(limit = 50, offset = 0) {
  return useQuery({
    queryKey: queryKeys.runs(limit, offset),
    queryFn: ({ signal }) => fetchRuns({ limit, offset }, signal),
  });
}

export function useRunQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.run(id),
    queryFn: ({ signal }) => fetchRun(id, signal),
    refetchInterval: (query) =>
      query.state.data && ACTIVE_STATUSES.has(query.state.data.status) ? POLL_INTERVAL_MS : false,
  });
}

export function useCalibrationQuery(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.runCalibration(id),
    queryFn: ({ signal }) => fetchCalibration(id, signal),
    enabled,
  });
}

export function useImportanceQuery(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.runImportance(id),
    queryFn: ({ signal }) => fetchImportance(id, signal),
    enabled,
  });
}

export function useExplainCustomer(id: string) {
  return useMutation({
    mutationFn: (features: Record<string, string | number>) => explainCustomer(id, features),
  });
}

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RunCreate) => createRun(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useKpisQuery(id: string, query: KpiQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.runKpis(id, query),
    queryFn: ({ signal }) => fetchKpis(id, query, signal),
    enabled,
    // Dragging an assumption slider must not blank the figures it is changing — the previous
    // answer stays on screen, marked stale, until the new one lands.
    placeholderData: (previous) => previous,
  });
}
