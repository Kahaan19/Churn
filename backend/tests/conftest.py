from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.db import get_session
from app.main import create_app
from app.models.base import Base


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    # In-memory SQLite per test, per CONVENTIONS.md, overriding the module-level engine that
    # get_session would otherwise use. Exposed as its own fixture (rather than nested inside
    # `app`) so tests can also drive app.jobs.runner.process_pending against the same DB the
    # test client talks to.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def app(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, session_factory: sessionmaker[Session]
) -> Iterator[FastAPI]:
    # Isolated upload/artifacts dirs per test — service code reads settings directly, not via
    # a FastAPI dependency, so the env var + cache_clear round trip is required.
    monkeypatch.setenv("CRIP_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("CRIP_ARTIFACTS_DIR", str(tmp_path / "artifacts"))
    # The real background thread would race the in-memory test DB below; tests drive the job
    # queue deterministically via jobs.runner.process_pending instead.
    monkeypatch.setenv("CRIP_JOB_RUNNER_ENABLED", "false")
    get_settings.cache_clear()

    application = create_app()

    def _get_test_session() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    application.dependency_overrides[get_session] = _get_test_session

    yield application

    application.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
