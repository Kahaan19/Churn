"use client";

import { use } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EdaView, type EdaState } from "@/components/eda-view";
import { QualityReportView, type QualityReportState } from "@/components/quality-report-view";
import { useDatasetQuery, useEdaQuery, useQualityQuery } from "@/lib/hooks/use-datasets";

export default function DatasetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const dataset = useDatasetQuery(id);
  const quality = useQualityQuery(id);
  const eda = useEdaQuery(id);

  if (dataset.isPending) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading dataset">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-24 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (dataset.isError) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load this dataset.</p>
          <Button variant="outline" size="sm" onClick={() => void dataset.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const profile = dataset.data.column_profile;

  const qualityState: QualityReportState = quality.isPending
    ? { status: "loading" }
    : quality.isError
      ? { status: "error", onRetry: () => void quality.refetch() }
      : { status: "success", report: quality.data };

  const edaState: EdaState = eda.isPending
    ? { status: "loading" }
    : eda.isError
      ? { status: "error", onRetry: () => void eda.refetch() }
      : { status: "success", payload: eda.data };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {dataset.data.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {dataset.data.n_rows.toLocaleString()} rows · {dataset.data.n_cols} columns · uploaded{" "}
          {new Date(dataset.data.created_at).toLocaleDateString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Column profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
            <dt className="text-muted-foreground">Target</dt>
            <dd className="font-mono">{profile.target_column}</dd>
            <dt className="text-muted-foreground">Revenue</dt>
            <dd className="font-mono">{profile.revenue_column || "—"}</dd>
            <dt className="text-muted-foreground">Tenure</dt>
            <dd className="font-mono">{profile.tenure_column ?? "—"}</dd>
            <dt className="text-muted-foreground">ID column</dt>
            <dd className="font-mono">{profile.id_column ?? "—"}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{profile.numeric.length} numeric</Badge>
            <Badge variant="outline">{profile.categorical_low.length} categorical (low)</Badge>
            <Badge variant="outline">{profile.categorical_high.length} categorical (high)</Badge>
            {profile.dropped.length > 0 && (
              <Badge variant="secondary">{profile.dropped.length} dropped</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-heading text-lg font-medium">Data quality</h2>
        <QualityReportView state={qualityState} />
      </div>

      <div>
        <h2 className="mb-3 font-heading text-lg font-medium">Exploratory analysis</h2>
        <EdaView state={edaState} />
      </div>
    </div>
  );
}
