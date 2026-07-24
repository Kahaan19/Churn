import type { paths } from "@/lib/api/generated";

export type HealthResponse =
  paths["/health"]["get"]["responses"][200]["content"]["application/json"];

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, { signal });
  if (!response.ok) {
    throw new ApiError(`Health request failed (${response.status})`, response.status);
  }
  return (await response.json()) as HealthResponse;
}
