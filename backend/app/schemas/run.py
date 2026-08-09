from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.explain import GlobalImportance

ALGORITHMS: tuple[str, ...] = ("logistic_regression", "random_forest", "xgboost", "lightgbm")


class RunCreate(BaseModel):
    dataset_id: str
    algorithms: list[str] = list(ALGORITHMS)
    tune: bool = False


class RunConfig(BaseModel):
    algorithms: list[str]
    tune: bool


class ModelMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1: float
    roc_auc: float
    pr_auc: float
    brier: float
    confusion_matrix: list[list[int]]
    split: Literal["validation", "test"]


class ModelMetricsBySplit(BaseModel):
    validation: ModelMetrics
    test: ModelMetrics | None = None


class ModelArtifactOut(BaseModel):
    id: str
    algorithm: str
    params: dict[str, object]
    metrics: ModelMetricsBySplit
    is_best: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CalibrationPoint(BaseModel):
    predicted: float
    observed: float
    count: int


class CalibrationCurve(BaseModel):
    points: list[CalibrationPoint]


class Run(BaseModel):
    id: str
    dataset_id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    config: RunConfig
    best_model_id: str | None
    chosen_threshold: float | None
    risk_tier_bounds: dict[str, list[float]] | None
    global_importance: GlobalImportance | None
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    models: list[ModelArtifactOut]

    model_config = {"from_attributes": True}
