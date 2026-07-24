from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ArtifactMissing, DatasetNotFound
from app.models.dataset import Dataset as DatasetModel
from app.schemas.dataset import ColumnProfile, ColumnProfileUpdate
from app.schemas.eda import EDAPayload
from app.schemas.quality import QualityReport
from app.services import csv_io
from app.services.eda import build_eda_payload
from app.services.profiling import build_column_profile
from app.services.quality import build_quality_report


def _upload_dir() -> Path:
    path = Path(get_settings().upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _ingest(
    session: Session, *, dataset_id: str, name: str, filename: str, dest: Path
) -> DatasetModel:
    df = csv_io.read_csv(dest)
    profile = build_column_profile(df)
    quality = build_quality_report(df, profile)

    row = DatasetModel(
        id=dataset_id,
        name=name,
        filename=filename,
        storage_path=str(dest),
        n_rows=len(df),
        n_cols=len(df.columns),
        column_profile=profile.model_dump(mode="json"),
        quality_report=quality.model_dump(mode="json"),
        eda_payload=None,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


async def create_dataset_from_upload(session: Session, upload: UploadFile) -> DatasetModel:
    settings = get_settings()
    dataset_id = str(uuid4())
    dest = _upload_dir() / f"{dataset_id}.csv"
    max_bytes = settings.max_upload_mb * 1024 * 1024
    await csv_io.stream_upload_to_disk(upload, dest, max_bytes)
    filename = upload.filename or "upload.csv"
    return _ingest(session, dataset_id=dataset_id, name=filename, filename=filename, dest=dest)


def load_sample_dataset(session: Session) -> DatasetModel:
    settings = get_settings()
    source = Path(settings.sample_dataset_path)
    if not source.exists():
        raise ArtifactMissing(
            f"Sample dataset not found on this server at {source}. Set "
            "CRIP_SAMPLE_DATASET_PATH or place the reference CSV there."
        )
    dataset_id = str(uuid4())
    dest = _upload_dir() / f"{dataset_id}.csv"
    csv_io.copy_source_to_disk(source, dest)
    return _ingest(
        session, dataset_id=dataset_id, name=source.name, filename=source.name, dest=dest
    )


def list_datasets(session: Session, limit: int, offset: int) -> tuple[list[DatasetModel], int]:
    total = session.scalar(select(func.count()).select_from(DatasetModel)) or 0
    rows = list(
        session.scalars(
            select(DatasetModel)
            .order_by(DatasetModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return rows, total


def get_dataset(session: Session, dataset_id: str) -> DatasetModel:
    row = session.get(DatasetModel, dataset_id)
    if row is None:
        raise DatasetNotFound(f"No dataset with id '{dataset_id}'.")
    return row


def get_quality(session: Session, dataset_id: str) -> QualityReport:
    row = get_dataset(session, dataset_id)
    return QualityReport.model_validate(row.quality_report)


def get_eda(session: Session, dataset_id: str) -> EDAPayload:
    row = get_dataset(session, dataset_id)
    if row.eda_payload is not None:
        return EDAPayload.model_validate(row.eda_payload)

    df = csv_io.read_csv(Path(row.storage_path))
    profile = ColumnProfile.model_validate(row.column_profile)
    payload = build_eda_payload(df, profile)

    row.eda_payload = payload.model_dump(mode="json")
    session.add(row)
    session.commit()
    return payload


def update_profile(session: Session, dataset_id: str, patch: ColumnProfileUpdate) -> DatasetModel:
    row = get_dataset(session, dataset_id)
    merged = ColumnProfile.model_validate(row.column_profile).model_dump()
    merged.update(patch.model_dump(exclude_none=True))
    profile = ColumnProfile.model_validate(merged)

    df = csv_io.read_csv(Path(row.storage_path))
    quality = build_quality_report(df, profile)

    row.column_profile = profile.model_dump(mode="json")
    row.quality_report = quality.model_dump(mode="json")
    row.eda_payload = None  # invalidated: churn rates/correlations depend on the profile
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def delete_dataset(session: Session, dataset_id: str) -> None:
    row = get_dataset(session, dataset_id)
    Path(row.storage_path).unlink(missing_ok=True)
    session.delete(row)
    session.commit()
