from datetime import datetime

from pydantic import BaseModel


class ColumnProfile(BaseModel):
    id_column: str | None
    target_column: str
    revenue_column: str
    tenure_column: str | None
    numeric: list[str]
    categorical_low: list[str]
    categorical_high: list[str]
    dropped: list[str]


class ColumnProfileUpdate(BaseModel):
    """PATCH body — every field optional, only supplied ones are overridden."""

    id_column: str | None = None
    target_column: str | None = None
    revenue_column: str | None = None
    tenure_column: str | None = None
    numeric: list[str] | None = None
    categorical_low: list[str] | None = None
    categorical_high: list[str] | None = None
    dropped: list[str] | None = None


class Dataset(BaseModel):
    id: str
    name: str
    filename: str
    n_rows: int
    n_cols: int
    column_profile: ColumnProfile
    created_at: datetime

    model_config = {"from_attributes": True}
