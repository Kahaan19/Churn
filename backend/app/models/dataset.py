from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Dataset(Base):
    __tablename__ = "dataset"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str]
    filename: Mapped[str]
    storage_path: Mapped[str]
    n_rows: Mapped[int]
    n_cols: Mapped[int]
    column_profile: Mapped[dict[str, object]] = mapped_column(JSON)
    quality_report: Mapped[dict[str, object]] = mapped_column(JSON)
    eda_payload: Mapped[dict[str, object] | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
