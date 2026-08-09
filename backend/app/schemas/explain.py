from typing import Literal

from pydantic import BaseModel

OutputSpace = Literal["logit", "probability"]


class ImportanceFeature(BaseModel):
    feature: str
    display_name: str
    importance: float


class GlobalImportance(BaseModel):
    """Mean |SHAP| per source column over a validation sample, computed once at training time."""

    features: list[ImportanceFeature]
    sample_size: int
    output_space: OutputSpace


class FeatureContribution(BaseModel):
    """One source column's push on a single customer's score, per DATA_CONTRACT.md."""

    feature: str
    display_name: str
    value: float | str | None
    contribution: float
    direction: Literal["increases_risk", "decreases_risk"]


class ExplainRequest(BaseModel):
    features: dict[str, object]


class Explanation(BaseModel):
    run_id: str
    algorithm: str
    churn_probability: float
    base_value: float
    output_space: OutputSpace
    shap_values: list[FeatureContribution]
