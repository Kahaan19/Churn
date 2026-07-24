from pydantic import BaseModel


class Page[T](BaseModel):
    """Uniform shape for every list endpoint, per DATA_CONTRACT.md."""

    items: list[T]
    total: int
    limit: int
    offset: int
