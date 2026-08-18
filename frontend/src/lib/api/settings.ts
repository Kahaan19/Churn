import { API_BASE_URL, parseOrThrow } from "@/lib/api/client";
import type { paths } from "@/lib/api/generated";

export type PlatformSettings =
  paths["/api/v1/settings"]["get"]["responses"][200]["content"]["application/json"];

export async function fetchSettings(signal?: AbortSignal): Promise<PlatformSettings> {
  const response = await fetch(`${API_BASE_URL}/api/v1/settings`, { signal });
  return parseOrThrow(response);
}
