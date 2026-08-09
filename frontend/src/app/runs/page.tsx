"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RunLaunchForm } from "@/components/run-launch-form";
import { useRunsQuery } from "@/lib/hooks/use-runs";

const STATUS_VARIANT = {
  queued: "secondary",
  running: "secondary",
  succeeded: "default",
  failed: "destructive",
} as const;

export default function RunsPage() {
  const { data, isPending, isError, refetch } = useRunsQuery();

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

        {isPending && (
          <div className="space-y-2" aria-busy="true" aria-label="Loading runs">
            <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
          </div>
        )}

        {isError && (
          <Card>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Couldn&apos;t load runs.</p>
              <button
                onClick={() => void refetch()}
                className="text-sm font-medium text-primary hover:underline"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        )}

        {data && data.items.length === 0 && (
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No runs yet — train one above to see model performance.
              </p>
            </CardContent>
          </Card>
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
