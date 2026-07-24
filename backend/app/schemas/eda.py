from pydantic import BaseModel

from app.schemas.quality import MissingColumn


class Histogram(BaseModel):
    column: str
    bins: list[float]
    counts: list[int]


class CategoricalSummary(BaseModel):
    column: str
    levels: list[str]
    counts: list[int]
    churn_rate: list[float]


class Correlation(BaseModel):
    columns: list[str]
    matrix: list[list[float]]


class TargetDistribution(BaseModel):
    labels: list[str]
    counts: list[int]


class EDAPayload(BaseModel):
    histograms: list[Histogram]
    categorical: list[CategoricalSummary]
    correlation: Correlation
    target_distribution: TargetDistribution
    missing_matrix: list[MissingColumn]
