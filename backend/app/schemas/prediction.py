from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.explain import FeatureContribution, OutputSpace
from app.schemas.finance import AssumptionsBlock, CustomerFinancials, RiskTier

BatchSource = Literal["single", "csv"]
BatchStatus = Literal["queued", "running", "succeeded", "failed"]

# Sort keys the customer list offers. Money first: the default view of a scored batch is "who is
# costing us the most", not "who has the highest probability" — a 90%-risk customer paying £20 is
# not the one to call first.
SortKey = Literal["expected_value_at_risk", "churn_probability", "monthly_revenue_at_risk"]


class SinglePredictionRequest(BaseModel):
    run_id: str
    features: dict[str, object]


class PredictionShap(BaseModel):
    """SHAP for one customer, aggregated to source columns and sorted by |contribution|."""

    base_value: float
    output_space: OutputSpace
    values: list[FeatureContribution]


class Prediction(BaseModel):
    id: str
    batch_id: str
    run_id: str
    customer_ref: str | None
    features: dict[str, object]
    churn_probability: float
    risk_tier: RiskTier
    shap_values: PredictionShap
    financials: CustomerFinancials
    segment_label: str | None
    created_at: datetime


class PredictionListItem(BaseModel):
    """The customer list's row — everything it renders, and nothing it doesn't.

    SHAP and the full feature dict are deliberately absent: a thousand-row page carrying every
    customer's contributions is megabytes of payload nobody looks at until a row is opened.
    """

    id: str
    customer_ref: str | None
    churn_probability: float
    risk_tier: RiskTier
    segment_label: str | None
    arpu: float
    monthly_revenue_at_risk: float
    expected_value_at_risk: float
    expected_saved: float
    campaign_cost: float
    roi: float | None


class BatchSummary(BaseModel):
    n_scored: int
    tier_counts: dict[RiskTier, int]
    mean_churn_probability: float
    total_monthly_revenue_at_risk: float
    total_annual_revenue_at_risk: float
    total_expected_value_at_risk: float
    total_expected_saved: float
    total_campaign_cost: float
    assumptions: AssumptionsBlock


class PredictionBatch(BaseModel):
    id: str
    run_id: str
    source: BatchSource
    filename: str | None
    n_rows: int
    status: BatchStatus
    error_message: str | None
    created_at: datetime
    # Absent until the job finishes; a queued batch has nothing to aggregate yet.
    summary: BatchSummary | None = Field(default=None)
