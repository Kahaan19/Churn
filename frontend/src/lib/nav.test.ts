import { describe, expect, it } from "vitest";

import { NAV_ITEMS, isActiveNav } from "@/lib/nav";

describe("isActiveNav", () => {
  it("matches the overview only on the root, not on every path under it", () => {
    expect(isActiveNav("/", "/")).toBe(true);
    expect(isActiveNav("/runs", "/")).toBe(false);
  });

  it("keeps the section highlighted on its detail pages", () => {
    expect(isActiveNav("/runs/abc-123", "/runs")).toBe(true);
    expect(isActiveNav("/predict/batches/abc-123", "/predict")).toBe(true);
  });

  it("does not highlight a different section", () => {
    expect(isActiveNav("/datasets", "/runs")).toBe(false);
  });
});

describe("NAV_ITEMS", () => {
  it("points every destination at a route that exists", () => {
    // Each of these has a page under src/app; a nav link to a 404 is how /settings shipped broken.
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/datasets",
      "/runs",
      "/predict",
      "/settings",
    ]);
  });
});
