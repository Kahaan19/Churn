import logging
from typing import Literal

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.schemas.health import HealthResponse

logger = logging.getLogger("app.health")


def get_health(session: Session) -> HealthResponse:
    """Report app version and live database connectivity.

    A failed check degrades ``db`` to ``"error"`` rather than raising: a health
    endpoint should answer even when a dependency is down.
    """
    try:
        session.execute(text("SELECT 1"))
        db_status: Literal["ok", "error"] = "ok"
    except SQLAlchemyError:
        logger.exception("Health database check failed")
        db_status = "error"

    return HealthResponse(status="ok", version=get_settings().version, db=db_status)
