import type { paths } from "@/lib/api/generated";

export type HealthResponse =
  paths["/health"]["get"]["responses"][200]["content"]["application/json"];

export const API_BASE_URL =
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

/**
 * Error envelopes carry a human-readable message naming the offending column, row, or field.
 * Surfacing that verbatim is the difference between "upload failed" and "you're missing Contract",
 * so every fetcher in `lib/api` goes through here rather than inventing its own message.
 */
export async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // Non-JSON error body (a proxy timeout, say) — the status-code message stands.
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, { signal });
  if (!response.ok) {
    throw new ApiError(`Health request failed (${response.status})`, response.status);
  }
  return (await response.json()) as HealthResponse;
}
