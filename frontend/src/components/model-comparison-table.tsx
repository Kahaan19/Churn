"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { Run } from "@/lib/api/runs";
import { cn } from "@/lib/utils";

type ModelArtifact = Run["models"][number];

const METRIC_COLUMNS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "precision", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "f1", label: "F1" },
  { key: "roc_auc", label: "ROC AUC" },
  { key: "pr_auc", label: "PR AUC" },
  { key: "brier", label: "Brier" },
] as const;

type MetricKey = (typeof METRIC_COLUMNS)[number]["key"];

export function ModelComparisonTable({ models }: { models: ModelArtifact[] }) {
  const [sortKey, setSortKey] = useState<MetricKey>("pr_auc");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    return [...models].sort((a, b) => {
      const av = a.metrics.validation[sortKey];
      const bv = b.metrics.validation[sortKey];
      return sortDesc ? bv - av : av - bv;
    });
  }, [models, sortKey, sortDesc]);

  function handleSort(key: MetricKey) {
    if (key === sortKey) {
      setSortDesc((current) => !current);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Algorithm</th>
            {METRIC_COLUMNS.map((column) => (
              <th key={column.key} className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort(column.key)}
                  className={cn(
                    "flex items-center gap-1 tabular-nums hover:text-foreground",
                    column.key === "pr_auc" && "font-semibold text-foreground",
                  )}
                  title={
                    column.key === "pr_auc"
                      ? "Model selection criterion (validation PR-AUC)"
                      : undefined
                  }
                >
                  {column.label}
                  {column.key === "pr_auc" && (
                    <span aria-hidden className="text-primary">
                      ★
                    </span>
                  )}
                  {sortKey === column.key && <span aria-hidden>{sortDesc ? "↓" : "↑"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((model) => (
            <tr
              key={model.id}
              className={cn(
                "border-b border-border last:border-0",
                model.is_best && "bg-primary/5",
              )}
            >
              <td className="px-3 py-2 font-medium">
                <div className="flex items-center gap-2">
                  <span className="capitalize">{model.algorithm.replaceAll("_", " ")}</span>
                  {model.is_best && <Badge>winner</Badge>}
                </div>
              </td>
              {METRIC_COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-2 tabular-nums",
                    column.key === "pr_auc" && "font-semibold",
                  )}
                >
                  {model.metrics.validation[column.key].toFixed(4)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
