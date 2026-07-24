from typing import Annotated

from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy.orm import Session
from starlette import status
from starlette.responses import Response

from app.core.db import get_session
from app.schemas.dataset import ColumnProfileUpdate
from app.schemas.dataset import Dataset as DatasetSchema
from app.schemas.eda import EDAPayload
from app.schemas.pagination import Page
from app.schemas.quality import QualityReport
from app.services import datasets as datasets_service

router = APIRouter(prefix="/datasets", tags=["datasets"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("", response_model=DatasetSchema, status_code=status.HTTP_201_CREATED)
async def upload_dataset(session: SessionDep, file: UploadFile) -> datasets_service.DatasetModel:
    return await datasets_service.create_dataset_from_upload(session, file)


@router.post("/sample", response_model=DatasetSchema, status_code=status.HTTP_201_CREATED)
def load_sample_dataset(session: SessionDep) -> datasets_service.DatasetModel:
    return datasets_service.load_sample_dataset(session)


@router.get("", response_model=Page[DatasetSchema])
def list_datasets(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[DatasetSchema]:
    rows, total = datasets_service.list_datasets(session, limit, offset)
    items = [DatasetSchema.model_validate(row) for row in rows]
    return Page[DatasetSchema](items=items, total=total, limit=limit, offset=offset)


@router.get("/{dataset_id}", response_model=DatasetSchema)
def get_dataset(session: SessionDep, dataset_id: str) -> datasets_service.DatasetModel:
    return datasets_service.get_dataset(session, dataset_id)


@router.patch("/{dataset_id}/profile", response_model=DatasetSchema)
def update_profile(
    session: SessionDep, dataset_id: str, patch: ColumnProfileUpdate
) -> datasets_service.DatasetModel:
    return datasets_service.update_profile(session, dataset_id, patch)


@router.get("/{dataset_id}/quality", response_model=QualityReport)
def get_quality(session: SessionDep, dataset_id: str) -> QualityReport:
    return datasets_service.get_quality(session, dataset_id)


@router.get("/{dataset_id}/eda", response_model=EDAPayload)
def get_eda(session: SessionDep, dataset_id: str) -> EDAPayload:
    return datasets_service.get_eda(session, dataset_id)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(session: SessionDep, dataset_id: str) -> Response:
    datasets_service.delete_dataset(session, dataset_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
