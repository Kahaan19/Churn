import { describe, expect, it } from "vitest";

import {
  formatCount,
  formatCurrency,
  formatCurrencyCompact,
  formatCurrencyPrecise,
  formatPercent,
  formatRoi,
} from "@/lib/format";

describe("formatCurrency", () => {
  it("rounds to whole units for list and summary figures", () => {
    expect(formatCurrency(1230.31)).toBe("$1,230");
    expect(formatCurrency(0)).toBe("$0");
  });

  it("keeps cents where a single customer's exact figure matters", () => {
    expect(formatCurrencyPrecise(1230.31)).toBe("$1,230.31");
    expect(formatCurrencyPrecise(71.2)).toBe("$71.20");
  });

  it("compacts headline totals", () => {
    expect(formatCurrencyCompact(1_240_000)).toBe("$1.2M");
    expect(formatCurrencyCompact(8_500)).toBe("$8.5K");
  });
});

describe("formatPercent", () => {
  it("renders a probability as a whole percentage by default", () => {
    expect(formatPercent(0.8)).toBe("80%");
    expect(formatPercent(0.055)).toBe("6%");
  });

  it("can keep a decimal where small differences matter", () => {
    expect(formatPercent(0.125, 1)).toBe("12.5%");
    expect(formatPercent(0.128, 1)).toBe("12.8%");
  });
});

describe("formatRoi", () => {
  it("renders a return as a multiplier", () => {
    expect(formatRoi(2.28)).toBe("2.3×");
  });

  it("says there is no spend rather than showing infinity or a misleading zero", () => {
    expect(formatRoi(null)).toBe("No spend");
    expect(formatRoi(null)).not.toContain("0");
    expect(formatRoi(null)).not.toContain("∞");
  });

  it("keeps a negative return visible as a loss", () => {
    expect(formatRoi(-0.4)).toBe("-0.4×");
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(1000)).toBe("1,000");
  });
});
