import csv
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.jobs.runner import process_pending

FIXTURES = Path(__file__).parent / "fixtures"


def _upload_trainable_dataset(client: TestClient) -> str:
    with (FIXTURES / "train_fixture.csv").open("rb") as f:
        response = client.post(
            "/api/v1/datasets", files={"file": ("train_fixture.csv", f, "text/csv")}
        )
    assert response.status_code == 201
    return str(response.json()["id"])


def _sample_customer() -> dict[str, str]:
    """One raw row from the training fixture, minus the target — what scoring actually receives."""
    with (FIXTURES / "train_fixture.csv").open(newline="") as f:
        row = next(iter(csv.DictReader(f)))
    del row["Churn"]
    return row


def _succeeded_run(client: TestClient, session_factory: sessionmaker[Session]) -> str:
    dataset_id = _upload_trainable_dataset(client)
    created = client.post(
        "/api/v1/runs",
        json={"dataset_id": dataset_id, "algorithms": ["logistic_regression"], "tune": False},
    )
    assert created.status_code == 202
    process_pending(session_factory)
    return str(created.json()["id"])


def test_create_run_for_unknown_dataset_returns_404(client: TestClient) -> None:
    response = client.post("/api/v1/runs", json={"dataset_id": "does-not-exist"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_create_run_rejects_a_dataset_with_blocking_quality_errors(client: TestClient) -> None:
    dataset_id = _upload_trainable_dataset(client)
    # No revenue column detected is one of quality.py's blocking_errors — clearing it here
    # exercises the "training refused" path without needing a dedicated bad-data fixture.
    client.patch(f"/api/v1/datasets/{dataset_id}/profile", json={"revenue_column": ""})
    quality = client.get(f"/api/v1/datasets/{dataset_id}/quality")
    assert quality.json()["blocking_errors"]

    response = client.post("/api/v1/runs", json={"dataset_id": dataset_id})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "dataset_invalid"


def test_run_lifecycle_queued_then_succeeded_via_the_job_runner(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    dataset_id = _upload_trainable_dataset(client)

    created = client.post(
        "/api/v1/runs",
        json={"dataset_id": dataset_id, "algorithms": ["logistic_regression"], "tune": False},
    )
    assert created.status_code == 202
    run_id = created.json()["id"]
    assert created.json()["status"] == "queued"

    # Calibration isn't ready yet — RunNotReady, not a 500 or a stale/empty payload.
    not_ready = client.get(f"/api/v1/runs/{run_id}/calibration")
    assert not_ready.status_code == 409

    process_pending(session_factory)

    finished = client.get(f"/api/v1/runs/{run_id}")
    assert finished.status_code == 200
    body = finished.json()
    assert body["status"] == "succeeded"
    assert len(body["models"]) == 1
    assert body["models"][0]["algorithm"] == "logistic_regression"
    assert body["models"][0]["is_best"] is True
    assert body["models"][0]["metrics"]["test"] is not None
    assert body["best_model_id"] == body["models"][0]["id"]
    assert 0.0 <= body["chosen_threshold"] <= 1.0

    calibration = client.get(f"/api/v1/runs/{run_id}/calibration")
    assert calibration.status_code == 200
    assert len(calibration.json()["points"]) > 0


def test_importance_is_unavailable_until_the_run_succeeds(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    dataset_id = _upload_trainable_dataset(client)
    run_id = client.post("/api/v1/runs", json={"dataset_id": dataset_id}).json()["id"]

    queued = client.get(f"/api/v1/runs/{run_id}/importance")

    assert queued.status_code == 409
    assert queued.json()["error"]["code"] == "run_not_ready"


def test_importance_is_ranked_and_aggregated_to_source_columns(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)

    response = client.get(f"/api/v1/runs/{run_id}/importance")

    assert response.status_code == 200
    body = response.json()
    features = body["features"]
    assert body["sample_size"] > 0
    scores = [f["importance"] for f in features]
    assert scores == sorted(scores, reverse=True)
    # Source columns, never one-hot members: no feature name carries an encoded level suffix.
    names = {f["feature"] for f in features}
    assert "Contract" in names
    assert not any(name.startswith("Contract_") for name in names)
    assert next(f for f in features if f["feature"] == "MonthlyCharges")["display_name"] == (
        "Monthly charges"
    )


def test_explain_returns_contributions_ranked_by_absolute_impact(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)

    response = client.post(f"/api/v1/runs/{run_id}/explain", json={"features": _sample_customer()})

    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["churn_probability"] <= 1.0
    contributions = body["shap_values"]
    magnitudes = [abs(c["contribution"]) for c in contributions]
    assert magnitudes == sorted(magnitudes, reverse=True)
    assert all(
        c["direction"] == ("increases_risk" if c["contribution"] >= 0 else "decreases_risk")
        for c in contributions
    )
    # The contributions explain this customer's score, not a generic one.
    reconstructed = body["base_value"] + sum(c["contribution"] for c in contributions)
    assert reconstructed != body["base_value"]


def test_explain_names_the_missing_column_when_features_are_incomplete(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    run_id = _succeeded_run(client, session_factory)
    customer = _sample_customer()
    del customer["Contract"]

    response = client.post(f"/api/v1/runs/{run_id}/explain", json={"features": customer})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "profile_mismatch"
    assert "Contract" in response.json()["error"]["message"]


def test_get_unknown_run_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/runs/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "run_not_found"


def test_list_runs_is_paginated(client: TestClient) -> None:
    dataset_id = _upload_trainable_dataset(client)
    client.post("/api/v1/runs", json={"dataset_id": dataset_id})

    response = client.get("/api/v1/runs")

    assert response.status_code == 200
    assert response.json()["total"] == 1
