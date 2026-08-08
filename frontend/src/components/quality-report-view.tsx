import { AlertTriangle, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QualityReport } from "@/lib/api/datasets";

export type QualityReportState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "success"; report: QualityReport };

export function QualityReportView({ state }: { state: QualityReportState }) {
  if (state.status === "loading") {
    return (
      <Card>
        <CardContent className="space-y-2" aria-busy="true" aria-label="Loading quality report">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the quality report.</p>
          <Button variant="outline" size="sm" onClick={state.onRetry}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { report } = state;

  return (
    <div className="space-y-4">
      {report.blocking_errors.length > 0 && (
        <Card className="ring-destructive/30">
          <CardContent className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                Training is blocked until these are resolved
              </p>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {report.blocking_errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Class balance</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Positive</dt>
            <dd className="col-span-2 font-mono tabular-nums">
              {report.class_balance.positive.toLocaleString()}
            </dd>
            <dt className="text-muted-foreground">Negative</dt>
            <dd className="col-span-2 font-mono tabular-nums">
              {report.class_balance.negative.toLocaleString()}
            </dd>
            <dt className="text-muted-foreground">Positive rate</dt>
            <dd className="col-span-2 font-mono tabular-nums">
              {(report.class_balance.positive_rate * 100).toFixed(1)}%
            </dd>
          </dl>
        </CardContent>
      </Card>

      {report.leakage_warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Possible leakage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.leakage_warnings.map((warning) => (
              <div key={warning.column} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>
                  <span className="font-medium">{warning.column}</span> — {warning.reason}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(report.missing.length > 0 || report.type_issues.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Missing &amp; malformed values</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {report.type_issues.map((issue) => (
              <p key={issue.column} className="text-sm">
                <span className="font-medium">{issue.column}</span>: {issue.n_bad} values expected{" "}
                {issue.expected} but found {issue.found}
              </p>
            ))}
            {report.missing.map((column) => (
              <p key={column.column} className="text-sm text-muted-foreground">
                {column.column}: {column.count} missing ({column.pct}%)
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{report.n_rows.toLocaleString()} rows</Badge>
            <Badge variant="outline">{report.n_duplicate_rows} duplicate rows</Badge>
            <Badge variant="outline">{report.outliers.length} columns with outliers</Badge>
          </div>
          {report.warnings.length > 0 && (
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {report.warnings.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
