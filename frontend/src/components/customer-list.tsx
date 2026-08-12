"use client";

import { useState } from "react";

import { CustomerDetailDrawer } from "@/components/customer-detail-drawer";
import { RiskTierBadge } from "@/components/risk-tier-badge";
import { Button } from "@/components/ui/button";
import type { RiskTier, SortKey } from "@/lib/api/predictions";
import { formatCurrency, formatCurrencyPrecise, formatPercent, formatRoi } from "@/lib/format";
import { useBatchItemsQuery } from "@/lib/hooks/use-predictions";
import { RISK_TIERS, riskTierMeta } from "@/lib/risk";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const SORTS: { key: NonNullable<SortKey>; label: string }[] = [
  { key: "expected_value_at_risk", label: "Value at risk" },
  { key: "monthly_revenue_at_risk", label: "Monthly revenue" },
  { key: "churn_probability", label: "Churn chance" },
];

interface CustomerListProps {
  batchId: string;
  /** Absent until segmentation lands (Phase 6); the filter hides itself until then. */
  segments?: string[];
  enabled: boolean;
}

/**
 * The screen a retention team lives in: who to call, in the order that costs the most to ignore.
 *
 * Ranked by expected value at risk rather than by probability — a customer 90% likely to leave on a
 * $20 plan is not the first call of the morning.
 */
export function CustomerList({ batchId, segments = [], enabled }: CustomerListProps) {
  const [riskTier, setRiskTier] = useState<RiskTier | null>(null);
  const [segment, setSegment] = useState<string | null>(null);
  const [sort, setSort] = useState<NonNullable<SortKey>>("expected_value_at_risk");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const query = useBatchItemsQuery(
    batchId,
    { riskTier, segment, sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    enabled,
  );

  function applyFilter(next: RiskTier | null) {
    setRiskTier(next);
    setPage(0);
  }

  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading customers">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="h-14 w-full animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-3 rounded-lg border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {query.error instanceof Error
            ? query.error.message
            : "Couldn't load the scored customers."}
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { items, total } = query.data;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <FilterChip active={riskTier === null} onClick={() => applyFilter(null)}>
            Everyone
          </FilterChip>
          {RISK_TIERS.map((tier) => (
            <FilterChip
              key={tier}
              active={riskTier === tier}
              onClick={() => applyFilter(riskTier === tier ? null : tier)}
            >
              {riskTierMeta(tier).label}
            </FilterChip>
          ))}
        </div>

        {segments.length > 0 && (
          <select
            aria-label="Filter by segment"
            value={segment ?? ""}
            onChange={(event) => {
              setSegment(event.target.value || null);
              setPage(0);
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">All segments</option>
            {segments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}

        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Sort by
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as NonNullable<SortKey>);
              setPage(0);
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            {SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border p-10 text-center">
          <p className="text-sm font-medium">No customers in this view</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {riskTier
              ? `Nobody in this batch scored ${riskTierMeta(riskTier).label.toLowerCase()} risk. Clear the filter to see everyone.`
              : "This batch scored no customers."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <table className="w-full min-w-[46rem] text-sm">
            <caption className="sr-only">
              Customers ranked by the revenue at risk if they churn
            </caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Customer
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Risk
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Chance of leaving
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Monthly charge
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Value at risk
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Return if we act
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={item.id}
                  onClick={() => setOpenId(item.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${item.customer_ref ?? "customer"}`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setOpenId(item.id);
                    }
                  }}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {page * PAGE_SIZE + index + 1}.
                    </span>{" "}
                    <span className="font-mono text-xs">{item.customer_ref ?? item.id.slice(0, 8)}</span>
                    {item.segment_label && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.segment_label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <RiskTierBadge tier={item.risk_tier} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatPercent(item.churn_probability)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatCurrencyPrecise(item.arpu)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {formatCurrency(item.expected_value_at_risk)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatRoi(item.roi)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <CustomerDetailDrawer predictionId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {children}
    </button>
  );
}
