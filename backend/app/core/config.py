import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# backend/app/core/config.py -> backend/app/core -> backend/app -> backend -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]


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
