from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import DatasetInvalid, DatasetNotFound, RunNotFound, RunNotReady
from app.models.dataset import Dataset as DatasetModel
from app.models.job import Job
from app.models.run import Run as RunModel
from app.schemas.quality import QualityReport
from app.schemas.run import RunCreate


def create_run(session: Session, payload: RunCreate) -> RunModel:
    dataset = session.get(DatasetModel, payload.dataset_id)
    if dataset is None:
        raise DatasetNotFound(f"No dataset with id '{payload.dataset_id}'.")

    quality = QualityReport.model_validate(dataset.quality_report)
    if quality.blocking_errors:
        raise DatasetInvalid(
            "Training refused: dataset has blocking quality errors — "
            + "; ".join(quality.blocking_errors)
        )

    run = RunModel(
        dataset_id=dataset.id,
        status="queued",
        config={"algorithms": payload.algorithms, "tune": payload.tune},
    )
    session.add(run)
    session.flush()  # assigns run.id before the job row references it

    session.add(Job(kind="train", run_id=run.id, payload={}))
    session.commit()
    session.refresh(run)
    return run


def list_runs(session: Session, limit: int, offset: int) -> tuple[list[RunModel], int]:
    total = session.scalar(select(func.count()).select_from(RunModel)) or 0
    rows = list(
        session.scalars(
            select(RunModel).order_by(RunModel.created_at.desc()).limit(limit).offset(offset)
        )
    )
    return rows, total


def get_run(session: Session, run_id: str) -> RunModel:
    run = session.get(RunModel, run_id)
    if run is None:
        raise RunNotFound(f"No run with id '{run_id}'.")
    return run


def get_calibration(session: Session, run_id: str) -> dict[str, object]:
    run = get_run(session, run_id)
    if run.status != "succeeded":
        raise RunNotReady(f"Run '{run_id}' is '{run.status}', not yet succeeded.")
    return run.calibration_curve or {"points": []}
