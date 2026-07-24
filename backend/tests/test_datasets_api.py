from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings

FIXTURES = Path(__file__).parent / "fixtures"


def _upload(client: TestClient, fixture_name: str) -> dict:
    with (FIXTURES / fixture_name).open("rb") as f:
        response = client.post("/api/v1/datasets", files={"file": (fixture_name, f, "text/csv")})
    return response


def test_upload_valid_csv_returns_dataset_with_inferred_profile(client: TestClient) -> None:
    response = _upload(client, "valid_sample.csv")

    assert response.status_code == 201
    body = response.json()
    assert body["n_rows"] == 60
    assert body["column_profile"]["target_column"] == "Churn"
    assert body["column_profile"]["id_column"] == "customerID"


def test_upload_malformed_csv_returns_422_not_a_stack_trace(client: TestClient) -> None:
    response = _upload(client, "malformed.csv")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "dataset_invalid"


def test_upload_over_the_size_cap_returns_413(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CRIP_MAX_UPLOAD_MB", "0")
    get_settings.cache_clear()

    response = _upload(client, "valid_sample.csv")

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "dataset_too_large"


def test_load_sample_dataset_runs_the_bundled_csv_through_ingestion(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CRIP_SAMPLE_DATASET_PATH", str(FIXTURES / "valid_sample.csv"))
    get_settings.cache_clear()

    response = client.post("/api/v1/datasets/sample")

    assert response.status_code == 201
    assert response.json()["n_rows"] == 60


def test_get_unknown_dataset_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/datasets/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "dataset_not_found"


def test_list_get_patch_delete_round_trip(client: TestClient) -> None:
    dataset_id = _upload(client, "valid_sample.csv").json()["id"]

    listed = client.get("/api/v1/datasets")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    fetched = client.get(f"/api/v1/datasets/{dataset_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == dataset_id

    patched = client.patch(
        f"/api/v1/datasets/{dataset_id}/profile", json={"revenue_column": "tenure"}
    )
    assert patched.status_code == 200
    assert patched.json()["column_profile"]["revenue_column"] == "tenure"

    deleted = client.delete(f"/api/v1/datasets/{dataset_id}")
    assert deleted.status_code == 204

    assert client.get(f"/api/v1/datasets/{dataset_id}").status_code == 404


def test_quality_report_surfaces_blank_total_charges_and_class_imbalance(
    client: TestClient,
) -> None:
    dataset_id = _upload(client, "blank_numerics.csv").json()["id"]

    response = client.get(f"/api/v1/datasets/{dataset_id}/quality")

    assert response.status_code == 200
    body = response.json()
    total_charges_issue = next(i for i in body["type_issues"] if i["column"] == "TotalCharges")
    assert total_charges_issue["n_bad"] == 3
    assert body["class_balance"]["positive_rate"] < 0.35


def test_eda_is_computed_once_and_then_cached(client: TestClient) -> None:
    dataset_id = _upload(client, "valid_sample.csv").json()["id"]

    first = client.get(f"/api/v1/datasets/{dataset_id}/eda")
    second = client.get(f"/api/v1/datasets/{dataset_id}/eda")

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert sum(first.json()["target_distribution"]["counts"]) == 60
