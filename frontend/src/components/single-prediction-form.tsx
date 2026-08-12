"use client";

import { useEffect, useState } from "react";

import { FinancialsPanel } from "@/components/financials-panel";
import { RiskTierBadge } from "@/components/risk-tier-badge";
import { Button } from "@/components/ui/button";
import { WaterfallChart } from "@/components/waterfall-chart";
import type { Dataset } from "@/lib/api/datasets";
import type { GlobalImportance } from "@/lib/api/runs";
import { topCaptions } from "@/lib/explanation";
import { formatPercent } from "@/lib/format";
import { buildFeatureFields, fieldsToFeatures, type FeatureField } from "@/lib/feature-fields";
import { useEdaQuery } from "@/lib/hooks/use-datasets";
import { useScoreSingle } from "@/lib/hooks/use-predictions";
import { tierBandCaption } from "@/lib/risk";

interface SinglePredictionFormProps {
  runId: string;
  dataset: Dataset;
  importance: GlobalImportance;
  riskTierBounds: Record<string, number[]> | null;
}

/**
 * Score one customer typed in by hand — the "what if" tool, and the fastest way to sanity-check a
 * model before trusting it with a file of ten thousand people.
 */
export function SinglePredictionForm({
  runId,
  dataset,
  importance,
  riskTierBounds,
}: SinglePredictionFormProps) {
  const eda = useEdaQuery(dataset.id);
  const score = useScoreSingle(runId);
  const [fields, setFields] = useState<FeatureField[] | null>(null);

  // The backend owns the column -> business label mapping and ships it on the importance payload,
  // so the form reuses it rather than keeping a second copy that can drift.
  const labels = new Map(importance.features.map((f) => [f.feature, f.display_name]));

  useEffect(() => {
    if (eda.data && fields === null) {
      setFields(buildFeatureFields(dataset.column_profile, eda.data));
    }
  }, [eda.data, dataset.column_profile, fields]);

  if (eda.isPending || fields === null) {
    return <div className="h-40 w-full animate-pulse rounded bg-muted" aria-busy="true" />;
  }

  if (eda.isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load this dataset&apos;s columns, so there&apos;s nothing to fill the form
          with.
        </p>
        <Button variant="outline" size="sm" onClick={() => void eda.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  function updateField(column: string, value: string) {
    setFields((current) =>
      (current ?? []).map((field) =>
        field.column === column
          ? field.kind === "numeric"
            ? { ...field, value: Number(value) }
            : { ...field, value }
          : field,
      ),
    );
  }

  const prediction = score.data;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Prefilled with a typical customer from this dataset. Change anything, then score them.
      </p>

      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          score.mutate(fieldsToFeatures(fields ?? []));
        }}
      >
        {fields.map((field) => (
          <label key={field.column} className="space-y-1 text-sm">
            <span className="text-muted-foreground">
              {labels.get(field.column) ?? field.column}
            </span>
            {field.kind === "numeric" ? (
              <input
                type="number"
                step="any"
                value={field.value}
                onChange={(event) => updateField(field.column, event.target.value)}
                className="w-full rounded border border-input bg-background px-2 py-1.5 tabular-nums"
              />
            ) : (
              <select
                value={field.value}
                onChange={(event) => updateField(field.column, event.target.value)}
                className="w-full rounded border border-input bg-background px-2 py-1.5"
              >
                {field.levels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}

        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={score.isPending}>
            {score.isPending ? "Scoring…" : "Score this customer"}
          </Button>
        </div>
      </form>

      {score.isError && (
        <p role="alert" className="text-sm text-destructive">
          {score.error instanceof Error
            ? score.error.message
            : "Couldn't score that customer. Check the values and try again."}
        </p>
      )}

      {prediction && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <p className="font-heading text-3xl font-semibold tabular-nums">
                {formatPercent(prediction.churn_probability)}
              </p>
              <div>
                <RiskTierBadge tier={prediction.risk_tier} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {tierBandCaption(prediction.risk_tier, riskTierBounds)}
                </p>
              </div>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {topCaptions(prediction.shap_values.values).map((caption) => (
                <li key={caption}>{caption}</li>
              ))}
            </ul>
            <div className="h-80">
              <WaterfallChart
                explanation={{
                  base_value: prediction.shap_values.base_value,
                  output_space: prediction.shap_values.output_space,
                  shap_values: prediction.shap_values.values,
                }}
              />
            </div>
          </div>

          <FinancialsPanel financials={prediction.financials} />
        </div>
      )}
    </div>
  );
}
