"use client";

import { useEffect, useState } from "react";

import { WaterfallChart } from "@/components/waterfall-chart";
import { Button } from "@/components/ui/button";
import { useEdaQuery } from "@/lib/hooks/use-datasets";
import { useExplainCustomer } from "@/lib/hooks/use-runs";
import { buildFeatureFields, fieldsToFeatures, type FeatureField } from "@/lib/feature-fields";
import { riskSummary, topCaptions } from "@/lib/explanation";
import type { Dataset } from "@/lib/api/datasets";
import type { GlobalImportance } from "@/lib/api/runs";

export function ExplainPanel({
  runId,
  dataset,
  importance,
}: {
  runId: string;
  dataset: Dataset;
  importance: GlobalImportance;
}) {
  const eda = useEdaQuery(dataset.id);
  const explain = useExplainCustomer(runId);
  const [fields, setFields] = useState<FeatureField[] | null>(null);

  // The backend already owns the column -> business label mapping and returns it for every source
  // column on the importance payload, so the form reuses it rather than keeping a second copy.
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
          Couldn&apos;t load this dataset&apos;s columns, so there is nothing to fill the form with.
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

  const explanation = explain.data;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Prefilled with a typical customer from this dataset. Change anything, then ask the model
        why.
      </p>

      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          explain.mutate(fieldsToFeatures(fields ?? []));
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
          <Button type="submit" disabled={explain.isPending}>
            {explain.isPending ? "Explaining…" : "Explain this customer"}
          </Button>
        </div>
      </form>

      {explain.isError && (
        <p className="text-sm text-destructive">
          Couldn&apos;t explain that customer. Check the values and try again.
        </p>
      )}

      {explanation && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{riskSummary(explanation)}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {topCaptions(explanation.shap_values).map((caption) => (
                <li key={caption}>{caption}</li>
              ))}
            </ul>
          </div>
          <div className="h-96">
            <WaterfallChart explanation={explanation} />
          </div>
        </div>
      )}
    </div>
  );
}
