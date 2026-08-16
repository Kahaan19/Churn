import csv
import io
from pathlib import Path

from fastapi.testclient import TestClient
from pytest import approx
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_financial_assumptions
from app.jobs.runner import process_pending

FIXTURES = Path(__file__).parent / "fixtures"
TARGET_COLUMN = "Churn"


def _succeeded_run(client: TestClient, session_factory: sessionmaker[Session]) -> str:
    with (FIXTURES / "train_fixture.csv").open("rb") as f:
        dataset = client.post(
            "/api/v1/datasets", files={"file": ("train_fixture.csv", f, "text/csv")}
        )
    assert dataset.status_code == 201
    created = client.post(
        "/api/v1/runs",
        json={
            "dataset_id": dataset.json()["id"],
            "algorithms": ["logistic_regression"],
            "tune": False,
        },
    )
    assert created.status_code == 202
    process_pending(session_factory)
    return str(created.json()["id"])


def _scored_run(client: TestClient, session_factory: sessionmaker[Session]) -> str:
    """A run with a finished CSV batch behind it — the state the dashboard actually reads."""
    run_id = _succeeded_run(client, session_factory)

    with (FIXTURES / "train_fixture.csv").open(newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row.pop(TARGET_COLUMN, None)

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)

    batch = client.post(
        "/api/v1/predictions/batch",
        data={"run_id": run_id},
        files={"file": ("customers.csv", buffer.getvalue().encode(), "text/csv")},
    )
    assert batch.status_code == 202
    process_pending(session_factory)
    return run_id


def test_kpis_aggregate_every_customer_scored_against_the_run(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _scored_run(client, session_factory)

    response = client.get(f"/api/v1/runs/{run_id}/kpis")

    assert response.status_code == 200
    body = response.json()
    assert body["n_customers"] == 220
    assert body["n_batches"] == 1
    assert sum(body["tier_counts"].values()) == 220
    assert sum(tier["n_customers"] for tier in body["tiers"]) == 220
    assert body["total_annual_revenue_at_risk"] > 0
    assert body["last_scored_at"] is not None
    assert body["is_overridden"] is False


def test_kpi_totals_equal_the_sum_of_their_tiers(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _scored_run(client, session_factory)

    body = client.get(f"/api/v1/runs/{run_id}/kpis").json()

    for total_key, tier_key in (
        ("total_monthly_revenue_at_risk", "monthly_revenue_at_risk"),
        ("total_expected_value_at_risk", "expected_value_at_risk"),
        ("total_expected_saved", "expected_saved"),
        ("total_campaign_cost", "campaign_cost"),
    ):
        per_tier = sum(tier[tier_key] for tier in body["tiers"])
        assert body[total_key] == approx(per_tier, rel=1e-9), total_key


def test_net_benefit_is_expected_saved_less_campaign_cost(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _scored_run(client, session_factory)

    body = client.get(f"/api/v1/runs/{run_id}/kpis").json()

    assert body["net_benefit"] == body["total_expected_saved"] - body["total_campaign_cost"]
    assert body["roi"] == body["net_benefit"] / body["total_campaign_cost"]


def test_doubling_save_rate_doubles_expected_saved_and_leaves_revenue_at_risk_alone(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _scored_run(client, session_factory)
    base_rate = get_financial_assumptions().save_rate

    base = client.get(f"/api/v1/runs/{run_id}/kpis").json()
    doubled = client.get(f"/api/v1/runs/{run_id}/kpis", params={"save_rate": base_rate * 2}).json()

    assert doubled["total_expected_saved"] == approx_rel(base["total_expected_saved"] * 2)
    assert doubled["total_monthly_revenue_at_risk"] == approx_rel(
        base["total_monthly_revenue_at_risk"]
    )
    assert doubled["assumptions"]["save_rate"] == base_rate * 2
    assert doubled["is_overridden"] is True


def test_halving_gross_margin_halves_lifetime_value_but_not_revenue_at_risk(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _scored_run(client, session_factory)
    margin = get_financial_assumptions().gross_margin

    base = client.get(f"/api/v1/runs/{run_id}/kpis").json()
    halved = client.get(f"/api/v1/runs/{run_id}/kpis", params={"gross_margin": margin / 2}).json()

    # CLV is linear in margin, and both value-at-risk and expected-saved are linear in CLV.
    assert halved["total_expected_value_at_risk"] == approx_rel(
        base["total_expected_value_at_risk"] / 2
    )
    assert halved["total_expected_saved"] == approx_rel(base["total_expected_saved"] / 2)
    # Monthly revenue at risk is p·ARPU — margin has nothing to do with it.
    assert halved["total_monthly_revenue_at_risk"] == approx_rel(
        base["total_monthly_revenue_at_risk"]
    )


def test_out_of_range_assumptions_are_refused(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _scored_run(client, session_factory)

    assert client.get(f"/api/v1/runs/{run_id}/kpis", params={"save_rate": 1.5}).status_code == 422
    assert client.get(f"/api/v1/runs/{run_id}/kpis", params={"gross_margin": 0}).status_code == 422


def test_a_run_with_nothing_scored_yet_reports_zeroes_not_an_error(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)

    body = client.get(f"/api/v1/runs/{run_id}/kpis").json()

    assert body["n_customers"] == 0
    assert body["total_annual_revenue_at_risk"] == 0.0
    assert body["mean_churn_probability"] == 0.0
    # No campaign to buy means no return ratio — never inf, never a misleading zero.
    assert body["roi"] is None
    assert body["last_scored_at"] is None


def test_unknown_run_is_a_404(client: TestClient) -> None:
    response = client.get("/api/v1/runs/does-not-exist/kpis")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "run_not_found"


def approx_rel(value: float) -> object:
    """Money is summed over hundreds of rows; exact float equality would be a flaky test."""
    return approx(value, rel=1e-9)
