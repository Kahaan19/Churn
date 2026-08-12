"""Scoring: turn customer rows into a probability, a risk tier, an explanation, and money.

Every figure on a `Prediction` is produced by `ml.finance`, from the calibrated probability and the
run's own tier bounds. Nothing here estimates a number itself.
"""

import math
from dataclasses import dataclass
from pathlib import Path
from typing import cast
from uuid import uuid4

import numpy as np
import pandas as pd
from fastapi import UploadFile
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.config import get_financial_assumptions, get_settings
from app.core.exceptions import PredictionNotFound, ProfileMismatch
from app.ml.finance import assign_risk_tier, customer_financials
from app.models.job import Job
from app.models.prediction import Prediction as PredictionRow
from app.models.prediction import PredictionBatch as BatchRow
from app.schemas.finance import RISK_TIERS, AssumptionsBlock, CustomerFinancials, RiskTier
from app.schemas.prediction import (
    BatchSource,
    BatchStatus,
    BatchSummary,
    Prediction,
    PredictionBatch,
    PredictionListItem,
    PredictionShap,
    SortKey,
)
from app.services import csv_io
from app.services.explain import ScoringBundle, load_scoring_bundle


def _batch_dir() -> Path:
    path = Path(get_settings().upload_dir) / "batches"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _json_safe(value: object) -> object:
    """Make one cell storable as JSON. NaN becomes null — it is missingness, not a number."""
    if value is None:
        return None
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, bool | int | float | str):
        return value
    return str(value)


def _row_features(row: pd.Series) -> dict[str, object]:
    return {str(key): _json_safe(value) for key, value in row.items()}


# --------------------------------------------------------------------------------------------
# Input validation
# --------------------------------------------------------------------------------------------


def validate_scoring_frame(bundle: ScoringBundle, frame: pd.DataFrame) -> None:
    """Check an uploaded frame against the run's ColumnProfile before any scoring starts.

    Failing here means a 422 the user can act on ("you are missing Contract, PaymentMethod")
    rather than a background job that dies half way through with a stack trace.
    """
    columns = [str(c) for c in frame.columns]
    missing = bundle.missing_columns(columns)
    if missing:
        known = {
            *bundle.explainer.source_columns,
            *bundle.profile.dropped,
            bundle.profile.target_column,
            *([bundle.profile.id_column] if bundle.profile.id_column else []),
        }
        extra = sorted(c for c in columns if c not in known)
        message = (
            f"This file doesn't match the data run '{bundle.run.id}' was trained on. "
            f"Missing required column(s): {', '.join(missing)}."
        )
        if extra:
            message += f" Unrecognised column(s), which will be ignored: {', '.join(extra)}."
        raise ProfileMismatch(message)

    _validate_revenue(bundle, frame)


def _validate_revenue(bundle: ScoringBundle, frame: pd.DataFrame) -> None:
    """The revenue column feeds every currency figure, so an unusable value is fatal, not a NaN.

    Caught up front so a whole batch is rejected with the offending row numbers rather than
    silently scoring some customers at zero revenue.
    """
    column = bundle.profile.revenue_column
    values = pd.to_numeric(frame[column], errors="coerce")
    bad = frame.index[values.isna() | (values < 0)].tolist()
    if not bad:
        return
    # +2: 1-based, plus the header row, so the number matches what a spreadsheet shows.
    rows = ", ".join(str(int(i) + 2) for i in bad[:5])
    suffix = f" and {len(bad) - 5} more" if len(bad) > 5 else ""
    raise ProfileMismatch(
        f"Column '{column}' supplies the revenue behind every financial figure, but {len(bad)} "
        f"row(s) have a missing or negative value — line(s) {rows}{suffix}. Fix those rows and "
        "upload again."
    )


# --------------------------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------------------------


@dataclass
class ScoredCustomer:
    customer_ref: str | None
    features: dict[str, object]
    churn_probability: float
    risk_tier: RiskTier
    shap: PredictionShap
    financials: CustomerFinancials


def score_frame(bundle: ScoringBundle, frame: pd.DataFrame) -> list[ScoredCustomer]:
    """Score a whole frame in one pass.

    Vectorised on purpose: `predict_proba` and the SHAP call are each one invocation for the entire
    batch, which is the difference between the 1,000-row target of <10s and several minutes.
    """
    assumptions = get_financial_assumptions()
    bounds = cast(dict[str, list[float]], bundle.run.risk_tier_bounds or {})
    revenue_column = bundle.profile.revenue_column
    id_column = bundle.profile.id_column

    probabilities = bundle.predict_proba(frame)
    explanations = bundle.explainer.explain(frame)
    revenue = pd.to_numeric(frame[revenue_column], errors="coerce")

    scored: list[ScoredCustomer] = []
    for position, (_, row) in enumerate(frame.iterrows()):
        probability = probabilities[position]
        tier = assign_risk_tier(probability, bounds)
        reference = row.get(id_column) if id_column and id_column in frame.columns else None
        scored.append(
            ScoredCustomer(
                customer_ref=None if reference is None else str(reference),
                features=_row_features(row),
                churn_probability=probability,
                risk_tier=tier,
                shap=PredictionShap(
                    base_value=bundle.explainer.base_value,
                    output_space=bundle.explainer.output_space,
                    values=explanations[position],
                ),
                financials=customer_financials(
                    churn_probability=probability,
                    arpu=float(revenue.iloc[position]),
                    tier=tier,
                    assumptions=assumptions,
                ),
            )
        )
    return scored


