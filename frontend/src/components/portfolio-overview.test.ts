import { describe, expect, it } from "vitest";

import { nextSetupStep } from "@/components/portfolio-overview";

describe("nextSetupStep", () => {
  it("asks for a dataset first", () => {
    expect(nextSetupStep({ hasDataset: false, hasRun: false, scoring: false })).toBe("dataset");
  });

  it("asks for a model once there is data to train on", () => {
    expect(nextSetupStep({ hasDataset: true, hasRun: false, scoring: false })).toBe("run");
  });

  it("asks for a scored file once there is a model", () => {
    expect(nextSetupStep({ hasDataset: true, hasRun: true, scoring: false })).toBe("scoring");
  });

  it("shows the portfolio once customers have been scored", () => {
    expect(nextSetupStep({ hasDataset: true, hasRun: true, scoring: true })).toBeNull();
  });

  it("does not claim nothing is scored while the answer is still in flight", () => {
    // The KPI query is disabled until a run is selected, and a disabled query stays pending —
    // reading that as "no customers" flashed the setup ladder over a populated dashboard.
    expect(nextSetupStep({ hasDataset: true, hasRun: true, scoring: "unknown" })).toBeNull();
  });
});
