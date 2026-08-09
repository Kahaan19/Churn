from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.run import Run


class ModelArtifact(Base):
    __tablename__ = "model_artifact"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(ForeignKey("run.id"))
    algorithm: Mapped[str]
    params: Mapped[dict[str, object]] = mapped_column(JSON)
    artifact_path: Mapped[str]
    explainer_path: Mapped[str | None] = mapped_column(default=None)
    feature_group_map: Mapped[dict[str, str]] = mapped_column(JSON)
    metrics: Mapped[dict[str, object]] = mapped_column(JSON)
    is_best: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    run: Mapped["Run"] = relationship(back_populates="models")
