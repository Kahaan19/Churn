/**
 * Number formatting for figures a retention manager compares in a column.
 *
 * Kept out of components so the rounding rules are unit-testable and identical everywhere: the
 * same revenue figure must not read as "$1,231" in the list and "$1,230.31" in the drawer.
 */

// The dataset carries no currency, so one constant decides it for the whole app. Change it here.
const CURRENCY = "USD";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

const preciseCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number): string {
  return currency.format(value);
}

/** Two decimals — for a single customer's figures, where the cents are the point. */
export function formatCurrencyPrecise(value: number): string {
  return preciseCurrency.format(value);
}

/** For headline totals, where "$1.2M" beats thirteen digits nobody reads. */
export function formatCurrencyCompact(value: number): string {
  return compactCurrency.format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

/**
 * ROI as a multiplier. Null means the tier has no intervention budget, so there is no return to
 * divide by — never rendered as "∞" or as a zero that reads like a bad investment.
 */
export function formatRoi(value: number | null): string {
  if (value === null) return "No spend";
  return `${value.toFixed(1)}×`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
