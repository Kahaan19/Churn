import type { Explanation, FeatureContribution } from "@/lib/api/runs";

/**
 * Turns SHAP contributions into sentences a business reader can act on.
 *
 * Kept out of the components so the wording is unit-testable: the phase's acceptance test is that
 * someone with no ML background reads a waterfall and states the top three reasons correctly, and
 * that is a property of this text, not of the chart.
 */

const RANK_PHRASES = ["the most", "the second most", "the third most"];

export function formatFeatureValue(value: FeatureContribution["value"]): string {
  if (value === null) return "not given";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return value;
}

export function contributionCaption(contribution: FeatureContribution, rank: number): string {
  const verb = contribution.direction === "increases_risk" ? "raises" : "lowers";
  const rankPhrase = RANK_PHRASES[rank] ?? `the ${rank + 1}th most`;
  const value = formatFeatureValue(contribution.value);
  // "Label: value — verb" rather than "Label (value) verb", which reads as a double parenthetical
  // once a display name carries its own unit, e.g. "Tenure (months) (1)".
  return `${contribution.display_name}: ${value} — ${verb} this customer's risk ${rankPhrase}.`;
}

export function topCaptions(contributions: FeatureContribution[], limit = 3): string[] {
  return contributions.slice(0, limit).map(contributionCaption);
}

export function riskSummary(explanation: Explanation): string {
  const percent = Math.round(explanation.churn_probability * 100);
  const raising = explanation.shap_values.filter(
    (c) => c.direction === "increases_risk" && c.contribution !== 0,
  ).length;
  const subject = raising === 1 ? "1 factor pushes" : `${raising} factors push`;
  return `This customer has a ${percent}% chance of churning. ${subject} that number up; the rest pull it down.`;
}
