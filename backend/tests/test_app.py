from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.exceptions import DatasetInvalid
from app.core.middleware import REQUEST_ID_HEADER


def _route_that_raises(app: FastAPI) -> None:
    @app.get("/_boom")
    async def boom() -> None:
        raise DatasetInvalid("column 'TotalCharges' is not numeric")


def test_app_factory_returns_fastapi_instance(app: FastAPI) -> None:
    assert isinstance(app, FastAPI)
    assert app.title == "CRIP API"


def test_domain_error_renders_envelope_with_mapped_status(app: FastAPI) -> None:
    _route_that_raises(app)
    client = TestClient(app)

    response = client.get("/_boom")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "dataset_invalid"
    assert body["error"]["message"] == "column 'TotalCharges' is not numeric"
    assert body["error"]["request_id"]


def test_request_id_is_echoed_and_generated_when_absent(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.headers.get(REQUEST_ID_HEADER)


def test_supplied_request_id_is_preserved(client: TestClient) -> None:
    response = client.get("/openapi.json", headers={REQUEST_ID_HEADER: "trace-123"})
    assert response.headers[REQUEST_ID_HEADER] == "trace-123"
