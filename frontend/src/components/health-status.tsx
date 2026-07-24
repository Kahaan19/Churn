"use client";

import { HealthStatusView, type HealthState } from "@/components/health-status-view";
import { useHealth } from "@/lib/hooks/use-health";

export function HealthStatus() {
  const query = useHealth();

  let state: HealthState;
  if (query.isPending) {
    state = { status: "loading" };
  } else if (query.isError) {
    state = { status: "error", onRetry: () => void query.refetch() };
  } else {
    state = { status: "success", version: query.data.version, db: query.data.db };
  }

  return <HealthStatusView state={state} />;
}
