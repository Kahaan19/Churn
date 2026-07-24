from app.core.config import Settings


def test_cors_origins_defaults_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("CRIP_CORS_ORIGINS", raising=False)
    assert Settings().cors_origins == ["http://localhost:3000"]


def test_cors_origins_parses_single_plain_url(monkeypatch) -> None:
    # Regression: pydantic-settings JSON-decodes env vars for list fields by
    # default, which raises on a bare URL. NoDecode + a before-validator must
    # handle this without an env_file present (as in the Docker container).
    monkeypatch.setenv("CRIP_CORS_ORIGINS", "http://localhost:3000")
    assert Settings().cors_origins == ["http://localhost:3000"]


def test_cors_origins_parses_comma_separated_list(monkeypatch) -> None:
    monkeypatch.setenv("CRIP_CORS_ORIGINS", "http://a.com,http://b.com")
    assert Settings().cors_origins == ["http://a.com", "http://b.com"]


def test_cors_origins_parses_json_array(monkeypatch) -> None:
    monkeypatch.setenv("CRIP_CORS_ORIGINS", '["http://a.com", "http://b.com"]')
    assert Settings().cors_origins == ["http://a.com", "http://b.com"]
