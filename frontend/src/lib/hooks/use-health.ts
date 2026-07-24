"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchHealth } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 30_000,
  });
}
