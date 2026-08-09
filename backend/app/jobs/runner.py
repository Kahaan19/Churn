import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import cast
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ml.train import train_run
from app.models.dataset import Dataset
from app.models.job import Job
from app.models.model_artifact import ModelArtifact
from app.models.run import Run
from app.schemas.dataset import ColumnProfile
from app.services import csv_io

logger = logging.getLogger("app.jobs")

SessionFactory = Callable[[], Session]


def _run_training_job(session: Session, job: Job) -> None:
    if job.run_id is None:
        raise ValueError(f"Job '{job.id}' has kind 'train' but no run_id.")
    run = session.get(Run, job.run_id)
    if run is None:
        raise ValueError(f"Run '{job.run_id}' not found for job '{job.id}'.")
    dataset = session.get(Dataset, run.dataset_id)
    if dataset is None:
        raise ValueError(f"Dataset '{run.dataset_id}' not found for run '{run.id}'.")

    run.status = "running"
    run.started_at = datetime.now(UTC)
    session.add(run)
    session.commit()

    df = csv_io.read_csv(Path(dataset.storage_path))
    profile = ColumnProfile.model_validate(dataset.column_profile)
    artifacts_dir = Path(get_settings().artifacts_dir) / run.id

    config = run.config
    algorithms_value = config.get("algorithms")
    algorithms = [str(a) for a in algorithms_value] if isinstance(algorithms_value, list) else None
    result = train_run(
        df,
        profile,
        algorithms=algorithms,
        tune=bool(config.get("tune", False)),
        artifacts_dir=artifacts_dir,
    )

    winner_artifact_id: str | None = None
    for model_result in result.models:
        artifact_id = str(uuid4())
        if model_result.is_best:
            winner_artifact_id = artifact_id
        session.add(
            ModelArtifact(
                id=artifact_id,
                run_id=run.id,
                algorithm=model_result.algorithm,
                params=model_result.params,
                artifact_path=model_result.artifact_path,
                explainer_path=model_result.explainer_path,
                feature_group_map=model_result.feature_group_map,
                metrics={
                    "validation": model_result.validation_metrics,
                    "test": model_result.test_metrics,
                },
                is_best=model_result.is_best,
            )
        )

    run.status = "succeeded"
    run.best_model_id = winner_artifact_id
    run.chosen_threshold = result.chosen_threshold
    run.risk_tier_bounds = cast(dict[str, object], result.risk_tier_bounds)
    run.global_importance = result.global_importance.model_dump()
    run.calibration_curve = {"points": result.calibration_curve}
    run.finished_at = datetime.now(UTC)
    session.add(run)
    session.commit()


def _process_next(session_factory: SessionFactory) -> bool:
    """Pop and run the oldest queued job. Returns False when the queue is empty."""
    with session_factory() as session:
        job = session.scalar(
            select(Job).where(Job.status == "queued").order_by(Job.created_at).limit(1)
        )
        if job is None:
            return False

        job.status = "running"
        job.attempts += 1
        session.add(job)
        session.commit()

        try:
            if job.kind == "train":
                _run_training_job(session, job)
            else:
                raise ValueError(f"Unknown job kind '{job.kind}'.")
        except Exception as exc:
            logger.exception("Job %s failed", job.id)
            job.status = "failed"
            job.error_message = str(exc)
            session.add(job)
            if job.run_id is not None:
                run = session.get(Run, job.run_id)
                if run is not None:
                    run.status = "failed"
                    run.error_message = str(exc)
                    session.add(run)
            session.commit()
            return True

        job.status = "succeeded"
        session.add(job)
        session.commit()
        return True


def process_pending(session_factory: SessionFactory) -> None:
    """Drain every currently queued job, oldest first. A no-op when the queue is empty.

    This is the single code path for "how a job actually runs" — both the background poll loop
    and tests call it directly, so there's no divergence between test and production execution.
    """
    while _process_next(session_factory):
        pass


class JobRunner:
    """Single in-process worker thread polling the `job` table. No Celery, no Redis — see
    ARCHITECTURE.md "Background jobs".
    """

    def __init__(self, session_factory: SessionFactory, poll_seconds: float = 1.0) -> None:
        self._session_factory = session_factory
        self._poll_seconds = poll_seconds
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="job-runner")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def _loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                process_pending(self._session_factory)
            except Exception:
                logger.exception("Job runner poll failed")
            self._stop_event.wait(self._poll_seconds)
