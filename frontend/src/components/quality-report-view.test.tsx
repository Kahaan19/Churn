import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QualityReportView } from "@/components/quality-report-view";
import type { QualityReport } from "@/lib/api/datasets";

const baseReport: QualityReport = {
  n_rows: 60,
  n_duplicate_rows: 0,
  missing: [],
  type_issues: [],
  outliers: [],
  class_balance: { positive: 15, negative: 45, positive_rate: 0.25 },
  leakage_warnings: [],
  warnings: [],
  blocking_errors: [],
};

describe("QualityReportView", () => {
  it("shows a busy indicator while loading", () => {
    render(<QualityReportView state={{ status: "loading" }} />);
    expect(screen.getByLabelText("Loading quality report")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const onRetry = vi.fn();
    render(<QualityReportView state={{ status: "error", onRetry }} />);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders class balance on success", () => {
    render(<QualityReportView state={{ status: "success", report: baseReport }} />);

    expect(screen.getByText("25.0%")).toBeInTheDocument();
  });

  it("surfaces blocking errors prominently when training is blocked", () => {
    render(
      <QualityReportView
        state={{
          status: "success",
          report: { ...baseReport, blocking_errors: ["Target column has only one class."] },
        }}
      />,
    );

    expect(screen.getByText("Training is blocked until these are resolved")).toBeInTheDocument();
    expect(screen.getByText("Target column has only one class.")).toBeInTheDocument();
  });

  it("does not show a blocking-errors banner on a clean report", () => {
    render(<QualityReportView state={{ status: "success", report: baseReport }} />);

    expect(screen.queryByText("Training is blocked until these are resolved")).not.toBeInTheDocument();
  });
});
