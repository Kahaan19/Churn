import type { RiskTier } from "@/lib/api/predictions";
import { RISK_TIERS, riskTierMeta } from "@/lib/risk";
import { cn } from "@/lib/utils";

interface RiskTierBadgeProps {
  tier: RiskTier;
  className?: string;
}

/**
 * The tier's name, its colour, and a four-step meter — three signals for one fact.
 *
 * The meter is not decoration: colour-blind readers and greyscale printouts get the severity from
 * the filled-step count, which colour alone would not carry.
 */
export function RiskTierBadge({ tier, className }: RiskTierBadgeProps) {
  const meta = riskTierMeta(tier);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <span className="flex items-center gap-px" aria-hidden>
        {RISK_TIERS.map((_, step) => (
          <span
            key={step}
            className={cn(
              "h-2.5 w-0.5 rounded-full",
              meta.meterClassName,
              step < meta.rank ? "" : "opacity-25",
            )}
          />
        ))}
      </span>
      {meta.label}
    </span>
  );
}
