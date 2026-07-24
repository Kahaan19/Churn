import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse

from app.core.context import request_id_var
from app.schemas.error import ErrorDetail, ErrorEnvelope

logger = logging.getLogger("app.error")


class CRIPError(Exception):
    """Base for domain errors; each subclass maps to one HTTP status."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class DatasetInvalid(CRIPError):
    status_code = 422
    code = "dataset_invalid"


class ProfileMismatch(CRIPError):
    status_code = 422
    code = "profile_mismatch"


class RunNotReady(CRIPError):
    status_code = 409
    code = "run_not_ready"


class InvalidFinancialInput(CRIPError):
    status_code = 422
    code = "invalid_financial_input"


class ArtifactMissing(CRIPError):
    status_code = 500
    code = "artifact_missing"


def _envelope(
    code: str,
    message: str,
    details: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    body = ErrorEnvelope(
        error=ErrorDetail(
            code=code,
            message=message,
            request_id=request_id_var.get(),
            details=details,
        )
    )
    return body.model_dump(exclude_none=True)


async def _crip_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, CRIPError)
    return JSONResponse(status_code=exc.status_code, content=_envelope(exc.code, exc.message))


async def _validation_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    details = jsonable_encoder(exc.errors())
    return JSONResponse(
        status_code=422,
        content=_envelope("validation_error", "Request validation failed", details=details),
    )


async def _unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content=_envelope("internal_error", "An unexpected error occurred"),
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(CRIPError, _crip_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
