import { AssumptionsPanel } from "@/components/assumptions-panel";
import type { Financials } from "@/lib/api/predictions";
import { formatCurrencyPrecise, formatRoi } from "@/lib/format";

interface FinancialsPanelProps {
  financials: Financials;
}

/**
 * What this customer is worth and what leaving would cost, with the assumptions in the same glance.
 *
 * Ordered by what a retention manager decides with: what we lose if they go, what we'd get back,
 * what the attempt costs — then the ratio between the last two.
 */
export function FinancialsPanel({ financials }: FinancialsPanelProps) {
  const rows = [
    {
      label: "Revenue at risk, per month",
      value: formatCurrencyPrecise(financials.monthly_revenue_at_risk),
      hint: "churn probability × monthly charge",
    },
    {
      label: "Revenue at risk, per year",
      value: formatCurrencyPrecise(financials.annual_revenue_at_risk),
      hint: "twelve months of the above",
    },
    {
      label: "Lifetime value at risk",
      value: formatCurrencyPrecise(financials.expected_value_at_risk),
      hint: "churn probability × lifetime value",
    },
    {
      label: "Expected to be saved",
      value: formatCurrencyPrecise(financials.expected_saved),
      hint: "if we run a retention campaign on them",
    },
    {
      label: "Cost of the attempt",
      value: formatCurrencyPrecise(financials.campaign_cost),
      hint: "budgeted per customer at this risk tier",
    },
    {
      label: "Return on that spend",
      value: formatRoi(financials.roi),
      hint: financials.roi === null ? "this tier has no budget" : "expected saved ÷ cost",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 border-b pb-2">
        <div>
          <p className="text-xs text-muted-foreground">Lifetime value</p>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {formatCurrencyPrecise(financials.clv)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Monthly charge</p>
          <p className="text-lg font-medium tabular-nums">
            {formatCurrencyPrecise(financials.arpu)}
          </p>
        </div>
      </div>

      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 text-sm">
            <dt>
              {row.label}
              <span className="block text-xs text-muted-foreground">{row.hint}</span>
            </dt>
            <dd className="shrink-0 font-medium tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      <AssumptionsPanel assumptions={financials.assumptions} />
    </div>
  );
}
