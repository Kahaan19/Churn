from datetime import datetime

from pydantic import BaseModel

from app.schemas.finance import AssumptionsBlock, RiskTier


class TierKpi(BaseModel):
    """One risk tier's share of the portfolio — headcount and money, side by side."""

    tier: RiskTier
    n_customers: int
    share: float
    mean_churn_probability: float
    monthly_revenue_at_risk: float
    expected_value_at_risk: float
    expected_saved: float
    campaign_cost: float


class PortfolioKpis(BaseModel):
    """Everything scored against one run, aggregated.

    Recomputed from each customer's stored probability and revenue rather than summed from their
    stored financials, because `save_rate` and `gross_margin` are answerable questions ("what if we
    only save one in ten?") and both change the arithmetic. The `assumptions` block therefore
    always describes the numbers in *this* response, not the ones on disk.
    """

    run_id: str
    n_customers: int
    n_batches: int
    mean_churn_probability: float
    tier_counts: dict[RiskTier, int]
    tiers: list[TierKpi]

    total_monthly_revenue_at_risk: float
    total_annual_revenue_at_risk: float
    total_expected_value_at_risk: float
    total_expected_saved: float
    total_campaign_cost: float
    # expected_saved less campaign_cost: what acting on every at-risk customer is worth on net.
    net_benefit: float
    # None, never inf — a portfolio with no intervention budget has no return *ratio*.
    roi: float | None

    assumptions: AssumptionsBlock
    # True when a query parameter overrode config, so the UI can say the figures are a what-if.
    is_overridden: bool
    last_scored_at: datetime | None
