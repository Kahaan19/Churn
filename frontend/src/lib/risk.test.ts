import { describe, expect, it } from "vitest";

import { RISK_TIERS, riskTierMeta, tierBandCaption, tierShare } from "@/lib/risk";

describe("riskTierMeta", () => {
  it("ranks tiers by ascending severity so the meter can encode them without colour", () => {
    expect(RISK_TIERS.map((tier) => riskTierMeta(tier).rank)).toEqual([1, 2, 3, 4]);
  });

  it("gives every tier a name and an action, not just a colour", () => {
    for (const tier of RISK_TIERS) {
      const meta = riskTierMeta(tier);
      expect(meta.label).not.toBe("");
      expect(meta.blurb).not.toBe("");
    }
  });
});

describe("tierBandCaption", () => {
  it("states the probability band the tier came from, since bands are per-run", () => {
    const caption = tierBandCaption("critical", { critical: [0.55, 1.0] });

    expect(caption).toContain("55");
    expect(caption).toContain("100");
    expect(caption).toContain("this model");
  });

  it("falls back to a claim it can actually support when bounds are unavailable", () => {
    expect(tierBandCaption("high", null)).toBe("High risk for this model.");
  });
});

describe("tierShare", () => {
  it("reports a tier's share of the scored population", () => {
    expect(tierShare({ low: 25, medium: 25, high: 25, critical: 25 }, "critical")).toBe(0.25);
  });

  it("returns zero rather than dividing by zero on an empty batch", () => {
    expect(tierShare({ low: 0, medium: 0, high: 0, critical: 0 }, "low")).toBe(0);
  });
});
