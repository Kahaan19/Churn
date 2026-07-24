from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    details: list[dict[str, object]] | None = None


class ErrorEnvelope(BaseModel):
    """Uniform error body returned by every handled failure."""

    error: ErrorDetail
