import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PortfolioKpis } from "@/components/portfolio-kpis";
import type { PortfolioKpis as PortfolioKpisData, TierKpi } from "@/lib/api/runs";

function tier(overrides: Partial<TierKpi> & Pick<TierKpi, "tier">): TierKpi {
  return {
    n_customers: 0,
    share: 0,
    mean_churn_probability: 0,
    monthly_revenue_at_risk: 0,
    expected_value_at_risk: 0,
    expected_saved: 0,
    campaign_cost: 0,
    ...overrides,
  };
}

function kpis(overrides: Partial<PortfolioKpisData> = {}): PortfolioKpisData {
  return {
    run_id: "run-1",
    n_customers: 100,
    n_batches: 2,
    mean_churn_probability: 0.27,
    tier_counts: { low: 40, medium: 30, high: 20, critical: 10 },
    tiers: [
      tier({ tier: "low", n_customers: 40, share: 0.4 }),
      tier({ tier: "medium", n_customers: 30, share: 0.3 }),
      tier({ tier: "high", n_customers: 20, share: 0.2 }),
      tier({
        tier: "critical",
        n_customers: 10,
        share: 0.1,
        mean_churn_probability: 0.81,
        expected_value_at_risk: 12000,
        expected_saved: 3600,
      }),
    ],
    total_monthly_revenue_at_risk: 2000,
    total_annual_revenue_at_risk: 24000,
    total_expected_value_at_risk: 40000,
    total_expected_saved: 12000,
    total_campaign_cost: 4000,
    net_benefit: 8000,
    roi: 2,
    assumptions: {
      save_rate: 0.3,
      gross_margin: 0.65,
      discount_rate_monthly: 0.01,
      horizon_months: 24,
    },
    is_overridden: false,
    last_scored_at: "2026-08-12T10:00:00Z",
    ...overrides,
  };
}

describe("PortfolioKpis", () => {
  it("leads with the year's revenue at risk", () => {
    render(<PortfolioKpis kpis={kpis()} />);

    expect(screen.getByText("$24K")).toBeInTheDocument();
    expect(screen.getByText("Revenue at risk over the next year")).toBeInTheDocument();
  });

  it("names the critical-tier headcount in the summary sentence", () => {
    render(<PortfolioKpis kpis={kpis()} />);

    expect(screen.getByText("10 are leaving soon")).toBeInTheDocument();
  });

  it("says so plainly when nobody is critical rather than showing a bare zero", () => {
    const empty = kpis({
      tiers: [
        tier({ tier: "low", n_customers: 100, share: 1 }),
        tier({ tier: "medium" }),
        tier({ tier: "high" }),
        tier({ tier: "critical" }),
      ],
    });

    render(<PortfolioKpis kpis={empty} />);

    expect(screen.getByText(/Nobody is in the critical tier/)).toBeInTheDocument();
  });

  it("ranks the tier table from critical down, so the tier to act on reads first", () => {
    render(<PortfolioKpis kpis={kpis()} />);

    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    const firstRow = within(rows[0]);
    expect(firstRow.getByText("Critical")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Low")).toBeInTheDocument();
  });

  it("reports no return to measure when there is no campaign budget", () => {
    render(<PortfolioKpis kpis={kpis({ roi: null, total_campaign_cost: 0 })} />);

    expect(screen.getByText(/no campaign budget, so no return to measure/)).toBeInTheDocument();
  });

  it("marks the figures busy while a new set of assumptions is in flight", () => {
    const { container } = render(<PortfolioKpis kpis={kpis()} isStale />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
