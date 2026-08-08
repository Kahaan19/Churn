import { API_BASE_URL, ApiError } from "@/lib/api/client";
import type { paths } from "@/lib/api/generated";

export type Dataset =
  paths["/api/v1/datasets/{dataset_id}"]["get"]["responses"][200]["content"]["application/json"];
export type PaginatedDatasets =
  paths["/api/v1/datasets"]["get"]["responses"][200]["content"]["application/json"];
export type QualityReport =
  paths["/api/v1/datasets/{dataset_id}/quality"]["get"]["responses"][200]["content"]["application/json"];
export type EDAPayload =
  paths["/api/v1/datasets/{dataset_id}/eda"]["get"]["responses"][200]["content"]["application/json"];
export type ColumnProfileUpdate =
  paths["/api/v1/datasets/{dataset_id}/profile"]["patch"]["requestBody"]["content"]["application/json"];

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchDatasets(
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<PaginatedDatasets> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets?${params}`, { signal });
  return parseOrThrow(response);
}

export async function fetchDataset(id: string, signal?: AbortSignal): Promise<Dataset> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/${id}`, { signal });
  return parseOrThrow(response);
}

export async function fetchQuality(id: string, signal?: AbortSignal): Promise<QualityReport> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/${id}/quality`, { signal });
  return parseOrThrow(response);
}

export async function fetchEda(id: string, signal?: AbortSignal): Promise<EDAPayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/${id}/eda`, { signal });
  return parseOrThrow(response);
}

export async function loadSampleDataset(): Promise<Dataset> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/sample`, { method: "POST" });
  return parseOrThrow(response);
}

export async function updateProfile(id: string, patch: ColumnProfileUpdate): Promise<Dataset> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/${id}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseOrThrow(response);
}

export async function deleteDataset(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/datasets/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }
}

/**
 * XHR rather than fetch: fetch has no upload-progress event, and a large CSV upload
 * without visible progress reads as a hang.
 */
export function uploadDataset(file: File, onProgress?: (pct: number) => void): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/api/v1/datasets`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as Dataset);
      } else {
        reject(new ApiError(`Upload failed (${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("Upload failed (network error)", 0));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}
