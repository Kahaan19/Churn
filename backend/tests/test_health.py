from collections.abc import Iterator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.db import get_session


def test_health_returns_ok_with_version_and_db_status(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert body["version"]


class _BrokenSession:
    def execute(self, *args: object, **kwargs: object) -> object:
        raise OperationalError("SELECT 1", {}, Exception("db down"))


def test_health_reports_db_error_when_query_fails(app: FastAPI) -> None:
    def _broken_session() -> Iterator[_BrokenSession]:
        yield _BrokenSession()

    app.dependency_overrides[get_session] = _broken_session
    try:
        response = TestClient(app).get("/health")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["db"] == "error"
