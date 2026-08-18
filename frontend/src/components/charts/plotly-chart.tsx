"use client";

import dynamic from "next/dynamic";
import type { Layout, LayoutAxis } from "plotly.js";
import type { ComponentProps, ComponentType } from "react";
import type PlotComponent from "react-plotly.js";

import { useChartTheme } from "@/lib/chart-theme";

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

/**
 * Plotly paints an opaque white canvas and mid-grey gridlines by default, which is a white box in
 * the middle of the dark theme. Chrome is set here once so no individual chart has to remember —
 * charts only ever specify what is particular to them.
 */
function themedAxis(axis: Partial<LayoutAxis> | undefined, grid: string): Partial<LayoutAxis> {
  return { gridcolor: grid, zerolinecolor: grid, linecolor: grid, ...axis };
}

export function PlotlyChart({ layout, ...props }: PlotlyChartProps) {
  const colors = useChartTheme();
  const merged: Partial<Layout> = layout ?? {};
  // Gridlines must sit under the data, not compete with it.
  const grid = `color-mix(in oklab, ${colors.base} 25%, transparent)`;

  return (
    <Plot
      config={{ displayModeBar: false, responsive: true }}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
      layout={{
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: colors.text, size: 12 },
        hoverlabel: { font: { size: 12 } },
        ...merged,
        xaxis: themedAxis(merged.xaxis, grid),
        yaxis: themedAxis(merged.yaxis, grid),
      }}
      {...props}
    />
  );
}
