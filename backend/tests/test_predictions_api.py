import csv
import io
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.orm import Session, sessionmaker

from app.jobs.runner import process_pending
from app.models.prediction import PredictionBatch

FIXTURES = Path(__file__).parent / "fixtures"
TARGET_COLUMN = "Churn"


def _upload_trainable_dataset(client: TestClient) -> str:
    with (FIXTURES / "train_fixture.csv").open("rb") as f:
        response = client.post(
            "/api/v1/datasets", files={"file": ("train_fixture.csv", f, "text/csv")}
        )
    assert response.status_code == 201
    return str(response.json()["id"])


def _succeeded_run(client: TestClient, session_factory: sessionmaker[Session]) -> str:
    dataset_id = _upload_trainable_dataset(client)
    created = client.post(
        "/api/v1/runs",
        json={"dataset_id": dataset_id, "algorithms": ["logistic_regression"], "tune": False},
    )
    assert created.status_code == 202
    process_pending(session_factory)
    return str(created.json()["id"])


def _customer_rows() -> list[dict[str, str]]:
    """Raw rows from the training fixture with the target removed — what scoring receives."""
    with (FIXTURES / "train_fixture.csv").open(newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row.pop(TARGET_COLUMN, None)
    return rows


def _scoring_csv(rows: list[dict[str, str]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode()


def _post_batch(client: TestClient, run_id: str, payload: bytes) -> Response:
    return client.post(
        "/api/v1/predictions/batch",
        data={"run_id": run_id},
        files={"file": ("customers.csv", payload, "text/csv")},
    )


# ------------------------------------------------------------------------------------------
# Single scoring
# ------------------------------------------------------------------------------------------


def test_single_prediction_returns_probability_tier_shap_and_financials(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    customer = _customer_rows()[0]

    response = client.post(
        "/api/v1/predictions/single", json={"run_id": run_id, "features": customer}
    )

    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["churn_probability"] <= 1.0
    assert body["risk_tier"] in {"low", "medium", "high", "critical"}
    assert body["customer_ref"] == customer["customerID"]

    contributions = body["shap_values"]["values"]
    magnitudes = [abs(c["contribution"]) for c in contributions]
    assert magnitudes == sorted(magnitudes, reverse=True)

    financials = body["financials"]
    arpu = float(customer["MonthlyCharges"])
    assert financials["arpu"] == arpu
    assert financials["monthly_revenue_at_risk"] == body["churn_probability"] * arpu
    assert financials["annual_revenue_at_risk"] == financials["monthly_revenue_at_risk"] * 12
    assert financials["expected_value_at_risk"] == body["churn_probability"] * financials["clv"]
    # The assumptions ride along with the figures they produced — no number without its basis.
    assert financials["assumptions"]["save_rate"] == 0.30
    assert financials["assumptions"]["horizon_months"] == 24


def test_single_prediction_is_retrievable_by_id(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    created = client.post(
        "/api/v1/predictions/single", json={"run_id": run_id, "features": _customer_rows()[0]}
    ).json()

    response = client.get(f"/api/v1/predictions/{created['id']}")

    assert response.status_code == 200
    assert response.json()["churn_probability"] == created["churn_probability"]
    assert response.json()["run_id"] == run_id


def test_single_prediction_names_the_missing_column(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    customer = _customer_rows()[0]
    del customer["Contract"]

    response = client.post(
        "/api/v1/predictions/single", json={"run_id": run_id, "features": customer}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "profile_mismatch"
    assert "Contract" in response.json()["error"]["message"]


def test_scoring_against_an_unfinished_run_is_refused(client: TestClient) -> None:
    dataset_id = _upload_trainable_dataset(client)
    run_id = client.post("/api/v1/runs", json={"dataset_id": dataset_id}).json()["id"]

    response = client.post(
        "/api/v1/predictions/single", json={"run_id": run_id, "features": _customer_rows()[0]}
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "run_not_ready"


# ------------------------------------------------------------------------------------------
# Batch scoring
# ------------------------------------------------------------------------------------------


def test_batch_is_queued_then_scored_by_the_job_runner(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    rows = _customer_rows()

    created = _post_batch(client, run_id, _scoring_csv(rows))
    assert created.status_code == 202
    batch_id = created.json()["id"]
    assert created.json()["status"] == "queued"
    assert created.json()["summary"] is None

    process_pending(session_factory)

    finished = client.get(f"/api/v1/predictions/batch/{batch_id}")
    assert finished.status_code == 200
    body = finished.json()
    assert body["status"] == "succeeded"
    assert body["n_rows"] == len(rows)

    summary = body["summary"]
    assert summary["n_scored"] == len(rows)
    assert sum(summary["tier_counts"].values()) == len(rows)
    assert summary["total_monthly_revenue_at_risk"] > 0
    assert summary["total_annual_revenue_at_risk"] == pytest.approx(
        summary["total_monthly_revenue_at_risk"] * 12
    )
    assert summary["assumptions"]["gross_margin"] == 0.65


def test_batch_items_are_ranked_by_expected_value_at_risk_by_default(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    batch_id = _post_batch(client, run_id, _scoring_csv(_customer_rows())).json()["id"]
    process_pending(session_factory)

    response = client.get(f"/api/v1/predictions/batch/{batch_id}/items?limit=50")

    assert response.status_code == 200
    values = [item["expected_value_at_risk"] for item in response.json()["items"]]
    assert values == sorted(values, reverse=True)
    # Ranking by money is not the same as ranking by probability — that's the point of the list.
    probabilities = [item["churn_probability"] for item in response.json()["items"]]
    assert probabilities != sorted(probabilities, reverse=True)


def test_batch_items_can_be_sorted_by_probability_instead(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    batch_id = _post_batch(client, run_id, _scoring_csv(_customer_rows())).json()["id"]
    process_pending(session_factory)

    response = client.get(
        f"/api/v1/predictions/batch/{batch_id}/items?sort=churn_probability&limit=50"
    )

    probabilities = [item["churn_probability"] for item in response.json()["items"]]
    assert probabilities == sorted(probabilities, reverse=True)


def test_batch_items_are_filterable_by_risk_tier(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    batch_id = _post_batch(client, run_id, _scoring_csv(_customer_rows())).json()["id"]
    process_pending(session_factory)

    unfiltered = client.get(f"/api/v1/predictions/batch/{batch_id}/items?limit=200").json()
    response = client.get(f"/api/v1/predictions/batch/{batch_id}/items?risk_tier=critical")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] > 0
    assert body["total"] < unfiltered["total"]
    assert all(item["risk_tier"] == "critical" for item in body["items"])


def test_a_csv_missing_a_required_column_is_rejected_naming_that_column(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    rows = [{k: v for k, v in row.items() if k != "Contract"} for row in _customer_rows()]

    response = _post_batch(client, run_id, _scoring_csv(rows))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "profile_mismatch"
    assert "Contract" in response.json()["error"]["message"]
    # Rejected synchronously: nothing was queued for a job runner to choke on later.
    assert client.get("/api/v1/predictions/batch").json()["total"] == 0


def test_a_csv_with_unusable_revenue_is_rejected_before_any_row_is_scored(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    rows = _customer_rows()
    rows[3]["MonthlyCharges"] = ""

    response = _post_batch(client, run_id, _scoring_csv(rows))

    assert response.status_code == 422
    message = response.json()["error"]["message"]
    assert "MonthlyCharges" in message
    # Spreadsheet line number, not a zero-based dataframe index.
    assert "5" in message


def test_a_thousand_rows_score_in_under_ten_seconds(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    source = _customer_rows()
    rows = [dict(source[i % len(source)]) for i in range(1000)]
    for index, row in enumerate(rows):
        row["customerID"] = f"CUST-{index:05d}"

    batch_id = _post_batch(client, run_id, _scoring_csv(rows)).json()["id"]

    start = time.monotonic()
    process_pending(session_factory)
    elapsed = time.monotonic() - start

    assert elapsed < 10
    body = client.get(f"/api/v1/predictions/batch/{batch_id}").json()
    assert body["status"] == "succeeded"
    assert body["summary"]["n_scored"] == 1000


def test_a_failed_scoring_job_marks_the_batch_not_the_run(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    batch_id = _post_batch(client, run_id, _scoring_csv(_customer_rows())).json()["id"]

    # Delete the stored CSV out from under the queued job: the scoring fails, but the trained
    # model is untouched and the run must stay usable.
    with session_factory() as session:
        batch = session.get(PredictionBatch, batch_id)
        assert batch is not None and batch.storage_path is not None
        Path(batch.storage_path).unlink()

    process_pending(session_factory)

    failed = client.get(f"/api/v1/predictions/batch/{batch_id}").json()
    assert failed["status"] == "failed"
    assert failed["error_message"]
    assert client.get(f"/api/v1/runs/{run_id}").json()["status"] == "succeeded"


def test_unknown_batch_and_prediction_ids_return_404(client: TestClient) -> None:
    assert client.get("/api/v1/predictions/batch/nope").status_code == 404
    assert client.get("/api/v1/predictions/batch/nope/items").status_code == 404
    assert client.get("/api/v1/predictions/nope").status_code == 404
    assert client.get("/api/v1/predictions/nope").json()["error"]["code"] == (
        "prediction_not_found"
    )
