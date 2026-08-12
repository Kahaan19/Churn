"""The finance table from DATA_CONTRACT.md, case for case.

This is the module the rest of the platform's credibility rests on: if a number on screen is wrong,
it is wrong here. Every case in the contract's table has a test below with the same name.
"""

import math

import pytest
from pydantic import ValidationError

from app.core.config import get_financial_assumptions
from app.core.exceptions import InvalidFinancialInput
from app.ml.finance import annuity_factor, assign_risk_tier, clv, customer_financials
from app.schemas.finance import FinancialAssumptions

ASSUMPTIONS = FinancialAssumptions(
    gross_margin=0.65,
    discount_rate_monthly=0.01,
    expected_tenure_months=24,
    save_rate=0.30,
    retention_cost={"low": 0.0, "medium": 15.0, "high": 45.0, "critical": 90.0},
)

BOUNDS = {
    "low": [0.0, 0.12],
    "medium": [0.12, 0.27],
    "high": [0.27, 0.55],
    "critical": [0.55, 1.0],
}


def test_zero_probability_zeroes_every_at_risk_figure() -> None:
    result = customer_financials(
        churn_probability=0.0, arpu=100.0, tier="low", assumptions=ASSUMPTIONS
    )

    assert result.monthly_revenue_at_risk == 0.0
    assert result.annual_revenue_at_risk == 0.0
    assert result.expected_value_at_risk == 0.0
    assert result.expected_saved == 0.0
    # CLV is a property of the customer, not of their risk — it survives p=0.
    assert result.clv > 0.0


def test_clv_matches_the_twenty_four_month_annuity_present_value() -> None:
    result = customer_financials(
        churn_probability=1.0, arpu=100.0, tier="critical", assumptions=ASSUMPTIONS
    )

    assert result.clv == pytest.approx(1380.82, abs=0.01)
    # At p=1 the whole lifetime value is exposed.
    assert result.expected_value_at_risk == pytest.approx(result.clv)


def test_zero_campaign_cost_yields_no_roi_rather_than_infinity() -> None:
    result = customer_financials(
        churn_probability=0.9, arpu=100.0, tier="low", assumptions=ASSUMPTIONS
    )

    assert result.campaign_cost == 0.0
    assert result.roi is None


def test_expected_saved_is_probability_times_save_rate_times_clv() -> None:
    result = customer_financials(
        churn_probability=0.8, arpu=100.0, tier="critical", assumptions=ASSUMPTIONS
    )

    assert result.expected_saved == 0.8 * 0.30 * result.clv
    assert result.campaign_cost == 90.0


@pytest.mark.parametrize("arpu", [-1.0, -0.01, float("nan"), float("inf")])
def test_negative_or_nan_arpu_is_rejected(arpu: float) -> None:
    with pytest.raises(InvalidFinancialInput, match="arpu"):
        customer_financials(churn_probability=0.5, arpu=arpu, tier="high", assumptions=ASSUMPTIONS)


def test_doubling_save_rate_doubles_expected_saved_and_leaves_risk_untouched() -> None:
    doubled = ASSUMPTIONS.model_copy(update={"save_rate": 0.60})

    base = customer_financials(
        churn_probability=0.4, arpu=70.0, tier="high", assumptions=ASSUMPTIONS
    )
    after = customer_financials(churn_probability=0.4, arpu=70.0, tier="high", assumptions=doubled)

    assert after.expected_saved == pytest.approx(2 * base.expected_saved)
    assert after.monthly_revenue_at_risk == base.monthly_revenue_at_risk
    assert after.annual_revenue_at_risk == base.annual_revenue_at_risk
    assert after.expected_value_at_risk == base.expected_value_at_risk


def test_annual_revenue_at_risk_is_twelve_monthly() -> None:
    result = customer_financials(
        churn_probability=0.5, arpu=80.0, tier="medium", assumptions=ASSUMPTIONS
    )

    assert result.monthly_revenue_at_risk == pytest.approx(40.0)
    assert result.annual_revenue_at_risk == pytest.approx(480.0)


