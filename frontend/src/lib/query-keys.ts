import type { BatchItemsQuery } from "@/lib/api/predictions";

export const queryKeys = {
  health: ["health"] as const,
  datasets: (limit: number, offset: number) => ["datasets", limit, offset] as const,
  dataset: (id: string) => ["dataset", id] as const,
  datasetQuality: (id: string) => ["dataset", id, "quality"] as const,
  datasetEda: (id: string) => ["dataset", id, "eda"] as const,
  runs: (limit: number, offset: number) => ["runs", limit, offset] as const,
  run: (id: string) => ["run", id] as const,
  runCalibration: (id: string) => ["run", id, "calibration"] as const,
  runImportance: (id: string) => ["run", id, "importance"] as const,
  batches: (limit: number, offset: number) => ["batches", limit, offset] as const,
  batch: (id: string) => ["batch", id] as const,
  batchItems: (id: string, query: BatchItemsQuery) =>
    [
      "batch",
      id,
      "items",
      query.riskTier ?? null,
      query.segment ?? null,
      query.sort ?? "expected_value_at_risk",
      query.limit ?? 50,
      query.offset ?? 0,
    ] as const,
  prediction: (id: string) => ["prediction", id] as const,
};
