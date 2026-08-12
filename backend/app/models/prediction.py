from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.run import Run


class PredictionBatch(Base):
    """One scoring request — a single customer typed into the form, or an uploaded CSV.

    Single predictions get a batch row too (`source="single"`, `n_rows=1`) rather than a nullable
    `batch_id` on `prediction`: one storage shape means one read path for the customer list, the
    detail drawer, and Phase 8's export.
    """

    __tablename__ = "prediction_batch"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(ForeignKey("run.id"))
    source: Mapped[str]  # single | csv
    filename: Mapped[str | None] = mapped_column(default=None)
    storage_path: Mapped[str | None] = mapped_column(default=None)
    n_rows: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(default="queued")
    error_message: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    run: Mapped["Run"] = relationship()


class Prediction(Base):
    __tablename__ = "prediction"
    __table_args__ = (
        # The customer list is always "riskiest first" — never an unordered scan.
        Index(
            "ix_prediction_batch_id_churn_probability",
            "batch_id",
            "churn_probability",
            postgresql_ops={"churn_probability": "DESC"},
        ),
    )

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid4()))
    batch_id: Mapped[str] = mapped_column(ForeignKey("prediction_batch.id"))
    customer_ref: Mapped[str | None] = mapped_column(default=None)
    features: Mapped[dict[str, object]] = mapped_column(JSON)
    churn_probability: Mapped[float]
    risk_tier: Mapped[str]
    shap_values: Mapped[dict[str, object]] = mapped_column(JSON)
    financials: Mapped[dict[str, object]] = mapped_column(JSON)
    segment_label: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
