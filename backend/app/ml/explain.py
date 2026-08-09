"""SHAP explainability: fit once at the end of training, persist, then answer "why" per customer.

Two deliberate choices, both from ARCHITECTURE.md "Explainability":

* `TreeExplainer` for the tree models and `LinearExplainer` for logistic regression — never
  `KernelExplainer`, which is orders of magnitude slower for no gain over this model set.
* SHAP runs on the *transformed* feature space, so `Contract_Month-to-month` gets its own value.
  Everything leaving this module is aggregated back to source columns via `feature_group_map`,
  because a business reader needs "Contract type", not a one-hot member.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd
import shap
from lightgbm import LGBMClassifier
from scipy import sparse
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

from app.schemas.explain import FeatureContribution, GlobalImportance, ImportanceFeature

OutputSpace = Literal["logit", "probability"]

GLOBAL_IMPORTANCE_SAMPLE = 2_000

# Rows used to settle a lazily-populated `expected_value` — the bias is constant, so a slice does.
_PRIME_ROWS = 100

# Business-facing labels for the columns whose generated name reads badly (acronyms, units, or a
# column name that is technically accurate but not what anyone calls it). Anything absent falls
# through to `display_name`'s de-camel-casing.
DISPLAY_NAMES: dict[str, str] = {
    "tenure": "Tenure (months)",
    "MonthlyCharges": "Monthly charges",
    "TotalCharges": "Total charges",
    "Contract": "Contract type",
    "PaymentMethod": "Payment method",
    "PaperlessBilling": "Paperless billing",
    "InternetService": "Internet service",
    "OnlineSecurity": "Online security",
    "OnlineBackup": "Online backup",
    "DeviceProtection": "Device protection",
    "TechSupport": "Tech support",
    "StreamingTV": "Streaming TV",
    "StreamingMovies": "Streaming movies",
    "PhoneService": "Phone service",
    "MultipleLines": "Multiple lines",
    "SeniorCitizen": "Senior citizen",
    "gender": "Gender",
}

_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_SEPARATORS = re.compile(r"[_\s]+")


def display_name(column: str) -> str:
    """`MonthlyCharges` -> "Monthly charges", `customer_id` -> "Customer id"."""
    override = DISPLAY_NAMES.get(column)
    if override is not None:
        return override
    words = [w for w in _SEPARATORS.split(_CAMEL_BOUNDARY.sub(" ", column)) if w]
    if not words:
        return column
    return " ".join([words[0][0].upper() + words[0][1:]] + [w.lower() for w in words[1:]])


def align_frame(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Reshape an arbitrary customer frame to the column set the fitted pipeline was given.

    Columns the pipeline drops (target, id, `profile.dropped`) are absent when scoring a live
    customer, but `ColumnTransformer.transform` still validates against its fit-time column list —
    so they are re-added as NaN and dropped again by `remainder="drop"`.
    """
    return df.reindex(columns=columns)


def _densify(matrix: object) -> np.ndarray:
    if sparse.issparse(matrix):
        # scipy-stubs types `issparse` as narrowing to the abstract base, which does not declare
        # `toarray`; every concrete sparse matrix scikit-learn emits has it.
        return np.asarray(matrix.toarray())  # type: ignore[attr-defined]
    return np.asarray(matrix)


def _output_space(classifier: object) -> OutputSpace:
    if isinstance(classifier, RandomForestClassifier):
        # sklearn forests have no margin — TreeExplainer decomposes their averaged probability.
        return "probability"
    return "logit"


def _raw_model_output(classifier: object, features: np.ndarray) -> np.ndarray:
    """The additive target SHAP decomposes: the model's own raw score.

    Each model is asked for its native raw score rather than `logit(predict_proba)`, which blows
    up to ±inf as soon as a boosted tree drives a probability to 0 or 1.
    """
    if isinstance(classifier, LogisticRegression):
        return np.asarray(classifier.decision_function(features), dtype=float)
    if isinstance(classifier, XGBClassifier):
        return np.asarray(classifier.predict(features, output_margin=True), dtype=float)
    if isinstance(classifier, LGBMClassifier):
        return np.asarray(classifier.predict(features, raw_score=True), dtype=float)
    if isinstance(classifier, RandomForestClassifier):
        return np.asarray(classifier.predict_proba(features)[:, 1], dtype=float)
    raise ValueError(f"No raw-output accessor for classifier '{type(classifier).__name__}'.")


def _positive_class_values(values: object) -> np.ndarray:
    """Normalise shap's several binary-classification return shapes to `(n_rows, n_features)`.

    Depending on the model, `shap_values` hands back a per-class list, a 3-D array with a trailing
    class axis, or a plain 2-D array for models with a single raw output. The positive class is
    always last.
    """
    if isinstance(values, list):
        values = values[-1]
    array = np.asarray(values, dtype=float)
    if array.ndim == 3:
        array = array[:, :, -1]
    return array


def _positive_class_base(expected_value: object) -> float:
    base = np.atleast_1d(np.asarray(expected_value, dtype=float))
    return float(base[-1])


