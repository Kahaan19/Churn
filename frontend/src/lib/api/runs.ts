import { API_BASE_URL, parseOrThrow } from "@/lib/api/client";
import type { paths } from "@/lib/api/generated";

export type Run =
  paths["/api/v1/runs/{run_id}"]["get"]["responses"][200]["content"]["application/json"];
export type PaginatedRuns =
  paths["/api/v1/runs"]["get"]["responses"][200]["content"]["application/json"];
export type RunCreate =
  paths["/api/v1/runs"]["post"]["requestBody"]["content"]["application/json"];
export type CalibrationCurve =
  paths["/api/v1/runs/{run_id}/calibration"]["get"]["responses"][200]["content"]["application/json"];
export type GlobalImportance =
  paths["/api/v1/runs/{run_id}/importance"]["get"]["responses"][200]["content"]["application/json"];
export type Explanation =
  paths["/api/v1/runs/{run_id}/explain"]["post"]["responses"][200]["content"]["application/json"];
export type FeatureContribution = Explanation["shap_values"][number];
export type PortfolioKpis =
  paths["/api/v1/runs/{run_id}/kpis"]["get"]["responses"][200]["content"]["application/json"];
export type TierKpi = PortfolioKpis["tiers"][number];

export async function fetchRuns(
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<PaginatedRuns> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const response = await fetch(`${API_BASE_URL}/api/v1/runs?${params}`, { signal });
  return parseOrThrow(response);
}

export async function fetchRun(id: string, signal?: AbortSignal): Promise<Run> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${id}`, { signal });
  return parseOrThrow(response);
}

export async function fetchCalibration(
  id: string,
  signal?: AbortSignal,
): Promise<CalibrationCurve> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${id}/calibration`, { signal });
  return parseOrThrow(response);
}

export async function fetchImportance(
  id: string,
  signal?: AbortSignal,
): Promise<GlobalImportance> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${id}/importance`, { signal });
  return parseOrThrow(response);
}

export async function explainCustomer(
  id: string,
  features: Record<string, string | number>,
): Promise<Explanation> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${id}/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
  });
  return parseOrThrow(response);
}

export async function createRun(payload: RunCreate): Promise<Run> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseOrThrow(response);
}

export interface KpiQuery {
  /** Both are `undefined` for "use the configured value", never 0 as a sentinel. */
  saveRate?: number;
  grossMargin?: number;
}

export async function fetchKpis(
  id: string,
  { saveRate, grossMargin }: KpiQuery = {},
  signal?: AbortSignal,
): Promise<PortfolioKpis> {
  const params = new URLSearchParams();
  if (saveRate !== undefined) params.set("save_rate", String(saveRate));
  if (grossMargin !== undefined) params.set("gross_margin", String(grossMargin));
  const query = params.size > 0 ? `?${params}` : "";
  const response = await fetch(`${API_BASE_URL}/api/v1/runs/${id}/kpis${query}`, { signal });
  return parseOrThrow(response);
}
