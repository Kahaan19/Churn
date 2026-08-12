import { AssumptionsPanel } from "@/components/assumptions-panel";
import { RiskTierBadge } from "@/components/risk-tier-badge";
import type { BatchSummary as BatchSummaryData } from "@/lib/api/predictions";
import { formatCount, formatCurrencyCompact, formatPercent } from "@/lib/format";
import { RISK_TIERS, riskTierMeta, tierShare } from "@/lib/risk";

interface BatchSummaryProps {
  summary: BatchSummaryData;
}

/**
 * Hierarchy follows money and risk (CONVENTIONS.md): annual revenue at risk gets the largest type
 * on the page and the critical-tier count sits beside it. Everything else is deliberately quieter —
 * four equally-weighted metric cards would say nothing about what matters.
 */
export function BatchSummary({ summary }: BatchSummaryProps) {
  const criticalCount = summary.tier_counts.critical ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div>
          <p className="text-sm text-muted-foreground">Revenue at risk over the next year</p>
          <p className="font-heading text-5xl font-semibold tracking-tight tabular-nums">
            {formatCurrencyCompact(summary.total_annual_revenue_at_risk)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            across {formatCount(summary.n_scored)} customers, at an average{" "}
            {formatPercent(summary.mean_churn_probability)} chance of leaving
          </p>
        </div>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
          <Figure
            label="Leaving soon"
            value={formatCount(criticalCount)}
            note={`${formatPercent(tierShare(summary.tier_counts, "critical"))} of the batch is critical`}
          />
          <Figure
            label="Recoverable"
            value={formatCurrencyCompact(summary.total_expected_saved)}
            note="if every at-risk customer is contacted"
          />
          <Figure
            label="Campaign cost"
            value={formatCurrencyCompact(summary.total_campaign_cost)}
            note="budget to contact all of them"
          />
        </div>

        <div className="space-y-1.5 border-t pt-4">
          {RISK_TIERS.map((tier) => {
            const share = tierShare(summary.tier_counts, tier);
            return (
              <div key={tier} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0">
                  <RiskTierBadge tier={tier} />
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${riskTierMeta(tier).meterClassName}`}
                    style={{ width: `${Math.max(share * 100, share > 0 ? 1 : 0)}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
                  {formatCount(summary.tier_counts[tier] ?? 0)} ({formatPercent(share)})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <AssumptionsPanel assumptions={summary.assumptions} className="self-start" />
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
