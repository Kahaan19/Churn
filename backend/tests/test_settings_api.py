from fastapi.testclient import TestClient

from app.core.config import get_financial_assumptions
from app.schemas.finance import RISK_TIERS


def test_settings_report_the_assumptions_behind_every_currency_figure(
    client: TestClient,
) -> None:
    configured = get_financial_assumptions()

    response = client.get("/api/v1/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["save_rate"] == configured.save_rate
    assert body["gross_margin"] == configured.gross_margin
    assert body["discount_rate_monthly"] == configured.discount_rate_monthly
    assert body["expected_tenure_months"] == configured.expected_tenure_months


def test_settings_price_every_risk_tier(client: TestClient) -> None:
    # A tier with no price would render a campaign cost the UI cannot explain.
    body = client.get("/api/v1/settings").json()

    assert set(body["retention_cost"]) == set(RISK_TIERS)
    assert all(cost >= 0 for cost in body["retention_cost"].values())


def test_settings_name_the_file_that_changes_them(client: TestClient) -> None:
    body = client.get("/api/v1/settings").json()

    assert body["config_path"].endswith("financial.yaml")


def test_settings_are_read_only(client: TestClient) -> None:
    # Editing would give two customers scored minutes apart different assumptions with no record.
    assert client.put("/api/v1/settings", json={"save_rate": 0.9}).status_code == 405
    assert client.post("/api/v1/settings", json={"save_rate": 0.9}).status_code == 405
