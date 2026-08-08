export const queryKeys = {
  health: ["health"] as const,
  datasets: (limit: number, offset: number) => ["datasets", limit, offset] as const,
  dataset: (id: string) => ["dataset", id] as const,
  datasetQuality: (id: string) => ["dataset", id, "quality"] as const,
  datasetEda: (id: string) => ["dataset", id, "eda"] as const,
};
