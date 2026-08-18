"use client";

import { useState } from "react";

import { AssumptionControls, type AssumptionOverrides } from "@/components/assumption-controls";
import { GettingStarted, type SetupStep } from "@/components/getting-started";
import { PortfolioKpis } from "@/components/portfolio-kpis";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { useDatasetsQuery } from "@/lib/hooks/use-datasets";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useKpisQuery, useRunsQuery } from "@/lib/hooks/use-runs";
import { useSettingsQuery } from "@/lib/hooks/use-settings";

/**
 * The portfolio page: what churn is costing, under assumptions the reader can move.
 *
 * Which run's numbers these are is stated rather than implied — everything is keyed by `run_id`
 * (CLAUDE.md rule 4), and a dashboard that silently picks one model is a dashboard that will one
 * day show yesterday's.
 */
export function PortfolioOverview() {
  const runs = useRunsQuery();
  const datasets = useDatasetsQuery();
  const settings = useSettingsQuery();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<AssumptionOverrides>({});
  // The slider moves at 60fps; the portfolio does not need recomputing that often.
  const debounced = useDebouncedValue(overrides);

  const succeeded = runs.data?.items.filter((run) => run.status === "succeeded") ?? [];
  const runId = selectedRunId ?? succeeded[0]?.id ?? null;

  const kpis = useKpisQuery(runId ?? "", debounced, runId !== null);

  if (runs.isPending || datasets.isPending) {
    return <OverviewSkeleton />;
  }

  if (runs.isError || datasets.isError) {
    return (
      <RetryCard
        message={
          runs.error instanceof Error
            ? runs.error.message
            : "Couldn't reach the API to load your models."
        }
        onRetry={() => {
          void runs.refetch();
          void datasets.refetch();
        }}
      />
    );
  }

  const setupStep = nextSetupStep({
    hasDataset: (datasets.data?.items.length ?? 0) > 0,
    hasRun: succeeded.length > 0,
    hasScoring: (kpis.data?.n_customers ?? 0) > 0,
  });

  if (setupStep !== null && !kpis.isPending) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <GettingStarted current={setupStep} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading />
        {succeeded.length > 1 && runId && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Model
            <select
              value={runId}
              onChange={(event) => setSelectedRunId(event.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              {succeeded.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.models.find((model) => model.is_best)?.algorithm.replaceAll("_", " ") ??
                    "model"}{" "}
                  · {new Date(run.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {kpis.isError && (
        <RetryCard
          message={
            kpis.error instanceof Error
              ? kpis.error.message
              : "Couldn't load the portfolio figures."
          }
          onRetry={() => void kpis.refetch()}
        />
      )}

      {kpis.isPending && <OverviewSkeleton />}

      {kpis.data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <PortfolioKpis kpis={kpis.data} isStale={kpis.isFetching} />
          <div className="space-y-3 lg:order-last">
            {settings.data && (
              <AssumptionControls
                configured={{
                  saveRate: settings.data.save_rate,
                  grossMargin: settings.data.gross_margin,
                }}
                overrides={overrides}
                onChange={setOverrides}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Lifetime value is counted over {kpis.data.assumptions.horizon_months} months and
              discounted at {(kpis.data.assumptions.discount_rate_monthly * 100).toFixed(1)}% a
              month. Figures cover {formatCount(kpis.data.n_batches)} scored{" "}
              {kpis.data.n_batches === 1 ? "batch" : "batches"}
              {kpis.data.last_scored_at
                ? `, most recently on ${new Date(kpis.data.last_scored_at).toLocaleDateString()}.`
                : "."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Retention overview</h1>
      <p className="text-sm text-muted-foreground">
        What churn is about to cost, and what acting on it is worth.
      </p>
    </div>
  );
}

/** The first step the user has not completed, or null once there is something to show. */
function nextSetupStep(state: {
  hasDataset: boolean;
  hasRun: boolean;
  hasScoring: boolean;
}): SetupStep | null {
  if (!state.hasDataset) return "dataset";
  if (!state.hasRun) return "run";
  if (!state.hasScoring) return "scoring";
  return null;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the portfolio">
      <div className="h-56 w-full animate-pulse rounded-xl bg-muted" />
      <div className="h-48 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

function RetryCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">That didn&apos;t load</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
