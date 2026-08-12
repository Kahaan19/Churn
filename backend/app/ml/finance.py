"""The financial model: floats in, floats out.

Every currency figure the platform shows is produced here and nowhere else — no LLM ever computes
or re-estimates one (CLAUDE.md rule 1). Nothing in this module reads a file, opens a session, or
calls a model: the assumptions arrive as a `FinancialAssumptions` argument, which is what makes the
table in `DATA_CONTRACT.md` testable as pure arithmetic.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

from app.core.exceptions import InvalidFinancialInput
from app.schemas.finance import (
    RISK_TIERS,
    AssumptionsBlock,
    CustomerFinancials,
    FinancialAssumptions,
    RiskTier,
)


def _validated_probability(churn_probability: float) -> float:
    value = float(churn_probability)
    if math.isnan(value) or not 0.0 <= value <= 1.0:
        raise InvalidFinancialInput(
            f"churn_probability must be a number in [0, 1]; got {churn_probability!r}."
        )
    return value


def _validated_arpu(arpu: float) -> float:
    value = float(arpu)
    if math.isnan(value) or math.isinf(value) or value < 0:
        raise InvalidFinancialInput(
            f"arpu must be a finite, non-negative number; got {arpu!r}. A customer with no "
            "recorded revenue cannot have revenue at risk."
        )
    return value


def annuity_factor(discount_rate_monthly: float, months: int) -> float:
    """Present value of 1 unit received at the end of each of `months` months.

    Summed term by term rather than via the closed form so a zero discount rate needs no special
    case and the result matches the formula in ARCHITECTURE.md exactly.
    """
    if months <= 0:
        raise InvalidFinancialInput(f"CLV horizon must be at least one month; got {months}.")
    rate = 1.0 + discount_rate_monthly
    return sum(1.0 / rate**month for month in range(1, months + 1))


def clv(arpu: float, assumptions: FinancialAssumptions) -> float:
    """Discounted lifetime *profit* — margin, not revenue, over the assumed horizon."""
    value = _validated_arpu(arpu)
    return (
        value
        * assumptions.gross_margin
        * annuity_factor(assumptions.discount_rate_monthly, assumptions.expected_tenure_months)
    )


def assign_risk_tier(churn_probability: float, bounds: Mapping[str, Sequence[float]]) -> RiskTier:
    """Place a probability in the run's own quantile bands.

    Tiers are per-run (stored on `run.risk_tier_bounds`) rather than fixed cut-offs, so "critical"
    means the same thing — the top quartile of this model's risk — across datasets with very
    different base rates. Walking from the top down makes boundaries belong to the higher tier and
    keeps degenerate bands (identical quantiles on a flat probability distribution) resolvable.
    """
    probability = _validated_probability(churn_probability)
    for tier in reversed(RISK_TIERS):
        band = bounds.get(tier)
        if band is None:
            raise InvalidFinancialInput(f"Risk tier bounds are missing the '{tier}' band.")
        if probability >= float(band[0]):
            return tier
    return RISK_TIERS[0]


def customer_financials(
    *,
    churn_probability: float,
    arpu: float,
    tier: RiskTier,
    assumptions: FinancialAssumptions,
) -> CustomerFinancials:
    """Every money figure for one customer, plus the assumptions they rest on."""
    probability = _validated_probability(churn_probability)
    monthly = _validated_arpu(arpu)
    lifetime_value = clv(monthly, assumptions)

    campaign_cost = assumptions.retention_cost[tier]
    expected_value_at_risk = probability * lifetime_value
    # Factor order is fixed so `expected_saved` is bit-identical to `p · save_rate · clv`, which is
    # what the DATA_CONTRACT.md test asserts exactly.
    expected_saved = probability * assumptions.save_rate * lifetime_value

    return CustomerFinancials(
        arpu=monthly,
        clv=lifetime_value,
        monthly_revenue_at_risk=probability * monthly,
        annual_revenue_at_risk=probability * monthly * 12,
        expected_value_at_risk=expected_value_at_risk,
        expected_saved=expected_saved,
        campaign_cost=campaign_cost,
        roi=None if campaign_cost == 0 else (expected_saved - campaign_cost) / campaign_cost,
        assumptions=AssumptionsBlock.of(assumptions),
    )
