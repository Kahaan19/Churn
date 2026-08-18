"use client";

import Link from "next/link";
import { use } from "react";

import { CustomerDetail } from "@/components/customer-detail";
import { RiskTierBadge } from "@/components/risk-tier-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import { usePredictionQuery } from "@/lib/hooks/use-predictions";
import { tierBandCaption } from "@/lib/risk";
import { useRunQuery } from "@/lib/hooks/use-runs";

/**
 * One customer as an addressable page.
 *
 * The drawer over the ranked list stays the working view — a retention team goes down the list and
 * losing their place on every click is what makes these tools go unused. This is the copy of it
 * that survives being pasted into a message: the id in the URL is the prediction, so the
 * probability, the explanation, and the money are exactly the ones that were scored, not a fresh
 * guess from a model that may since have been retrained.
 */
export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = usePredictionQuery(id);
  // Only for the tier band caption, so it waits for the prediction rather than
  // firing a request at an empty id.
  const run = useRunQuery(query.data?.run_id ?? "", query.data !== undefined);

  if (query.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading customer">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-80 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">That customer isn&apos;t here</p>
          <p className="text-sm text-muted-foreground">
            {query.error instanceof Error
              ? query.error.message
              : "This scored customer could not be loaded."}{" "}
            They may belong to a batch that has since been deleted.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/predict">Back to scoring</Link>} />
          </div>
        </CardContent>
      </Card>
    );
  }

  const prediction = query.data;
  const bounds = (run.data?.risk_tier_bounds ?? null) as Record<string, number[]> | null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/predict/batches/${prediction.batch_id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to the scored file
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {prediction.customer_ref ?? "Customer"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatPercent(prediction.churn_probability)} chance of leaving ·{" "}
              {tierBandCaption(prediction.risk_tier, bounds)}
            </p>
          </div>
          <RiskTierBadge tier={prediction.risk_tier} />
        </div>
      </div>

      <CustomerDetail prediction={prediction} />

      <p className="text-xs text-muted-foreground">
        Scored on {new Date(prediction.created_at).toLocaleString()} against{" "}
        <Link href={`/runs/${prediction.run_id}`} className="hover:underline">
          this model
        </Link>
        .
      </p>
    </div>
  );
}
