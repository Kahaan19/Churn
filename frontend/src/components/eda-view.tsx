"use client";

import { PlotlyChart } from "@/components/charts/plotly-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EDAPayload } from "@/lib/api/datasets";
import { useChartTheme } from "@/lib/chart-theme";

export type EdaState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "success"; payload: EDAPayload };

export function EdaView({ state }: { state: EdaState }) {
  const colors = useChartTheme();

  if (state.status === "loading") {
    return (
      <Card>
        <CardContent className="space-y-2" aria-busy="true" aria-label="Loading EDA charts">
          <div className="h-48 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the EDA charts.</p>
          <Button variant="outline" size="sm" onClick={state.onRetry}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { payload } = state;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Target distribution</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <PlotlyChart
            data={[
              {
                type: "bar",
                x: payload.target_distribution.labels,
                y: payload.target_distribution.counts,
                // Counts arrive ordered by frequency, so the churn bar is found by label rather
                // than by position — otherwise a dataset where churn is the majority class would
                // paint the two bars the wrong way round.
                marker: {
                  color: payload.target_distribution.labels.map((label) =>
                    label === payload.target_distribution.positive_label
                      ? colors.churn
                      : colors.retained,
                  ),
                },
                text: payload.target_distribution.counts.map(String),
                textposition: "outside",
              },
            ]}
            layout={{
              margin: { t: 10, r: 10, b: 30, l: 40 },
              xaxis: { title: { text: "Class" } },
              yaxis: { title: { text: "Customers" } },
              showlegend: false,
            }}
          />
        </CardContent>
      </Card>

      {payload.correlation.columns.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Numeric correlation</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <PlotlyChart
              data={[
                {
                  type: "heatmap",
                  x: payload.correlation.columns,
                  y: payload.correlation.columns,
                  z: payload.correlation.matrix,
                  zmin: -1,
                  zmax: 1,
                  colorscale: "RdBu",
                  reversescale: true,
                  colorbar: { title: { text: "Pearson r" } },
                },
              ]}
              layout={{ margin: { t: 10, r: 10, b: 60, l: 100 } }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Numeric distributions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {payload.histograms.map((histogram) => (
            <div key={histogram.column} className="h-52">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{histogram.column}</p>
              <PlotlyChart
                data={[
                  {
                    type: "bar",
                    x: histogram.bins.slice(0, -1).map((edge, i) => (edge + histogram.bins[i + 1]) / 2),
                    y: histogram.counts,
                    marker: { color: colors.base },
                  },
                ]}
                layout={{
                  margin: { t: 10, r: 10, b: 30, l: 40 },
                  xaxis: { title: { text: histogram.column } },
                  yaxis: { title: { text: "Count" } },
                  showlegend: false,
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Churn rate by category</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {payload.categorical.map((summary) => (
            <div key={summary.column} className="h-52">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{summary.column}</p>
              <PlotlyChart
                data={[
                  {
                    type: "bar",
                    x: summary.levels,
                    y: summary.churn_rate,
                    marker: { color: colors.churn },
                    text: summary.churn_rate.map((r) => `${(r * 100).toFixed(0)}%`),
                    textposition: "outside",
                  },
                ]}
                layout={{
                  margin: { t: 10, r: 10, b: 50, l: 40 },
                  xaxis: { title: { text: summary.column } },
                  yaxis: { title: { text: "Churn rate" }, tickformat: ",.0%", range: [0, 1] },
                  showlegend: false,
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