def test_roi_is_the_return_on_the_intervention_spend() -> None:
    result = customer_financials(
        churn_probability=0.6, arpu=100.0, tier="medium", assumptions=ASSUMPTIONS
    )

    assert result.roi == pytest.approx((result.expected_saved - 15.0) / 15.0)


def test_a_zero_discount_rate_makes_clv_plain_undiscounted_margin() -> None:
    undiscounted = ASSUMPTIONS.model_copy(update={"discount_rate_monthly": 0.0})

    assert annuity_factor(0.0, 24) == pytest.approx(24.0)
    assert clv(100.0, undiscounted) == pytest.approx(100.0 * 0.65 * 24)


def test_probability_outside_the_unit_interval_is_rejected() -> None:
    with pytest.raises(InvalidFinancialInput, match="churn_probability"):
        customer_financials(churn_probability=1.5, arpu=50.0, tier="low", assumptions=ASSUMPTIONS)
    with pytest.raises(InvalidFinancialInput, match="churn_probability"):
        customer_financials(
            churn_probability=math.nan, arpu=50.0, tier="low", assumptions=ASSUMPTIONS
        )


@pytest.mark.parametrize(
    ("probability", "expected"),
    [
        (0.0, "low"),
        (0.11, "low"),
        (0.12, "medium"),
        (0.26, "medium"),
        (0.27, "high"),
        (0.54, "high"),
        (0.55, "critical"),
        (1.0, "critical"),
    ],
)
def test_risk_tier_bands_are_read_from_the_runs_own_bounds(
    probability: float, expected: str
) -> None:
    assert assign_risk_tier(probability, BOUNDS) == expected


def test_a_degenerate_band_still_resolves_to_a_tier() -> None:
    # A flat probability distribution collapses the quantiles onto each other; every customer is
    # then "critical", but nothing may crash or fall through to no tier at all.
    flat = {"low": [0.0, 0.3], "medium": [0.3, 0.3], "high": [0.3, 0.3], "critical": [0.3, 1.0]}

    assert assign_risk_tier(0.3, flat) == "critical"
    assert assign_risk_tier(0.2, flat) == "low"


def test_bounds_missing_a_tier_are_rejected() -> None:
    with pytest.raises(InvalidFinancialInput, match="critical"):
        assign_risk_tier(0.9, {"low": [0.0, 0.5]})


def test_assumptions_must_price_every_risk_tier() -> None:
    with pytest.raises(ValidationError, match="critical"):
        FinancialAssumptions(
            gross_margin=0.65,
            discount_rate_monthly=0.01,
            expected_tenure_months=24,
            save_rate=0.30,
            retention_cost={"low": 0.0, "medium": 15.0, "high": 45.0},
        )


def test_out_of_range_assumptions_are_rejected() -> None:
    with pytest.raises(ValidationError):
        FinancialAssumptions.model_validate({**ASSUMPTIONS.model_dump(), "gross_margin": 1.4})
    with pytest.raises(ValidationError):
        FinancialAssumptions.model_validate({**ASSUMPTIONS.model_dump(), "save_rate": -0.1})
    with pytest.raises(ValidationError):
        FinancialAssumptions.model_validate(
            {**ASSUMPTIONS.model_dump(), "expected_tenure_months": 0}
        )


def test_shipped_config_file_loads_and_matches_the_documented_defaults() -> None:
    get_financial_assumptions.cache_clear()
    loaded = get_financial_assumptions()

    assert loaded.gross_margin == 0.65
    assert loaded.save_rate == 0.30
    assert loaded.expected_tenure_months == 24
    assert loaded.retention_cost == {"low": 0.0, "medium": 15.0, "high": 45.0, "critical": 90.0}


def test_assumptions_travel_with_the_figures_they_produced() -> None:
    result = customer_financials(
        churn_probability=0.5, arpu=90.0, tier="high", assumptions=ASSUMPTIONS
    )

    assert result.assumptions.save_rate == 0.30
    assert result.assumptions.gross_margin == 0.65
    assert result.assumptions.horizon_months == 24
    assert result.assumptions.discount_rate_monthly == 0.01
