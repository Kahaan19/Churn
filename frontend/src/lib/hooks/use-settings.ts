"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchSettings } from "@/lib/api/settings";
import { queryKeys } from "@/lib/query-keys";

export function useSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: ({ signal }) => fetchSettings(signal),
    // Config changes require a backend restart, so there is nothing to poll for.
    staleTime: Infinity,
  });
}
