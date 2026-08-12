import type { RiskTier } from "@/lib/api/predictions";

export interface RiskTierMeta {
  tier: RiskTier;
  /** Ascending severity, 1–4. Drives the rank meter that carries the tier without relying on hue. */
  rank: number;
  label: string;
  /** What this tier means for the team, in a retention manager's words. */
  blurb: string;
  className: string;
  meterClassName: string;
}

export const RISK_TIERS: readonly RiskTier[] = ["low", "medium", "high", "critical"] as const;

const META: Record<RiskTier, RiskTierMeta> = {
  low: {
    tier: "low",
    rank: 1,
    label: "Low",
    blurb: "Unlikely to leave. No action budgeted.",
    className: "bg-risk-low text-risk-low-foreground",
    meterClassName: "bg-risk-low-foreground",
  },
  medium: {
    tier: "medium",
    rank: 2,
    label: "Medium",
    blurb: "Worth a light touch — an email or a check-in.",
    className: "bg-risk-medium text-risk-medium-foreground",
    meterClassName: "bg-risk-medium-foreground",
  },
  high: {
    tier: "high",
    rank: 3,
    label: "High",
    blurb: "Likely to leave. Worth a call and an offer.",
    className: "bg-risk-high text-risk-high-foreground",
    meterClassName: "bg-risk-high-foreground",
  },
  critical: {
    tier: "critical",
    rank: 4,
    label: "Critical",
    blurb: "Leaving soon unless someone intervenes.",
    className: "bg-risk-critical text-risk-critical-foreground",
    meterClassName: "bg-risk-critical-foreground",
  },
};

export function riskTierMeta(tier: RiskTier): RiskTierMeta {
  return META[tier];
}

/**
 * Tier bands are quantiles of *this run's* probabilities, so the same 40% score can be "high" on
 * one dataset and "critical" on another. Spelling that out keeps the badge from reading as an
 * absolute claim about the customer.
 */
export function tierBandCaption(tier: RiskTier, bounds: Record<string, number[]> | null): string {
  const band = bounds?.[tier];
  if (!band) return `${riskTierMeta(tier).label} risk for this model.`;
  const low = Math.round(band[0] * 100);
  const high = Math.round(band[1] * 100);
  return `${riskTierMeta(tier).label} risk: ${low}–${high}% churn probability for this model.`;
}

/** Sum of a tier's share of the batch, for the "where the money sits" read on the summary. */
export function tierShare(counts: Record<string, number>, tier: RiskTier): number {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return total === 0 ? 0 : (counts[tier] ?? 0) / total;
}
