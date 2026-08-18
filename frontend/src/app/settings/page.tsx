"use client";

import { HealthStatus } from "@/components/health-status";
import { RiskTierBadge } from "@/components/risk-tier-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyPrecise, formatPercent } from "@/lib/format";
import { useSettingsQuery } from "@/lib/hooks/use-settings";
import { RISK_TIERS, riskTierMeta } from "@/lib/risk";

/**
 * What the platform assumes, in one place.
 *
 * Read-only, and says so: `config/financial.yaml` is the single source of these values, and a
 * second way to set them would mean two customers scored minutes apart could rest on different
 * assumptions with no record of it. To try other numbers without changing anything, the overview
 * page's sliders are the right tool.
 */
export default function SettingsPage() {
  const settings = useSettingsQuery();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The assumptions behind every currency figure in this app, and how to change them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Financial assumptions</CardTitle>
          <CardDescription>
            Read-only here. Edit <code className="font-mono">config/financial.yaml</code> and
            restart the API to change them for good — or move the sliders on the overview page to
            try other numbers without committing to them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.isPending && (
            <div className="space-y-2" aria-busy="true" aria-label="Loading settings">
              <div className="h-5 w-full animate-pulse rounded bg-muted" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          )}

          {settings.isError && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {settings.error instanceof Error
                  ? settings.error.message
                  : "Couldn't read the platform configuration."}{" "}
                Check that the API is running.
              </p>
              <Button variant="outline" size="sm" onClick={() => void settings.refetch()}>
                Try again
              </Button>
            </div>
          )}

          {settings.data && (
            <div className="space-y-6">
              <dl className="space-y-3">
                <Row
                  label="Customers saved when contacted"
                  value={formatPercent(settings.data.save_rate)}
                  note="An assumption, not a measurement. Every recoverable-revenue figure scales with it."
                />
                <Row
                  label="Gross margin"
                  value={formatPercent(settings.data.gross_margin)}
                  note="The share of revenue that is profit. Lifetime value counts profit, not turnover."
                />
                <Row
                  label="Value horizon"
                  value={`${settings.data.expected_tenure_months} months`}
                  note="How far ahead a customer's value is counted."
                />
                <Row
                  label="Monthly discount rate"
                  value={formatPercent(settings.data.discount_rate_monthly, 1)}
                  note="Revenue a year out is worth less than revenue today."
                />
              </dl>

              <div>
                <p className="text-sm font-medium">Cost of contacting one customer</p>
                <p className="text-xs text-muted-foreground">
                  Budgeted per risk tier — a customer about to leave is worth a phone call, and one
                  who isn&apos;t is worth an email.
                </p>
                <ul className="mt-3 space-y-2">
                  {RISK_TIERS.map((tier) => (
                    <li key={tier} className="flex items-center justify-between gap-4 text-sm">
                      <span className="flex items-center gap-2">
                        <RiskTierBadge tier={tier} />
                        <span className="text-xs text-muted-foreground">
                          {riskTierMeta(tier).blurb}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCurrencyPrecise(settings.data.retention_cost[tier] ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                Loaded from <code className="font-mono">{settings.data.config_path}</code>. Uploads
                are capped at {settings.data.max_upload_mb} MB.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Follows your system setting unless you pick one. Risk tiers are legible in both, and
            never rely on colour alone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <HealthStatus />
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm">
        {label}
        <span className="block text-xs text-muted-foreground">{note}</span>
      </dt>
      <dd className="shrink-0 font-heading text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
