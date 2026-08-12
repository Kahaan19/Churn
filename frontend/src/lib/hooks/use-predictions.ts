"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchBatch,
  fetchBatchItems,
  fetchBatches,
  fetchPrediction,
  scoreSingle,
  uploadScoringCsv,
  type BatchItemsQuery,
} from "@/lib/api/predictions";
import { queryKeys } from "@/lib/query-keys";

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const POLL_INTERVAL_MS = 1500;

export function useScoreSingle(runId: string) {
  return useMutation({
    mutationFn: (features: Record<string, string | number>) => scoreSingle(runId, features),
  });
}

export function useUploadScoringCsv(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadScoringCsv(runId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });
}

export function useBatchesQuery(limit = 50, offset = 0) {
  return useQuery({
    queryKey: queryKeys.batches(limit, offset),
    queryFn: ({ signal }) => fetchBatches({ limit, offset }, signal),
  });
}

export function useBatchQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.batch(id),
    queryFn: ({ signal }) => fetchBatch(id, signal),
    refetchInterval: (query) =>
      query.state.data && ACTIVE_STATUSES.has(query.state.data.status) ? POLL_INTERVAL_MS : false,
  });
}

export function useBatchItemsQuery(id: string, query: BatchItemsQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.batchItems(id, query),
    queryFn: ({ signal }) => fetchBatchItems(id, query, signal),
    enabled,
    // Keeps the table on screen while a filter change is in flight, instead of flashing a skeleton.
    placeholderData: (previous) => previous,
  });
}

export function usePredictionQuery(id: string | null) {
  return useQuery({
    queryKey: queryKeys.prediction(id ?? ""),
    queryFn: ({ signal }) => fetchPrediction(id ?? "", signal),
    enabled: id !== null,
  });
}
