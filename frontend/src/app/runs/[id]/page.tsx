"use client";

import { use } from "react";

import { CalibrationChart } from "@/components/calibration-chart";
import { ExplainPanel } from "@/components/explain-panel";
import { GlobalImportanceChart } from "@/components/global-importance-chart";
import { ModelComparisonTable } from "@/components/model-comparison-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDatasetQuery } from "@/lib/hooks/use-datasets";
import { useCalibrationQuery, useImportanceQuery, useRunQuery } from "@/lib/hooks/use-runs";

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const run = useRunQuery(id);
  const succeeded = run.data?.status === "succeeded";
  const calibration = useCalibrationQuery(id, succeeded);
  const importance = useImportanceQuery(id, succeeded);
  const dataset = useDatasetQuery(run.data?.dataset_id ?? "", succeeded);

  if (run.isPending) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading run">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-24 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (run.isError) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load this run.</p>
          <Button variant="outline" size="sm" onClick={() => void run.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = run.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Run</h1>
          <p className="font-mono text-sm text-muted-foreground">{data.id}</p>
        </div>
        <Badge
          variant={
            data.status === "succeeded"
              ? "default"
              : data.status === "failed"
                ? "destructive"
                : "secondary"
          }
        >
          {data.status}
        </Badge>
      </div>

      {(data.status === "queued" || data.status === "running") && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {data.status === "queued"
                ? "Waiting for the job runner to pick this up…"
                : "Training in progress — this can take a few minutes for the full algorithm set."}
            </p>
          </CardContent>
        </Card>
      )}

      {data.status === "failed" && (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium text-destructive">Training failed</p>
            <p className="text-sm text-muted-foreground">
              {data.error_message ?? "No error message was recorded."}
            </p>
          </CardContent>
        </Card>
      )}

      {data.status === "succeeded" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Model comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ModelComparisonTable models={data.models} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Decision threshold</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {data.chosen_threshold?.toFixed(3) ?? "—"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Best model</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold capitalize">
                {data.models.find((m) => m.is_best)?.algorithm.replaceAll("_", " ") ?? "—"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Risk tiers</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {data.risk_tier_bounds ? (
                  <ul className="space-y-0.5">
                    {Object.entries(data.risk_tier_bounds).map(([tier, bounds]) => (
                      <li key={tier} className="flex justify-between gap-2 tabular-nums">
                        <span className="capitalize">{tier}</span>
                        <span>
                          {bounds[0].toFixed(2)}–{bounds[1].toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Calibration curve</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {calibration.isPending && (
                <div className="h-full w-full animate-pulse rounded bg-muted" aria-busy="true" />
              )}
              {calibration.isError && (
                <div className="flex h-full items-center justify-center">
                  <Button variant="outline" size="sm" onClick={() => void calibration.refetch()}>
                    Retry loading calibration
                  </Button>
                </div>
              )}
              {calibration.data && <CalibrationChart curve={calibration.data} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What drives churn</CardTitle>
              <p className="text-sm text-muted-foreground">
                Average impact of each customer attribute on the churn score, across{" "}
                {importance.data?.sample_size ?? "the"} held-out customers.
              </p>
            </CardHeader>
            <CardContent className="h-96">
              {importance.isPending && (
                <div className="h-full w-full animate-pulse rounded bg-muted" aria-busy="true" />
              )}
              {importance.isError && (
                <div className="flex h-full items-center justify-center">
                  <Button variant="outline" size="sm" onClick={() => void importance.refetch()}>
                    Retry loading importance
                  </Button>
                </div>
              )}
              {importance.data && <GlobalImportanceChart importance={importance.data} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Why is this customer at risk?</CardTitle>
            </CardHeader>
            <CardContent>
              {dataset.isPending || importance.isPending ? (
                <div className="h-40 w-full animate-pulse rounded bg-muted" aria-busy="true" />
              ) : dataset.data && importance.data ? (
                <ExplainPanel
                  runId={data.id}
                  dataset={dataset.data}
                  importance={importance.data}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  This run&apos;s dataset is no longer available, so a customer can&apos;t be
                  explained against it.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
