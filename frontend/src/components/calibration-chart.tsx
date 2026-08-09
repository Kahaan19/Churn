"use client";

import { PlotlyChart } from "@/components/charts/plotly-chart";
import type { CalibrationCurve } from "@/lib/api/runs";

// Matches the churn/base colour semantics used across EdaView, per CONVENTIONS.md.
const CHURN_COLOR = "#ef4444";
const BASE_COLOR = "#94a3b8";

export function CalibrationChart({ curve }: { curve: CalibrationCurve }) {
  return (
    <PlotlyChart
      data={[
        {
          type: "scatter",
          mode: "lines",
          x: [0, 1],
          y: [0, 1],
          name: "Perfectly calibrated",
          line: { dash: "dot", color: BASE_COLOR },
          hoverinfo: "skip",
        },
        {
          type: "scatter",
          mode: "lines+markers",
          x: curve.points.map((p) => p.predicted),
          y: curve.points.map((p) => p.observed),
          name: "Observed",
          marker: { color: CHURN_COLOR },
          text: curve.points.map((p) => `${p.count} customers`),
        },
      ]}
      layout={{
        margin: { t: 10, r: 10, b: 40, l: 50 },
        xaxis: { title: { text: "Predicted probability" }, range: [0, 1] },
        yaxis: { title: { text: "Observed churn rate" }, range: [0, 1] },
        legend: { orientation: "h", y: -0.25 },
      }}
    />
  );
}
