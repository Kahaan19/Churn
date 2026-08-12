from typing import Annotated

from fastapi import APIRouter, Depends, Form, Query, UploadFile
from sqlalchemy.orm import Session
from starlette import status

from app.core.db import get_session
from app.schemas.finance import RiskTier
from app.schemas.pagination import Page
from app.schemas.prediction import (
    Prediction,
    PredictionBatch,
    PredictionListItem,
    SinglePredictionRequest,
    SortKey,
)
from app.services import predictions as predictions_service

router = APIRouter(prefix="/predictions", tags=["predictions"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("/single", response_model=Prediction)
def score_single(session: SessionDep, payload: SinglePredictionRequest) -> Prediction:
    return predictions_service.score_single(session, payload.run_id, payload.features)


@router.post("/batch", response_model=PredictionBatch, status_code=status.HTTP_202_ACCEPTED)
async def score_batch(
    session: SessionDep, run_id: Annotated[str, Form()], file: UploadFile
) -> PredictionBatch:
    return await predictions_service.create_csv_batch(session, run_id, file)


@router.get("/batch", response_model=Page[PredictionBatch])
def list_batches(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[PredictionBatch]:
    items, total = predictions_service.list_batches(session, limit, offset)
    return Page[PredictionBatch](items=items, total=total, limit=limit, offset=offset)


@router.get("/batch/{batch_id}", response_model=PredictionBatch)
def get_batch(session: SessionDep, batch_id: str) -> PredictionBatch:
    return predictions_service.get_batch(session, batch_id)


@router.get("/batch/{batch_id}/items", response_model=Page[PredictionListItem])
def list_batch_items(
    session: SessionDep,
    batch_id: str,
    risk_tier: RiskTier | None = None,
    segment: str | None = None,
    sort: SortKey = "expected_value_at_risk",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[PredictionListItem]:
    items, total = predictions_service.list_batch_items(
        session,
        batch_id,
        risk_tier=risk_tier,
        segment=segment,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return Page[PredictionListItem](items=items, total=total, limit=limit, offset=offset)


@router.get("/{prediction_id}", response_model=Prediction)
def get_prediction(session: SessionDep, prediction_id: str) -> Prediction:
    return predictions_service.get_prediction(session, prediction_id)
