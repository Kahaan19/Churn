import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FinancialsPanel } from "@/components/financials-panel";
import type { Financials } from "@/lib/api/predictions";

const financials: Financials = {
  arpu: 89.1,
  clv: 1230.31,
  monthly_revenue_at_risk: 71.28,
  annual_revenue_at_risk: 855.36,
  expected_value_at_risk: 984.25,
  expected_saved: 295.27,
  campaign_cost: 90,
  roi: 2.28,
  assumptions: {
    save_rate: 0.3,
    gross_margin: 0.65,
    discount_rate_monthly: 0.01,
    horizon_months: 24,
  },
};

describe("FinancialsPanel", () => {
  it("shows every figure to the cent, since these are one customer's numbers", () => {
    render(<FinancialsPanel financials={financials} />);

    expect(screen.getByText("$1,230.31")).toBeInTheDocument();
    expect(screen.getByText("$71.28")).toBeInTheDocument();
    expect(screen.getByText("$855.36")).toBeInTheDocument();
    expect(screen.getByText("$295.27")).toBeInTheDocument();
  });

  it("renders ROI as a multiplier", () => {
    render(<FinancialsPanel financials={financials} />);

    expect(screen.getByText("2.3×")).toBeInTheDocument();
  });

  it("says there is no spend rather than showing an infinite return", () => {
    render(
      <FinancialsPanel financials={{ ...financials, campaign_cost: 0, roi: null }} />,
    );

    expect(screen.getByText("No spend")).toBeInTheDocument();
    expect(screen.getByText("this tier has no budget")).toBeInTheDocument();
  });

  it("keeps the assumptions behind the figures on screen with them", () => {
    render(<FinancialsPanel financials={financials} />);

    // The acceptance criterion for this phase: no assumption-derived figure without its basis
    // within a glance.
    expect(screen.getByText("These figures assume:")).toBeInTheDocument();
    expect(screen.getByText("Customers saved when contacted")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("assumed — not measured from your data")).toBeInTheDocument();
    expect(screen.getByText("24 months")).toBeInTheDocument();
  });
});
