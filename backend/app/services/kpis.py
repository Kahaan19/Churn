"""Portfolio aggregates for one run, with the two assumptions a business user argues about.

`save_rate` and `gross_margin` arrive as query parameters so the dashboard can answer "what if we
only save one in ten?" without rescoring anything. Every figure still comes from `ml.finance` —
this module sums, it does not invent arithmetic (CLAUDE.md rule 1).
"""

from collections import defaultdict
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_financial_assumptions
from app.ml.finance import customer_financials
from app.models.prediction import Prediction as PredictionRow
from app.models.prediction import PredictionBatch as BatchRow
from app.schemas.finance import RISK_TIERS, AssumptionsBlock, FinancialAssumptions, RiskTier
from app.schemas.kpi import PortfolioKpis, TierKpi
from app.services.runs import get_run


def resolve_assumptions(
    save_rate: float | None, gross_margin: float | None
) -> tuple[FinancialAssumptions, bool]:
    """Config, with the two overridable levers replaced when supplied.

    Validation lives in `FinancialAssumptions` itself, so an out-of-range override fails the same
    way a bad config file would rather than silently producing a negative saving.
    """
    base = get_financial_assumptions()
    overrides = {
        key: value
        for key, value in (("save_rate", save_rate), ("gross_margin", gross_margin))
        if value is not None
    }
    if not overrides:
        return base, False
    return FinancialAssumptions.model_validate({**base.model_dump(), **overrides}), True


def _scored_rows(session: Session, run_id: str) -> list[tuple[str, float, float]]:
    """(risk_tier, churn_probability, arpu) for every customer scored against this run.

    Only three values per row: `shap_values` is by far the largest column on the table and no
    aggregate touches it. `arpu` is read out of the stored financials because it is the revenue
    figure that was actually used at scoring time — re-deriving it from `features` would need the
    dataset's column profile and could disagree.
    """
    rows = session.execute(
        select(
            PredictionRow.risk_tier,
            PredictionRow.churn_probability,
            PredictionRow.financials["arpu"].as_float(),
        )
        .join(BatchRow, BatchRow.id == PredictionRow.batch_id)
        .where(BatchRow.run_id == run_id)
    ).all()
    return [(str(tier), float(probability), float(arpu or 0.0)) for tier, probability, arpu in rows]


def portfolio_kpis(
    session: Session,
    run_id: str,
    *,
    save_rate: float | None = None,
    gross_margin: float | None = None,
) -> PortfolioKpis:
    run = get_run(session, run_id)  # 404s an unknown run rather than returning an empty portfolio
    assumptions, is_overridden = resolve_assumptions(save_rate, gross_margin)
    rows = _scored_rows(session, run.id)

    n_batches = (
        session.scalar(select(func.count()).select_from(BatchRow).where(BatchRow.run_id == run.id))
        or 0
    )
    last_scored_at = session.scalar(
        select(func.max(PredictionRow.created_at))
        .join(BatchRow, BatchRow.id == PredictionRow.batch_id)
        .where(BatchRow.run_id == run.id)
    )

    tier_counts: dict[RiskTier, int] = dict.fromkeys(RISK_TIERS, 0)
    per_tier: dict[RiskTier, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    totals: dict[str, float] = defaultdict(float)
    probability_sum = 0.0

    for tier_name, probability, arpu in rows:
        tier = cast(RiskTier, tier_name)
        money = customer_financials(
            churn_probability=probability, arpu=arpu, tier=tier, assumptions=assumptions
        )
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        probability_sum += probability
        bucket = per_tier[tier]
        bucket["probability_sum"] += probability
        for key in (
            "monthly_revenue_at_risk",
            "annual_revenue_at_risk",
            "expected_value_at_risk",
            "expected_saved",
            "campaign_cost",
        ):
            value = getattr(money, key)
            bucket[key] += value
            totals[key] += value

    n_customers = len(rows)
    campaign_cost = totals["campaign_cost"]
    expected_saved = totals["expected_saved"]

    return PortfolioKpis(
        run_id=run.id,
        n_customers=n_customers,
        n_batches=n_batches,
        mean_churn_probability=probability_sum / n_customers if n_customers else 0.0,
        tier_counts=tier_counts,
        tiers=[
            _tier_kpi(tier, tier_counts.get(tier, 0), n_customers, per_tier.get(tier))
            for tier in RISK_TIERS
        ],
        total_monthly_revenue_at_risk=totals["monthly_revenue_at_risk"],
        total_annual_revenue_at_risk=totals["annual_revenue_at_risk"],
        total_expected_value_at_risk=totals["expected_value_at_risk"],
        total_expected_saved=expected_saved,
        total_campaign_cost=campaign_cost,
        net_benefit=expected_saved - campaign_cost,
        roi=None if campaign_cost == 0 else (expected_saved - campaign_cost) / campaign_cost,
        assumptions=AssumptionsBlock.of(assumptions),
        is_overridden=is_overridden,
        last_scored_at=last_scored_at,
    )


def _tier_kpi(
    tier: RiskTier, count: int, n_customers: int, bucket: dict[str, float] | None
) -> TierKpi:
    values = bucket or {}
    return TierKpi(
        tier=tier,
        n_customers=count,
        share=count / n_customers if n_customers else 0.0,
        mean_churn_probability=values.get("probability_sum", 0.0) / count if count else 0.0,
        monthly_revenue_at_risk=values.get("monthly_revenue_at_risk", 0.0),
        expected_value_at_risk=values.get("expected_value_at_risk", 0.0),
        expected_saved=values.get("expected_saved", 0.0),
        campaign_cost=values.get("campaign_cost", 0.0),
    )
