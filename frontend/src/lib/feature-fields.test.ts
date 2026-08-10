import { describe, expect, it } from "vitest";

import type { Dataset, EDAPayload } from "@/lib/api/datasets";
import { buildFeatureFields, fieldsToFeatures } from "@/lib/feature-fields";

const profile: Dataset["column_profile"] = {
  id_column: "customerID",
  target_column: "Churn",
  revenue_column: "MonthlyCharges",
  tenure_column: "tenure",
  numeric: ["tenure", "MonthlyCharges"],
  categorical_low: ["Contract"],
  categorical_high: ["City"],
  dropped: ["customerID"],
};

const eda: EDAPayload = {
  histograms: [
    { column: "tenure", bins: [0, 10, 20, 30], counts: [5, 40, 12] },
    { column: "MonthlyCharges", bins: [20, 60, 100], counts: [3, 9] },
  ],
  categorical: [
    { column: "Contract", levels: ["Month-to-month", "Two year"], counts: [80, 20], churn_rate: [0.4, 0.05] },
    { column: "City", levels: ["Austin"], counts: [10], churn_rate: [0.3] },
  ],
  correlation: { columns: [], matrix: [] },
  target_distribution: { labels: ["No", "Yes"], counts: [70, 30] },
  missing_matrix: [],
};

describe("buildFeatureFields", () => {
  it("prefills numerics from the busiest histogram bin's midpoint", () => {
    const fields = buildFeatureFields(profile, eda);

    // The 10-20 bin holds 40 of the 57 customers, so 15 is the typical tenure.
    expect(fields.find((f) => f.column === "tenure")).toEqual({
      column: "tenure",
      kind: "numeric",
      value: 15,
    });
    expect(fields.find((f) => f.column === "MonthlyCharges")).toMatchObject({ value: 80 });
  });

  it("prefills categoricals with the most common level and offers the rest as options", () => {
    const fields = buildFeatureFields(profile, eda);

    expect(fields.find((f) => f.column === "Contract")).toEqual({
      column: "Contract",
      kind: "categorical",
      value: "Month-to-month",
      levels: ["Month-to-month", "Two year"],
    });
  });

  it("covers every column the model consumes, and nothing it drops", () => {
    const columns = buildFeatureFields(profile, eda).map((f) => f.column);

    expect(new Set(columns)).toEqual(
      new Set(["tenure", "MonthlyCharges", "Contract", "City"]),
    );
    expect(columns).not.toContain("Churn");
    expect(columns).not.toContain("customerID");
  });

  it("degrades to an empty selection rather than throwing when EDA has no summary", () => {
    const fields = buildFeatureFields(profile, { ...eda, histograms: [], categorical: [] });

    expect(fields.find((f) => f.column === "tenure")).toMatchObject({ value: 0 });
    expect(fields.find((f) => f.column === "Contract")).toMatchObject({ value: "", levels: [] });
  });
});

describe("fieldsToFeatures", () => {
  it("flattens fields into the request body the explain endpoint expects", () => {
    expect(fieldsToFeatures(buildFeatureFields(profile, eda))).toEqual({
      tenure: 15,
      MonthlyCharges: 80,
      Contract: "Month-to-month",
      City: "Austin",
    });
  });
});
