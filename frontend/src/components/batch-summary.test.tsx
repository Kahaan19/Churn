import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BatchSummary } from "@/components/batch-summary";
import type { BatchSummary as BatchSummaryData } from "@/lib/api/predictions";

const summary: BatchSummaryData = {
  n_scored: 1000,
  tier_counts: { low: 400, medium: 300, high: 200, critical: 100 },
  mean_churn_probability: 0.27,
  total_monthly_revenue_at_risk: 103_000,
  total_annual_revenue_at_risk: 1_240_000,
  total_expected_value_at_risk: 2_100_000,
  total_expected_saved: 630_000,
  total_campaign_cost: 21_000,
  assumptions: {
    save_rate: 0.3,
    gross_margin: 0.65,
    discount_rate_monthly: 0.01,
    horizon_months: 24,
  },
};

describe("BatchSummary", () => {
  it("leads with annual revenue at risk", () => {
    render(<BatchSummary summary={summary} />);

    expect(screen.getByText("$1.2M")).toBeInTheDocument();
    expect(screen.getByText("Revenue at risk over the next year")).toBeInTheDocument();
  });

  it("reports the critical-tier count and its share of the batch", () => {
    render(<BatchSummary summary={summary} />);

    expect(screen.getByText("Leaving soon")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("10% of the batch is critical")).toBeInTheDocument();
  });

  it("names every tier in the breakdown, so severity never rests on colour alone", () => {
    render(<BatchSummary summary={summary} />);

    for (const label of ["Low", "Medium", "High", "Critical"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the assumptions the recoverable figure depends on", () => {
    render(<BatchSummary summary={summary} />);

    expect(screen.getByText("These figures assume:")).toBeInTheDocument();
    expect(screen.getByText("$630K")).toBeInTheDocument();
  });

  it("survives an empty batch without dividing by zero", () => {
    const empty: BatchSummaryData = {
      ...summary,
      n_scored: 0,
      tier_counts: { low: 0, medium: 0, high: 0, critical: 0 },
      mean_churn_probability: 0,
      total_annual_revenue_at_risk: 0,
    };

    render(<BatchSummary summary={empty} />);

    expect(screen.getByText("0% of the batch is critical")).toBeInTheDocument();
  });
});