def _persist(session: Session, batch_id: str, scored: list[ScoredCustomer]) -> list[PredictionRow]:
    rows = [
        PredictionRow(
            batch_id=batch_id,
            customer_ref=customer.customer_ref,
            features=customer.features,
            churn_probability=customer.churn_probability,
            risk_tier=customer.risk_tier,
            shap_values=customer.shap.model_dump(mode="json"),
            financials=customer.financials.model_dump(mode="json"),
        )
        for customer in scored
    ]
    session.add_all(rows)
    return rows


# --------------------------------------------------------------------------------------------
# Single prediction
# --------------------------------------------------------------------------------------------


def score_single(session: Session, run_id: str, features: dict[str, object]) -> Prediction:
    bundle = load_scoring_bundle(session, run_id)
    frame = pd.DataFrame([features])
    validate_scoring_frame(bundle, frame)

    batch = BatchRow(
        run_id=bundle.run.id, source="single", n_rows=1, status="succeeded", filename=None
    )
    session.add(batch)
    session.flush()

    row = _persist(session, batch.id, score_frame(bundle, frame))[0]
    session.commit()
    session.refresh(row)
    return _to_prediction(row, bundle.run.id)


# --------------------------------------------------------------------------------------------
# Batch prediction
# --------------------------------------------------------------------------------------------


async def create_csv_batch(session: Session, run_id: str, upload: UploadFile) -> PredictionBatch:
    """Accept and validate a CSV, then queue the scoring job.

    Validation is synchronous so the caller learns about a bad file from the upload request itself;
    only the scoring, which is the slow part, is deferred to the job runner.
    """
    bundle = load_scoring_bundle(session, run_id)

    batch_id = str(uuid4())
    dest = _batch_dir() / f"{batch_id}.csv"
    await csv_io.stream_upload_to_disk(upload, dest, get_settings().max_upload_mb * 1024 * 1024)

    try:
        frame = csv_io.read_csv(dest)
        validate_scoring_frame(bundle, frame)
    except Exception:
        dest.unlink(missing_ok=True)
        raise

    batch = BatchRow(
        id=batch_id,
        run_id=bundle.run.id,
        source="csv",
        filename=upload.filename or "upload.csv",
        storage_path=str(dest),
        n_rows=len(frame),
        status="queued",
    )
    session.add(batch)
    session.add(Job(kind="score", run_id=bundle.run.id, payload={"batch_id": batch_id}))
    session.commit()
    session.refresh(batch)
    return _to_batch(session, batch)


def run_scoring_batch(session: Session, batch_id: str) -> None:
    """Job-runner entry point. Raises on failure; the runner records it on the batch."""
    batch = session.get(BatchRow, batch_id)
    if batch is None:
        raise ValueError(f"Prediction batch '{batch_id}' not found.")
    if not batch.storage_path:
        raise ValueError(f"Prediction batch '{batch_id}' has no stored CSV to score.")

    batch.status = "running"
    session.add(batch)
    session.commit()

    bundle = load_scoring_bundle(session, batch.run_id)
    frame = csv_io.read_csv(Path(batch.storage_path))
    validate_scoring_frame(bundle, frame)

    _persist(session, batch.id, score_frame(bundle, frame))
    batch.status = "succeeded"
    batch.n_rows = len(frame)
    session.add(batch)
    session.commit()


def mark_batch_failed(session: Session, batch_id: str, message: str) -> None:
    batch = session.get(BatchRow, batch_id)
    if batch is None:
        return
    batch.status = "failed"
    batch.error_message = message
    session.add(batch)
    session.commit()


# --------------------------------------------------------------------------------------------
# Reads
# --------------------------------------------------------------------------------------------


def _to_prediction(row: PredictionRow, run_id: str) -> Prediction:
    return Prediction(
        id=row.id,
        batch_id=row.batch_id,
        run_id=run_id,
        customer_ref=row.customer_ref,
        features=row.features,
        churn_probability=row.churn_probability,
        risk_tier=cast(RiskTier, row.risk_tier),
        shap_values=PredictionShap.model_validate(row.shap_values),
        financials=CustomerFinancials.model_validate(row.financials),
        segment_label=row.segment_label,
        created_at=row.created_at,
    )


def get_batch_row(session: Session, batch_id: str) -> BatchRow:
    batch = session.get(BatchRow, batch_id)
    if batch is None:
        raise PredictionNotFound(f"No prediction batch with id '{batch_id}'.")
    return batch


def get_batch(session: Session, batch_id: str) -> PredictionBatch:
    return _to_batch(session, get_batch_row(session, batch_id))


