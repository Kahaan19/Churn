import type { BatchItemsQuery } from "@/lib/api/predictions";
import type { KpiQuery } from "@/lib/api/runs";

export const queryKeys = {
  health: ["health"] as const,
  settings: ["settings"] as const,
  datasets: (limit: number, offset: number) => ["datasets", limit, offset] as const,
  dataset: (id: string) => ["dataset", id] as const,
  datasetQuality: (id: string) => ["dataset", id, "quality"] as const,
  datasetEda: (id: string) => ["dataset", id, "eda"] as const,
  runs: (limit: number, offset: number) => ["runs", limit, offset] as const,
  run: (id: string) => ["run", id] as const,
  runCalibration: (id: string) => ["run", id, "calibration"] as const,
  runImportance: (id: string) => ["run", id, "importance"] as const,
  // The assumptions are part of the key: the same run under two save rates is two answers, and
  // caching them separately is what makes dragging the slider back feel instant.
  runKpis: (id: string, query: KpiQuery) =>
    ["run", id, "kpis", query.saveRate ?? null, query.grossMargin ?? null] as const,
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
