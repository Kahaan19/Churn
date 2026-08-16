from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from starlette import status

from app.core.db import get_session
from app.schemas.explain import ExplainRequest, Explanation, GlobalImportance
from app.schemas.kpi import PortfolioKpis
from app.schemas.pagination import Page
from app.schemas.run import CalibrationCurve, RunCreate
from app.schemas.run import Run as RunSchema
from app.services import explain as explain_service
from app.services import kpis as kpis_service
from app.services import runs as runs_service

router = APIRouter(prefix="/runs", tags=["runs"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("", response_model=RunSchema, status_code=status.HTTP_202_ACCEPTED)
def create_run(session: SessionDep, payload: RunCreate) -> runs_service.RunModel:
    return runs_service.create_run(session, payload)


@router.get("", response_model=Page[RunSchema])
def list_runs(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[RunSchema]:
    rows, total = runs_service.list_runs(session, limit, offset)
    items = [RunSchema.model_validate(row) for row in rows]
    return Page[RunSchema](items=items, total=total, limit=limit, offset=offset)


@router.get("/{run_id}", response_model=RunSchema)
def get_run(session: SessionDep, run_id: str) -> runs_service.RunModel:
    return runs_service.get_run(session, run_id)


@router.get("/{run_id}/calibration", response_model=CalibrationCurve)
def get_calibration(session: SessionDep, run_id: str) -> dict[str, object]:
    return runs_service.get_calibration(session, run_id)


@router.get("/{run_id}/kpis", response_model=PortfolioKpis)
def get_kpis(
    session: SessionDep,
    run_id: str,
    # Bounds mirror `FinancialAssumptions`, so an out-of-range value is refused by FastAPI before
    # any money is computed from it.
    save_rate: Annotated[float | None, Query(ge=0.0, le=1.0)] = None,
    gross_margin: Annotated[float | None, Query(gt=0.0, le=1.0)] = None,
) -> PortfolioKpis:
    return kpis_service.portfolio_kpis(
        session, run_id, save_rate=save_rate, gross_margin=gross_margin
    )


@router.get("/{run_id}/importance", response_model=GlobalImportance)
def get_importance(session: SessionDep, run_id: str) -> GlobalImportance:
    return explain_service.get_global_importance(session, run_id)


@router.post("/{run_id}/explain", response_model=Explanation)
def explain_customer(session: SessionDep, run_id: str, payload: ExplainRequest) -> Explanation:
    return explain_service.explain_customer(session, run_id, payload.features)
