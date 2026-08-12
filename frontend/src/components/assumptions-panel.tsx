import type { Assumptions } from "@/lib/api/predictions";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AssumptionsPanelProps {
  assumptions: Assumptions;
  className?: string;
}

/**
 * The basis for every currency figure on screen, shown next to those figures rather than buried in
 * a settings page. `save_rate` in particular is an assumption, not a measurement — a dashboard that
 * presents it as a finding is worse than no dashboard (ARCHITECTURE.md, "Financial model").
 */
export function AssumptionsPanel({ assumptions, className }: AssumptionsPanelProps) {
  const rows = [
    {
      label: "Customers saved when contacted",
      value: formatPercent(assumptions.save_rate),
      note: "assumed — not measured from your data",
    },
    {
      label: "Gross margin",
      value: formatPercent(assumptions.gross_margin),
      note: "share of revenue that is profit",
    },
    {
      label: "Value horizon",
      value: `${assumptions.horizon_months} months`,
      note: "how far ahead lifetime value is counted",
    },
    {
      label: "Monthly discount rate",
      value: formatPercent(assumptions.discount_rate_monthly, 1),
      note: "future revenue is worth less than today's",
    },
  ];

  return (
    <div className={cn("rounded-lg bg-muted/50 p-3 ring-1 ring-foreground/5", className)}>
      <p className="text-xs font-medium">These figures assume:</p>
      <dl className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">
              {row.label}
              <span className="block text-[0.68rem] opacity-70">{row.note}</span>
            </dt>
            <dd className="shrink-0 font-medium tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[0.68rem] text-muted-foreground">
        Change these in <code className="font-mono">backend/config/financial.yaml</code> and score
        again.
      </p>
    </div>
  );
}