def _to_batch(session: Session, batch: BatchRow) -> PredictionBatch:
    return PredictionBatch(
        id=batch.id,
        run_id=batch.run_id,
        source=cast(BatchSource, batch.source),
        filename=batch.filename,
        n_rows=batch.n_rows,
        status=cast(BatchStatus, batch.status),
        error_message=batch.error_message,
        created_at=batch.created_at,
        summary=summarise_batch(session, batch.id) if batch.status == "succeeded" else None,
    )


def summarise_batch(session: Session, batch_id: str) -> BatchSummary:
    """Portfolio totals for one batch.

    Only the three columns the aggregate needs are selected — `shap_values` is by far the largest
    field on the row and summing money never touches it.
    """
    rows = session.execute(
        select(
            PredictionRow.risk_tier, PredictionRow.churn_probability, PredictionRow.financials
        ).where(PredictionRow.batch_id == batch_id)
    ).all()

    assumptions = get_financial_assumptions()
    tier_counts: dict[RiskTier, int] = dict.fromkeys(RISK_TIERS, 0)
    totals = dict.fromkeys(
        (
            "monthly_revenue_at_risk",
            "annual_revenue_at_risk",
            "expected_value_at_risk",
            "expected_saved",
            "campaign_cost",
        ),
        0.0,
    )
    probability_sum = 0.0

    for tier, probability, financials in rows:
        if tier in tier_counts:
            tier_counts[cast(RiskTier, tier)] += 1
        probability_sum += float(probability)
        for key in totals:
            totals[key] += float(financials.get(key) or 0.0)

    return BatchSummary(
        n_scored=len(rows),
        tier_counts=tier_counts,
        mean_churn_probability=probability_sum / len(rows) if rows else 0.0,
        total_monthly_revenue_at_risk=totals["monthly_revenue_at_risk"],
        total_annual_revenue_at_risk=totals["annual_revenue_at_risk"],
        total_expected_value_at_risk=totals["expected_value_at_risk"],
        total_expected_saved=totals["expected_saved"],
        total_campaign_cost=totals["campaign_cost"],
        assumptions=AssumptionsBlock.of(assumptions),
    )


def _order_by(
    statement: Select[tuple[PredictionRow]], sort: SortKey
) -> Select[tuple[PredictionRow]]:
    if sort == "churn_probability":
        return statement.order_by(PredictionRow.churn_probability.desc())
    # SQLAlchemy renders JSON path indexing per dialect (json_extract on SQLite, ->> on Postgres),
    # so the money sorts stay in the database instead of paging every row into Python.
    return statement.order_by(PredictionRow.financials[sort].as_float().desc())


def list_batch_items(
    session: Session,
    batch_id: str,
    *,
    risk_tier: RiskTier | None = None,
    segment: str | None = None,
    sort: SortKey = "expected_value_at_risk",
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PredictionListItem], int]:
    get_batch_row(session, batch_id)  # 404s a bad id rather than returning an empty page

    filters = [PredictionRow.batch_id == batch_id]
    if risk_tier is not None:
        filters.append(PredictionRow.risk_tier == risk_tier)
    if segment is not None:
        filters.append(PredictionRow.segment_label == segment)

    total = session.scalar(select(func.count()).select_from(PredictionRow).where(*filters)) or 0
    rows = session.scalars(
        _order_by(select(PredictionRow).where(*filters), sort).limit(limit).offset(offset)
    ).all()

    return [_to_list_item(row) for row in rows], total


def _to_list_item(row: PredictionRow) -> PredictionListItem:
    financials = row.financials
    return PredictionListItem(
        id=row.id,
        customer_ref=row.customer_ref,
        churn_probability=row.churn_probability,
        risk_tier=cast(RiskTier, row.risk_tier),
        segment_label=row.segment_label,
        arpu=float(financials["arpu"]),  # type: ignore[arg-type]
        monthly_revenue_at_risk=float(financials["monthly_revenue_at_risk"]),  # type: ignore[arg-type]
        expected_value_at_risk=float(financials["expected_value_at_risk"]),  # type: ignore[arg-type]
        expected_saved=float(financials["expected_saved"]),  # type: ignore[arg-type]
        campaign_cost=float(financials["campaign_cost"]),  # type: ignore[arg-type]
        roi=None if financials["roi"] is None else float(financials["roi"]),  # type: ignore[arg-type]
    )


def get_prediction(session: Session, prediction_id: str) -> Prediction:
    row = session.get(PredictionRow, prediction_id)
    if row is None:
        raise PredictionNotFound(f"No prediction with id '{prediction_id}'.")
    batch = get_batch_row(session, row.batch_id)
    return _to_prediction(row, batch.run_id)


def list_batches(session: Session, limit: int, offset: int) -> tuple[list[PredictionBatch], int]:
    total = session.scalar(select(func.count()).select_from(BatchRow)) or 0
    rows = session.scalars(
        select(BatchRow).order_by(BatchRow.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return [_to_batch(session, row) for row in rows], total
