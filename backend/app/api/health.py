from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.schemas.health import HealthResponse
from app.services.health import get_health

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Liveness and DB connectivity")
def health(session: Annotated[Session, Depends(get_session)]) -> HealthResponse:
    return get_health(session)
