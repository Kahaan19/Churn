"use client";

import Link from "next/link";
import { use } from "react";

import { BatchSummary } from "@/components/batch-summary";
import { CustomerList } from "@/components/customer-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { useBatchQuery } from "@/lib/hooks/use-predictions";

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const batch = useBatchQuery(id);

  if (batch.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading scored customers">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (batch.isError) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {batch.error instanceof Error ? batch.error.message : "Couldn't load this batch."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void batch.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = batch.data;
  const inProgress = data.status === "queued" || data.status === "running";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {data.filename ?? "Scored customers"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatCount(data.n_rows)} customers · scored{" "}
            {new Date(data.created_at).toLocaleString()} ·{" "}
            <Link href={`/runs/${data.run_id}`} className="hover:underline">
              see the model
            </Link>
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/predict">Score another file</Link>} />
      </div>

      {inProgress && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {data.status === "queued"
                ? "Waiting for the scorer to pick this up…"
                : `Scoring ${formatCount(data.n_rows)} customers…`}
            </p>
          </CardContent>
        </Card>
      )}

      {data.status === "failed" && (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium text-destructive">Scoring failed</p>
            <p className="text-sm text-muted-foreground">
              {data.error_message ?? "No error message was recorded."}
            </p>
            <p className="text-sm text-muted-foreground">
              The model itself is unaffected — fix the file and upload it again.
            </p>
          </CardContent>
        </Card>
      )}

      {data.summary && <BatchSummary summary={data.summary} />}

      {data.status === "succeeded" && (
        <div className="space-y-3">
          <div>
            <h2 className="font-heading text-lg font-medium">Who to call first</h2>
            <p className="text-sm text-muted-foreground">
              Ranked by what leaving would cost, not by chance of leaving alone. Open a row for the
              reasons and the numbers behind them.
            </p>
          </div>
          <CustomerList batchId={id} enabled />
        </div>
      )}
    </div>
  );
}
