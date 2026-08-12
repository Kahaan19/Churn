import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated

import yaml
from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.schemas.finance import FinancialAssumptions

# backend/app/core/config.py -> backend/app/core -> backend/app -> backend -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ROOT = _REPO_ROOT / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CRIP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "development"
    version: str = "0.1.0"
    database_url: str = "sqlite:///./crip.db"
    log_level: str = "INFO"
    # NoDecode: skip pydantic-settings' default JSON-decode of env vars for
    # list fields, since CRIP_CORS_ORIGINS arrives as a comma-separated string,
    # not a JSON array.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    upload_dir: str = str(_REPO_ROOT / "data" / "uploads")
    max_upload_mb: int = 50
    # Bundled reference dataset for the "load sample dataset" flow. Overridden in
    # docker-compose, where data/ is bind-mounted at a different container path.
    sample_dataset_path: str = str(_REPO_ROOT / "data" / "telco.csv")

    artifacts_dir: str = str(_REPO_ROOT / "artifacts")
    financial_config_path: str = str(_BACKEND_ROOT / "config" / "financial.yaml")
    # Disabled in tests so API tests drive the job queue synchronously via
    # jobs.runner.process_pending instead of racing a real background thread.
    job_runner_enabled: bool = True
    job_runner_poll_seconds: float = 1.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            if value.strip().startswith("["):
                return json.loads(value)
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_financial_assumptions() -> FinancialAssumptions:
    """Read and validate `config/financial.yaml` once per process.

    This is the *only* place the file is read. `ml/finance.py` never touches it — the assumptions
    arrive as an argument, which is what keeps the financial math a set of pure functions.
    """
    path = Path(get_settings().financial_config_path)
    if not path.exists():
        raise FileNotFoundError(f"Financial assumptions config not found at '{path}'.")
    return FinancialAssumptions.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
