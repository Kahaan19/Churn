import Link from "next/link";

import { RiskTierBadge } from "@/components/risk-tier-badge";
import type { PortfolioKpis as PortfolioKpisData } from "@/lib/api/runs";
import {
  formatCount,
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
  formatRoi,
} from "@/lib/format";
import { riskTierMeta } from "@/lib/risk";
import { cn } from "@/lib/utils";

interface PortfolioKpisProps {
  kpis: PortfolioKpisData;
  /** True while a new set of assumptions is in flight; the figures shown are the previous answer. */
  isStale?: boolean;
}

/**
 * The portfolio, in the order a retention manager cares about it.
 *
 * Size and position carry importance (CONVENTIONS.md): the year's revenue at risk is the largest
 * thing on the page, the critical-tier headcount sits immediately under it, and the business case
 * — recoverable, cost, net — is a step quieter. A row of four equally-weighted cards would say
 * nothing about which of these matters.
 */
export function PortfolioKpis({ kpis, isStale = false }: PortfolioKpisProps) {
  const critical = kpis.tiers.find((tier) => tier.tier === "critical");

  return (
    <div className={cn("space-y-6 transition-opacity", isStale && "opacity-60")} aria-busy={isStale}>
      <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">Revenue at risk over the next year</p>
        <p className="font-heading text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">
          {formatCurrencyCompact(kpis.total_annual_revenue_at_risk)}
        </p>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Across {formatCount(kpis.n_customers)} scored customers, at an average{" "}
          {formatPercent(kpis.mean_churn_probability)} chance of leaving.{" "}
          {critical && critical.n_customers > 0 ? (
            <>
              <strong className="font-medium text-foreground">
                {formatCount(critical.n_customers)} are leaving soon
              </strong>{" "}
              unless someone intervenes — {formatCurrency(critical.expected_value_at_risk)} of
              lifetime value between them.
            </>
          ) : (
            <>Nobody is in the critical tier right now.</>
          )}
        </p>

        <dl className="mt-6 grid gap-5 border-t pt-5 sm:grid-cols-3">
          <Figure
            label="Worth recovering"
            value={formatCurrencyCompact(kpis.total_expected_saved)}
            note="if every at-risk customer is contacted and the save rate holds"
            emphasis
          />
          <Figure
            label="Cost to contact them"
            value={formatCurrencyCompact(kpis.total_campaign_cost)}
            note="priced per risk tier"
          />
          <Figure
            label="Net benefit"
            value={formatCurrencyCompact(kpis.net_benefit)}
            note={
              kpis.roi === null
                ? "no campaign budget, so no return to measure"
                : `${formatRoi(kpis.roi)} return on the spend`
            }
          />
        </dl>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-medium">Where the risk sits</h2>
          <p className="text-sm text-muted-foreground">
            Tiers are this model&apos;s own risk bands, so &ldquo;critical&rdquo; means the same
            thing whatever the dataset&apos;s churn rate.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Customers and money by risk tier</caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Tier
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Customers
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Avg. chance of leaving
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Value at risk
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Worth recovering
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Highest risk first: the tier a team acts on today is the one they read first. */}
              {[...kpis.tiers].reverse().map((tier) => (
                <tr key={tier.tier} className="border-t">
                  <td className="px-4 py-2.5">
                    <RiskTierBadge tier={tier.tier} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{formatCount(tier.n_customers)}</span>
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <span
                          className={`block h-full rounded-full ${riskTierMeta(tier.tier).meterClassName}`}
                          style={{
                            width: `${Math.max(tier.share * 100, tier.share > 0 ? 2 : 0)}%`,
                          }}
                        />
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatPercent(tier.share)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {tier.n_customers === 0 ? "—" : formatPercent(tier.mean_churn_probability)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {formatCurrency(tier.expected_value_at_risk)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(tier.expected_saved)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm text-muted-foreground">
          <Link href="/predict" className="font-medium text-primary hover:underline">
            Open the call list
          </Link>{" "}
          to see who to contact first, and why each of them is at risk.
        </p>
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        <span
          className={cn(
            "font-heading font-semibold tabular-nums",
            emphasis ? "text-3xl" : "text-2xl",
          )}
        >
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{note}</span>
      </dd>
    </div>
  );
}
