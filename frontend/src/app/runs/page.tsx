"use client";

import Link from "next/link";

import { RunLaunchForm } from "@/components/run-launch-form";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useRunsQuery } from "@/lib/hooks/use-runs";

const STATUS_VARIANT = {
  queued: "secondary",
  running: "secondary",
  succeeded: "default",
  failed: "destructive",
} as const;

export default function RunsPage() {
  const { data, isPending, isError, error, refetch } = useRunsQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Training runs</h1>
        <p className="text-sm text-muted-foreground">
          Train churn models on a profiled dataset and compare them by PR-AUC.
        </p>
      </div>

      <RunLaunchForm />

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Runs</h2>

        {isPending && <LoadingRows rows={2} label="Loading runs" />}

        {isError && (
          <ErrorState
            error={error}
            fallback="Couldn't load your training runs. Check that the API is running."
            onRetry={() => void refetch()}
          />
        )}

        {data && data.items.length === 0 && (
          <EmptyState
            title="No runs yet"
            body="Train one above to see how well a model can pick out the customers about to leave."
          />
        )}

        {data && data.items.length > 0 && (
          <div className="space-y-2">
            {data.items.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm">{run.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.config.algorithms.length} algorithms
                        {run.config.tune ? " · tuned" : ""} ·{" "}
                        {new Date(run.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
