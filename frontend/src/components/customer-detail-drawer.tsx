"use client";

import Link from "next/link";
import { useEffect } from "react";

import { CustomerDetail } from "@/components/customer-detail";
import { RiskTierBadge } from "@/components/risk-tier-badge";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/format";
import { usePredictionQuery } from "@/lib/hooks/use-predictions";

interface CustomerDetailDrawerProps {
  predictionId: string | null;
  onClose: () => void;
}

/**
 * One customer, end to end: how likely they are to leave, why, and what it costs.
 *
 * A drawer rather than a route so the ranked list stays on screen behind it — the team works down
 * the list, and losing their place on every click is what makes these tools go unused.
 */
export function CustomerDetailDrawer({ predictionId, onClose }: CustomerDetailDrawerProps) {
  const query = usePredictionQuery(predictionId);

  useEffect(() => {
    if (predictionId === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [predictionId, onClose]);

  if (predictionId === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Customer detail"
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-background shadow-xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background px-6 py-4">
          <div className="min-w-0">
            <p className="font-heading text-lg font-semibold">
              {query.data?.customer_ref ?? "Customer"}
            </p>
            {query.data && (
              <p className="text-sm text-muted-foreground">
                {formatPercent(query.data.churn_probability)} chance of leaving
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {query.data && <RiskTierBadge tier={query.data.risk_tier} />}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-5">
          {query.isPending && (
            <div className="space-y-3" aria-busy="true" aria-label="Loading customer">
              <div className="h-24 w-full animate-pulse rounded bg-muted" />
              <div className="h-64 w-full animate-pulse rounded bg-muted" />
            </div>
          )}

          {query.isError && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {query.error instanceof Error
                  ? query.error.message
                  : "Couldn't load this customer."}
              </p>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {query.data && (
            <>
              <CustomerDetail prediction={query.data} />
              <Link
                href={`/customers/${query.data.id}`}
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                Open as a page you can share →
              </Link>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
