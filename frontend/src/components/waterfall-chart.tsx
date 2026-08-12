"use client";

import { PlotlyChart } from "@/components/charts/plotly-chart";
import type { FeatureContribution } from "@/lib/api/runs";

/**
 * Structural, not the `Explanation` response type: a stored `Prediction` carries the same three
 * fields under a different shape, and both must reach this chart without a second copy of it.
 */
export interface WaterfallInput {
  base_value: number;
  output_space: "logit" | "probability";
  shap_values: FeatureContribution[];
}

const RAISES_COLOR = "#ef4444";
const LOWERS_COLOR = "#0ea5e9";
const BASE_COLOR = "#94a3b8";

const TOP_N = 8;

/**
 * A per-customer SHAP waterfall: start from the average customer, add each factor's push, land on
 * this customer's score. Factors past the top few are collapsed into one bar so the chart stays
 * readable — their sum is still shown, so the bars still add up to the final score.
 */
export function WaterfallChart({ explanation }: { explanation: WaterfallInput }) {
  const top = explanation.shap_values.slice(0, TOP_N);
  const rest = explanation.shap_values.slice(TOP_N);
  const restTotal = rest.reduce((sum, c) => sum + c.contribution, 0);

  const steps = [
    ...top.map((c) => ({ label: c.display_name, value: c.contribution })),
    ...(rest.length > 0
      ? [{ label: `${rest.length} other factors`, value: restTotal }]
      : []),
  ];

  // Reversed for the same bottom-up stacking reason as the importance chart: the base sits at the
  // top, the customer's final score at the bottom, read downwards.
  const labels = ["Average customer", ...steps.map((s) => s.label), "This customer"].reverse();
  const values = [explanation.base_value, ...steps.map((s) => s.value), 0].reverse();
  const measures = ["absolute", ...steps.map(() => "relative"), "total"].reverse();

  return (
    <PlotlyChart
      data={[
        {
          type: "waterfall",
          orientation: "h",
          y: labels,
          x: values,
          measure: measures,
          decreasing: { marker: { color: LOWERS_COLOR } },
          increasing: { marker: { color: RAISES_COLOR } },
          totals: { marker: { color: BASE_COLOR } },
          connector: { line: { color: BASE_COLOR, width: 1 } },
          hovertemplate: "%{y}: %{x:+.3f}<extra></extra>",
        },
      ]}
      layout={{
        margin: { t: 10, r: 20, b: 44, l: 170 },
        xaxis: {
          title: {
            text:
              explanation.output_space === "logit"
                ? "Churn score (log-odds)"
                : "Churn probability",
          },
        },
        yaxis: { automargin: true },
        showlegend: false,
      }}
    />
  );
}
