import { API_BASE_URL, parseOrThrow } from "@/lib/api/client";
import type { paths } from "@/lib/api/generated";

export type Prediction =
  paths["/api/v1/predictions/{prediction_id}"]["get"]["responses"][200]["content"]["application/json"];
export type PredictionBatch =
  paths["/api/v1/predictions/batch/{batch_id}"]["get"]["responses"][200]["content"]["application/json"];
export type PaginatedBatches =
  paths["/api/v1/predictions/batch"]["get"]["responses"][200]["content"]["application/json"];
export type PaginatedItems =
  paths["/api/v1/predictions/batch/{batch_id}/items"]["get"]["responses"][200]["content"]["application/json"];
export type PredictionListItem = PaginatedItems["items"][number];
export type BatchSummary = NonNullable<PredictionBatch["summary"]>;
export type Financials = Prediction["financials"];
export type Assumptions = Financials["assumptions"];
export type RiskTier = Prediction["risk_tier"];
export type SortKey = NonNullable<
  paths["/api/v1/predictions/batch/{batch_id}/items"]["get"]["parameters"]["query"]
>["sort"];

export async function scoreSingle(
  runId: string,
  features: Record<string, string | number>,
): Promise<Prediction> {
  const response = await fetch(`${API_BASE_URL}/api/v1/predictions/single`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, features }),
  });
  return parseOrThrow(response);
}

export async function uploadScoringCsv(runId: string, file: File): Promise<PredictionBatch> {
  const body = new FormData();
  body.append("run_id", runId);
  body.append("file", file);
  const response = await fetch(`${API_BASE_URL}/api/v1/predictions/batch`, {
    method: "POST",
    body,
  });
  return parseOrThrow(response);
}

export async function fetchBatches(
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<PaginatedBatches> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const response = await fetch(`${API_BASE_URL}/api/v1/predictions/batch?${params}`, { signal });
  return parseOrThrow(response);
}

export async function fetchBatch(id: string, signal?: AbortSignal): Promise<PredictionBatch> {
  const response = await fetch(`${API_BASE_URL}/api/v1/predictions/batch/${id}`, { signal });
  return parseOrThrow(response);
}

export interface BatchItemsQuery {
  riskTier?: RiskTier | null;
  segment?: string | null;
  sort?: SortKey;
  limit?: number;
  offset?: number;
}

export async function fetchBatchItems(
  id: string,
  { riskTier, segment, sort = "expected_value_at_risk", limit = 50, offset = 0 }: BatchItemsQuery,
  signal?: AbortSignal,
): Promise<PaginatedItems> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort: sort ?? "expected_value_at_risk",
  });
  if (riskTier) params.set("risk_tier", riskTier);
  if (segment) params.set("segment", segment);
  const response = await fetch(
    `${API_BASE_URL}/api/v1/predictions/batch/${id}/items?${params}`,
    { signal },
  );
  return parseOrThrow(response);
}

export async function fetchPrediction(id: string, signal?: AbortSignal): Promise<Prediction> {
  const response = await fetch(`${API_BASE_URL}/api/v1/predictions/${id}`, { signal });
  return parseOrThrow(response);
}
