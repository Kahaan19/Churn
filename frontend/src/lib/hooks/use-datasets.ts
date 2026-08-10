"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  deleteDataset,
  fetchDataset,
  fetchDatasets,
  fetchEda,
  fetchQuality,
  loadSampleDataset,
  updateProfile,
  uploadDataset,
  type ColumnProfileUpdate,
} from "@/lib/api/datasets";
import { queryKeys } from "@/lib/query-keys";

export function useDatasetsQuery(limit = 50, offset = 0) {
  return useQuery({
    queryKey: queryKeys.datasets(limit, offset),
    queryFn: ({ signal }) => fetchDatasets({ limit, offset }, signal),
  });
}

export function useDatasetQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dataset(id),
    queryFn: ({ signal }) => fetchDataset(id, signal),
    // Callers that resolve the id from another query (a run's dataset_id) pass `enabled` so no
    // request is made against an empty id while that query is still in flight.
    enabled: enabled && id !== "",
  });
}

export function useQualityQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.datasetQuality(id),
    queryFn: ({ signal }) => fetchQuality(id, signal),
  });
}

export function useEdaQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.datasetEda(id),
    queryFn: ({ signal }) => fetchEda(id, signal),
  });
}

export function useUploadDataset() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: (file: File) => uploadDataset(file, setProgress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setProgress(0);
    },
  });

  return { ...mutation, progress };
}

export function useLoadSampleDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: loadSampleDataset,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

export function useUpdateProfile(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ColumnProfileUpdate) => updateProfile(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dataset(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.datasetQuality(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.datasetEda(id) });
    },
  });
}

export function useDeleteDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDataset,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}
