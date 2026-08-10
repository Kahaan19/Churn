"use client";

import { PlotlyChart } from "@/components/charts/plotly-chart";
import type { GlobalImportance } from "@/lib/api/runs";

const CHURN_COLOR = "#ef4444";

const TOP_N = 15;

export function GlobalImportanceChart({ importance }: { importance: GlobalImportance }) {
  // Plotly stacks horizontal bars bottom-up, so the ranking is reversed to put the strongest
  // driver at the top where it reads first.
  const shown = importance.features.slice(0, TOP_N).reverse();

  return (
    <PlotlyChart
      data={[
        {
          type: "bar",
          orientation: "h",
          x: shown.map((f) => f.importance),
          y: shown.map((f) => f.display_name),
          marker: { color: CHURN_COLOR },
          hovertemplate: "%{y}: %{x:.3f}<extra></extra>",
        },
      ]}
      layout={{
        margin: { t: 10, r: 20, b: 44, l: 160 },
        xaxis: { title: { text: "Average impact on the churn score" } },
        yaxis: { automargin: true },
        bargap: 0.35,
      }}
    />
  );
}
