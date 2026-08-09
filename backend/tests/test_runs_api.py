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
