from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.model_artifact import ModelArtifact


class Run(Base):
    __tablename__ = "run"
    __table_args__ = (Index("ix_run_dataset_id_created_at", "dataset_id", "created_at"),)

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid4()))
    dataset_id: Mapped[str] = mapped_column(ForeignKey("dataset.id"))
    status: Mapped[str] = mapped_column(default="queued")
    config: Mapped[dict[str, object]] = mapped_column(JSON)
    best_model_id: Mapped[str | None] = mapped_column(default=None)
    chosen_threshold: Mapped[float | None] = mapped_column(default=None)
    risk_tier_bounds: Mapped[dict[str, object] | None] = mapped_column(JSON, default=None)
    global_importance: Mapped[dict[str, object] | None] = mapped_column(JSON, default=None)
    calibration_curve: Mapped[dict[str, object] | None] = mapped_column(JSON, default=None)
    segment_artifact_path: Mapped[str | None] = mapped_column(default=None)
    error_message: Mapped[str | None] = mapped_column(default=None)
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    finished_at: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    models: Mapped[list["ModelArtifact"]] = relationship(
        back_populates="run", order_by="ModelArtifact.created_at"
    )
