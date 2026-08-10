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
};
