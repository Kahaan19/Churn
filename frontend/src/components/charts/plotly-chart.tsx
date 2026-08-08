"use client";

import dynamic from "next/dynamic";
import type { ComponentProps, ComponentType } from "react";
import type PlotComponent from "react-plotly.js";

// Plotly touches `window` at import time, so it can only load client-side. Built via the
// factory + the pre-built dist-min bundle so the full plotly.js (and its native-build
// transitive deps) never has to be installed just to satisfy a peer dependency.
const Plot = dynamic(
  async () => {
    const [{ default: createPlotlyComponent }, { default: Plotly }] = await Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min"),
    ]);
    return createPlotlyComponent(Plotly) as ComponentType<ComponentProps<typeof PlotComponent>>;
  },
  { ssr: false },
);

export type PlotlyChartProps = ComponentProps<typeof PlotComponent>;

export function PlotlyChart(props: PlotlyChartProps) {
  return (
    <Plot
      config={{ displayModeBar: false, responsive: true }}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
      {...props}
    />
  );
}
