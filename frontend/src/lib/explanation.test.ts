import { describe, expect, it } from "vitest";

import type { Explanation, FeatureContribution } from "@/lib/api/runs";
import { contributionCaption, formatFeatureValue, riskSummary, topCaptions } from "@/lib/explanation";

function contribution(overrides: Partial<FeatureContribution>): FeatureContribution {
  return {
    feature: "Contract",
    display_name: "Contract type",
    value: "Month-to-month",
    contribution: 0.42,
    direction: "increases_risk",
    ...overrides,
  };
}

describe("contributionCaption", () => {
  it("names the driver, its value, and its rank in plain language", () => {
    expect(contributionCaption(contribution({}), 0)).toBe(
      "Contract type: Month-to-month — raises this customer's risk the most.",
    );
  });

  it("says a protective factor lowers risk rather than raising it", () => {
    const caption = contributionCaption(
      contribution({ contribution: -0.3, direction: "decreases_risk" }),
      1,
    );

    expect(caption).toBe(
      "Contract type: Month-to-month — lowers this customer's risk the second most.",
    );
  });
});

describe("formatFeatureValue", () => {
  it("keeps integers whole and rounds fractions to two places", () => {
    expect(formatFeatureValue(24)).toBe("24");
    expect(formatFeatureValue(89.0999)).toBe("89.10");
  });

  it("says a missing value is missing rather than showing null", () => {
    expect(formatFeatureValue(null)).toBe("not given");
  });
});

describe("topCaptions", () => {
  it("returns the three strongest drivers in order — the reasons a reader must be able to state", () => {
    const contributions = [
      contribution({ display_name: "Contract type", contribution: 0.5 }),
      contribution({ display_name: "Tenure (months)", value: 2, contribution: 0.3 }),
      contribution({ display_name: "Monthly charges", value: 89.1, contribution: 0.2 }),
      contribution({ display_name: "Gender", value: "Female", contribution: 0.01 }),
    ];

    const captions = topCaptions(contributions);

    expect(captions).toHaveLength(3);
    expect(captions[0]).toContain("Contract type");
    expect(captions[1]).toContain("Tenure (months): 2");
    expect(captions[2]).toContain("Monthly charges: 89.10");
    expect(captions.join(" ")).not.toContain("Gender");
  });
});

describe("riskSummary", () => {
  it("states the probability as a percentage and how many factors push it up", () => {
    const explanation: Explanation = {
      run_id: "run-1",
      algorithm: "xgboost",
      churn_probability: 0.735,
      base_value: -0.4,
      output_space: "logit",
      shap_values: [
        contribution({ contribution: 0.5 }),
        contribution({ contribution: -0.2, direction: "decreases_risk" }),
      ],
    };

    expect(riskSummary(explanation)).toBe(
      "This customer has a 74% chance of churning. 1 factor pushes that number up; the rest pull it down.",
    );
  });
});