@dataclass
class RunExplainer:
    """A self-contained explainer artifact: preprocessing, model, and fitted SHAP explainer.

    Persisted with joblib next to the model. Loading it needs nothing but this class — no training
    data, no background sample to re-derive — so scoring a customer months later stays possible.
    """

    preprocessor: ColumnTransformer
    classifier: object
    explainer: object
    frame_columns: list[str]
    feature_names: list[str]
    feature_group_map: dict[str, str]
    source_columns: list[str]
    output_space: OutputSpace
    base_value: float

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        return _densify(self.preprocessor.transform(align_frame(df, self.frame_columns)))

    def raw_contributions(self, df: pd.DataFrame) -> np.ndarray:
        """SHAP values in the transformed feature space, shape `(n_rows, n_feature_names)`."""
        features = self.transform(df)
        return _positive_class_values(self.explainer.shap_values(features))  # type: ignore[attr-defined]

    def contributions(self, df: pd.DataFrame) -> np.ndarray:
        """SHAP values aggregated to source columns, shape `(n_rows, n_source_columns)`."""
        return self.aggregate(self.raw_contributions(df))

    def aggregate(self, raw: np.ndarray) -> np.ndarray:
        """Sum each encoding group's members back onto their source column.

        This is the whole point of `feature_group_map`: the three `Contract_*` one-hot columns
        carry a third of the story each, and only their sum is the contribution of "Contract type".
        """
        index = {column: i for i, column in enumerate(self.source_columns)}
        aggregated = np.zeros((raw.shape[0], len(self.source_columns)), dtype=float)
        for position, feature in enumerate(self.feature_names):
            aggregated[:, index[self.feature_group_map[feature]]] += raw[:, position]
        return aggregated

    def model_output(self, df: pd.DataFrame) -> np.ndarray:
        """The quantity `base_value + sum(contributions)` reconstructs, for the additivity check."""
        return _raw_model_output(self.classifier, self.transform(df))

    def explain(self, df: pd.DataFrame) -> list[list[FeatureContribution]]:
        """Per-row contributions, sorted by |contribution| descending, in business language."""
        aggregated = self.contributions(df)
        explanations: list[list[FeatureContribution]] = []
        for position, (_, row) in enumerate(df.iterrows()):
            contributions = [
                FeatureContribution(
                    feature=column,
                    display_name=display_name(column),
                    value=_readable_value(row.get(column)),
                    contribution=float(aggregated[position, i]),
                    direction="increases_risk"
                    if aggregated[position, i] >= 0
                    else "decreases_risk",
                )
                for i, column in enumerate(self.source_columns)
            ]
            contributions.sort(key=lambda c: abs(c.contribution), reverse=True)
            explanations.append(contributions)
        return explanations


def _readable_value(value: object) -> float | str | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    if isinstance(value, bool | str):
        return str(value)
    if isinstance(value, int | float | np.integer | np.floating):
        return float(value)
    return str(value)


def build_explainer(
    pipeline: Pipeline,
    feature_group_map: dict[str, str],
    background: pd.DataFrame,
) -> RunExplainer:
    """Fit the explainer for an already-fitted, *uncalibrated* pipeline.

    Calibration is a monotone map applied after the fact; SHAP decomposes the base model's raw
    output, so the explainer is built from the pipeline the calibrator wraps, not the wrapper.
    See docs/DECISIONS.md.
    """
    preprocessor = pipeline.named_steps["preprocess"]
    classifier = pipeline.named_steps["clf"]
    feature_names = list(feature_group_map)

    frame_columns = [str(c) for c in preprocessor.feature_names_in_]
    background_matrix = _densify(preprocessor.transform(align_frame(background, frame_columns)))
    if background_matrix.shape[1] != len(feature_names):
        raise ValueError(
            f"feature_group_map describes {len(feature_names)} transformed features but the "
            f"preprocessor emits {background_matrix.shape[1]} — the two are out of step."
        )

    explainer: object
    if isinstance(classifier, LogisticRegression):
        # The masker's mean is baked into the fitted explainer, which is what keeps the persisted
        # artifact independent of the training data.
        explainer = shap.LinearExplainer(classifier, background_matrix)
    else:
        explainer = shap.TreeExplainer(classifier)

    # XGBoost carries its bias in the contributions matrix, and shap only lifts it into
    # `expected_value` on the first `shap_values` call — read before that, the base value is 0 and
    # additivity is off by exactly the bias. Priming here settles it before the value is captured.
    explainer.shap_values(background_matrix[:_PRIME_ROWS])  # type: ignore[attr-defined]

    return RunExplainer(
        preprocessor=preprocessor,
        classifier=classifier,
        explainer=explainer,
        frame_columns=frame_columns,
        feature_names=feature_names,
        feature_group_map=dict(feature_group_map),
        source_columns=list(dict.fromkeys(feature_group_map.values())),
        output_space=_output_space(classifier),
        base_value=_positive_class_base(explainer.expected_value),  # type: ignore[attr-defined]
    )


def compute_global_importance(explainer: RunExplainer, sample: pd.DataFrame) -> GlobalImportance:
    """Mean |SHAP| per source column over a validation sample — computed once, stored on the run.

    ARCHITECTURE.md is explicit that this is never recomputed at request time.
    """
    aggregated = np.abs(explainer.contributions(sample)).mean(axis=0)
    features = sorted(
        (
            ImportanceFeature(
                feature=column,
                display_name=display_name(column),
                importance=float(aggregated[i]),
            )
            for i, column in enumerate(explainer.source_columns)
        ),
        key=lambda f: f.importance,
        reverse=True,
    )
    return GlobalImportance(
        features=features,
        sample_size=len(sample),
        output_space=explainer.output_space,
    )
