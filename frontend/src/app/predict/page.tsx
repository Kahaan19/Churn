"use client";

import Link from "next/link";
import { useState } from "react";

import { ScoringUpload } from "@/components/scoring-upload";
import { SinglePredictionForm } from "@/components/single-prediction-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { useDatasetQuery } from "@/lib/hooks/use-datasets";
import { useBatchesQuery } from "@/lib/hooks/use-predictions";
import { useImportanceQuery, useRunQuery, useRunsQuery } from "@/lib/hooks/use-runs";

type Mode = "single" | "batch";

export default function PredictPage() {
  const runs = useRunsQuery();
  const succeeded = runs.data?.items.filter((run) => run.status === "succeeded") ?? [];
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("single");

  // Default to the newest usable model rather than making the user pick before they can do
  // anything; the list is already newest-first.
  const runId = selectedRunId ?? succeeded[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Score customers</h1>
        <p className="text-sm text-muted-foreground">
          Estimate who is about to leave, what that costs, and whether acting on it pays.
        </p>
      </div>

      {runs.isPending && (
        <div className="h-32 w-full animate-pulse rounded-lg bg-muted" aria-busy="true" />
      )}

      {runs.isError && (
        <Card>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Couldn&apos;t load your trained models.</p>
            <Button variant="outline" size="sm" onClick={() => void runs.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {runs.data && succeeded.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-sm font-medium">No trained model yet</p>
            <p className="text-sm text-muted-foreground">
              Scoring needs a finished training run. Train one, then come back here.
            </p>
            <Button render={<Link href="/runs">Go to model runs</Link>} size="sm" />
          </CardContent>
        </Card>
      )}

      {runId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Model</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Model to score against"
                value={runId}
                onChange={(event) => setSelectedRunId(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                {succeeded.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.models.find((m) => m.is_best)?.algorithm.replaceAll("_", " ") ?? "model"} ·{" "}
                    {new Date(run.created_at).toLocaleString()}
                  </option>
                ))}
              </select>
              <Link
                href={`/runs/${runId}`}
                className="text-sm text-muted-foreground hover:underline"
              >
                See how this model performs
              </Link>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              variant={mode === "single" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("single")}
            >
              One customer
            </Button>
            <Button
              variant={mode === "batch" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("batch")}
            >
              A file of customers
            </Button>
          </div>

          <RunScoringPanel runId={runId} mode={mode} />
        </>
      )}

      <RecentBatches />
    </div>
  );
}

function RunScoringPanel({ runId, mode }: { runId: string; mode: Mode }) {
  const run = useRunQuery(runId);
  const importance = useImportanceQuery(runId, true);
  const dataset = useDatasetQuery(run.data?.dataset_id ?? "", Boolean(run.data));

  if (run.isPending || importance.isPending || dataset.isPending) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  }

  if (run.isError || importance.isError || dataset.isError || !dataset.data || !importance.data) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This model&apos;s dataset is no longer available, so customers can&apos;t be scored
            against it.
          </p>
          <Button variant="outline" size="sm" onClick={() => void run.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const requiredColumns = importance.data.features.map((feature) => feature.feature);
  const bounds = (run.data?.risk_tier_bounds ?? null) as Record<string, number[]> | null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "single" ? "One customer" : "A file of customers"}</CardTitle>
      </CardHeader>
      <CardContent>
        {mode === "single" ? (
          <SinglePredictionForm
            runId={runId}
            dataset={dataset.data}
            importance={importance.data}
            riskTierBounds={bounds}
          />
        ) : (
          <ScoringUpload runId={runId} requiredColumns={requiredColumns} />
        )}
      </CardContent>
    </Card>
  );
}

function RecentBatches() {
  const batches = useBatchesQuery(10, 0);
  const files = batches.data?.items.filter((batch) => batch.source === "csv") ?? [];

  if (batches.isPending || files.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-lg font-medium">Scored files</h2>
      <div className="space-y-2">
        {files.map((batch) => (
          <Link key={batch.id} href={`/predict/batches/${batch.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{batch.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCount(batch.n_rows)} customers ·{" "}
                    {new Date(batch.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge
                  variant={
                    batch.status === "succeeded"
                      ? "default"
                      : batch.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {batch.status}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
