from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

RiskTier = Literal["low", "medium", "high", "critical"]

# Ascending risk. The order is load-bearing: `assign_risk_tier` walks it backwards, and the UI
# renders tiers in it.
RISK_TIERS: tuple[RiskTier, ...] = ("low", "medium", "high", "critical")


class FinancialAssumptions(BaseModel):
    """The contents of `config/financial.yaml`, validated once at load time.

    Frozen because it is passed into pure functions in `ml/finance.py` that must be safe to call
    concurrently and must never see a value mutate mid-batch.
    """

    model_config = ConfigDict(frozen=True)

    gross_margin: float = Field(gt=0.0, le=1.0)
    discount_rate_monthly: float = Field(ge=0.0, lt=1.0)
    expected_tenure_months: int = Field(gt=0, le=600)
    save_rate: float = Field(ge=0.0, le=1.0)
    retention_cost: dict[RiskTier, float]

    @field_validator("retention_cost")
    @classmethod
    def _every_tier_priced(cls, value: dict[str, float]) -> dict[str, float]:
        missing = [tier for tier in RISK_TIERS if tier not in value]
        if missing:
            raise ValueError(
                "retention_cost is missing a cost for risk tier(s): " + ", ".join(missing) + "."
            )
        negative = sorted(tier for tier, cost in value.items() if cost < 0)
        if negative:
            raise ValueError(
                "retention_cost must be non-negative; negative for: " + ", ".join(negative) + "."
            )
        return value


class AssumptionsBlock(BaseModel):
    """Shipped with every financial payload so no figure is ever shown without its basis."""

    save_rate: float
    gross_margin: float
    discount_rate_monthly: float
    horizon_months: int

    @classmethod
    def of(cls, assumptions: FinancialAssumptions) -> "AssumptionsBlock":
        return cls(
            save_rate=assumptions.save_rate,
            gross_margin=assumptions.gross_margin,
            discount_rate_monthly=assumptions.discount_rate_monthly,
            horizon_months=assumptions.expected_tenure_months,
        )


class CustomerFinancials(BaseModel):
    """Money attached to one customer's churn probability, per DATA_CONTRACT.md."""

    arpu: float
    clv: float
    monthly_revenue_at_risk: float
    annual_revenue_at_risk: float
    expected_value_at_risk: float
    expected_saved: float
    campaign_cost: float
    # None, never inf: a zero-cost campaign has no return *ratio*, and rendering "∞" as a KPI is
    # how a dashboard starts lying.
    roi: float | None
    assumptions: AssumptionsBlock
