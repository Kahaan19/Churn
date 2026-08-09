from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

from app.ml.pipeline import build_feature_group_map, build_preprocessor, split_categorical_low
from app.schemas.dataset import ColumnProfile
from app.schemas.run import ALGORITHMS

RANDOM_STATE = 42
_DECISION_THRESHOLD_GRID = [round(t, 2) for t in np.arange(0.01, 1.00, 0.01)]

# Provisional financial constants for EV-threshold tuning, ahead of Phase 4's
# config/financial.yaml + ml/finance.py. Values mirror the defaults ARCHITECTURE.md already shows
# for financial.yaml. retention_cost uses the "medium" tier as a flat stand-in — the EV(t) formula
# in ARCHITECTURE.md is tier-agnostic (a single scalar), so tier bounds (computed after this step)
# aren't available yet to vary it. See docs/DECISIONS.md.
_GROSS_MARGIN = 0.65
_DISCOUNT_RATE_MONTHLY = 0.01
_EXPECTED_TENURE_MONTHS = 24
_SAVE_RATE = 0.30
_RETENTION_COST = 15.0

_PARAM_GRIDS: dict[str, dict[str, list[object]]] = {
    "logistic_regression": {"clf__C": [0.01, 0.1, 1.0, 10.0]},
    "random_forest": {
        "clf__n_estimators": [200, 300, 500],
        "clf__max_depth": [None, 8, 16, 24],
        "clf__min_samples_leaf": [1, 2, 4],
    },
    "xgboost": {
        "clf__n_estimators": [200, 300, 500],
        "clf__max_depth": [3, 5, 7],
        "clf__learning_rate": [0.01, 0.05, 0.1],
    },
    "lightgbm": {
        "clf__n_estimators": [200, 300, 500],
        "clf__num_leaves": [15, 31, 63],
        "clf__learning_rate": [0.01, 0.05, 0.1],
    },
}


@dataclass
class ModelResult:
    algorithm: str
    pipeline: Pipeline
    params: dict[str, object]
    feature_group_map: dict[str, str]
    validation_metrics: dict[str, object]
    validation_proba: np.ndarray
    test_metrics: dict[str, object] | None = None
    is_best: bool = False
    artifact_path: str = ""


@dataclass
class TrainResult:
    models: list[ModelResult]
    best_algorithm: str
    chosen_threshold: float
    risk_tier_bounds: dict[str, list[float]]
    calibration_curve: list[dict[str, float]] = field(default_factory=list)


def _json_safe(value: object) -> object:
    if isinstance(value, int | float | str | bool) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_json_safe(v) for v in value]
    return str(value)


def _json_safe_params(estimator_params: dict[str, object]) -> dict[str, object]:
    return {str(k): _json_safe(v) for k, v in estimator_params.items()}


def _encode_target(series: pd.Series) -> np.ndarray:
    """Map the target column to 0/1. `1` is whichever value looks like the "churned" label
    (Yes/True/Churn), falling back to the lexicographically-last value for a deterministic pick
    on an unrecognized binary label pair.
    """
    values = series.dropna().unique()
    if set(values) <= {0, 1}:
        return np.asarray(series.astype(int).to_numpy())
    normalized = {str(v).strip().lower(): v for v in values}
    positive = (
        normalized.get("yes")
        or normalized.get("true")
        or normalized.get("churn")
        or sorted(values, key=str)[-1]
    )
    return np.asarray((series == positive).astype(int).to_numpy())


def _build_classifier(algorithm: str, y_train: np.ndarray) -> object:
    if algorithm == "logistic_regression":
        return LogisticRegression(max_iter=1000, class_weight="balanced", random_state=RANDOM_STATE)
    if algorithm == "random_forest":
        return RandomForestClassifier(
            n_estimators=300, class_weight="balanced", random_state=RANDOM_STATE, n_jobs=-1
        )
    if algorithm in ("xgboost", "lightgbm"):
        neg = int((y_train == 0).sum())
        pos = int((y_train == 1).sum())
        scale_pos_weight = neg / pos if pos else 1.0
        if algorithm == "xgboost":
            return XGBClassifier(
                n_estimators=300,
                scale_pos_weight=scale_pos_weight,
                random_state=RANDOM_STATE,
                eval_metric="logloss",
                n_jobs=-1,
            )
        return LGBMClassifier(
            n_estimators=300,
            scale_pos_weight=scale_pos_weight,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbose=-1,
        )
    raise ValueError(f"Unknown algorithm '{algorithm}'.")


def _compute_metrics(
    y_true: np.ndarray, proba: np.ndarray, *, threshold: float, split: Literal["validation", "test"]
) -> dict[str, object]:
    preds = (proba >= threshold).astype(int)
    return {
        "accuracy": float(accuracy_score(y_true, preds)),
        "precision": float(precision_score(y_true, preds, zero_division=0)),
        "recall": float(recall_score(y_true, preds, zero_division=0)),
        "f1": float(f1_score(y_true, preds, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, proba)),
        "pr_auc": float(average_precision_score(y_true, proba)),
        "brier": float(brier_score_loss(y_true, proba)),
        "confusion_matrix": confusion_matrix(y_true, preds).tolist(),
        "split": split,
    }


def _fit_one(
    algorithm: str,
    profile: ColumnProfile,
    binary_cols: list[str],
    onehot_cols: list[str],
    train_df: pd.DataFrame,
    y_train: np.ndarray,
    val_df: pd.DataFrame,
    y_val: np.ndarray,
) -> ModelResult:
    preprocessor = build_preprocessor(
        numeric=profile.numeric,
        binary=binary_cols,
        onehot=onehot_cols,
        target_encoded=profile.categorical_high,
    )
    classifier = _build_classifier(algorithm, y_train)
    pipeline = Pipeline([("preprocess", preprocessor), ("clf", classifier)])
    pipeline.fit(train_df, y_train)

    val_proba = pipeline.predict_proba(val_df)[:, 1]
    return ModelResult(
        algorithm=algorithm,
        pipeline=pipeline,
        params=_json_safe_params(pipeline.named_steps["clf"].get_params()),
        feature_group_map=build_feature_group_map(pipeline.named_steps["preprocess"]),
        validation_metrics=_compute_metrics(y_val, val_proba, threshold=0.5, split="validation"),
        validation_proba=val_proba,
    )


def _tune_top_two(
    results: list[ModelResult],
    train_df: pd.DataFrame,
    y_train: np.ndarray,
    val_df: pd.DataFrame,
    y_val: np.ndarray,
) -> list[ModelResult]:
    ranked = sorted(results, key=lambda r: r.validation_metrics["pr_auc"], reverse=True)  # type: ignore[arg-type,return-value]
    top_two = {r.algorithm for r in ranked[:2]}
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    tuned: list[ModelResult] = []
    for result in results:
        if result.algorithm not in top_two:
            tuned.append(result)
            continue
        search = RandomizedSearchCV(
            result.pipeline,
            _PARAM_GRIDS[result.algorithm],
            n_iter=25,
            cv=cv,
            scoring="average_precision",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )
        search.fit(train_df, y_train)
        best_pipeline = search.best_estimator_
        val_proba = best_pipeline.predict_proba(val_df)[:, 1]
        best_params = _json_safe_params(best_pipeline.named_steps["clf"].get_params())
        val_metrics = _compute_metrics(y_val, val_proba, threshold=0.5, split="validation")
        tuned.append(
            ModelResult(
                algorithm=result.algorithm,
                pipeline=best_pipeline,
                params=best_params,
                feature_group_map=result.feature_group_map,
                validation_metrics=val_metrics,
                validation_proba=val_proba,
            )
        )
    return tuned


def _clv(arpu: pd.Series) -> np.ndarray:
    months = np.arange(1, _EXPECTED_TENURE_MONTHS + 1)
    annuity_factor = float(np.sum(1 / (1 + _DISCOUNT_RATE_MONTHLY) ** months))
    return arpu.astype(float).to_numpy() * _GROSS_MARGIN * annuity_factor


def _tune_ev_threshold(y_true: np.ndarray, proba: np.ndarray, arpu: pd.Series) -> float:
    clv = _clv(arpu)
    is_positive = y_true == 1
    best_threshold, best_ev = 0.5, float("-inf")
    for threshold in _DECISION_THRESHOLD_GRID:
        predicted_positive = proba >= threshold
        tp = predicted_positive & is_positive
        fp = predicted_positive & ~is_positive
        fn = ~predicted_positive & is_positive
        ev = (
            float(np.sum(clv[tp])) * _SAVE_RATE
            - int(tp.sum()) * _RETENTION_COST
            - int(fp.sum()) * _RETENTION_COST
            - float(np.sum(clv[fn]))
        )
        if ev > best_ev:
            best_threshold, best_ev = float(threshold), ev
    return best_threshold


def _risk_tier_bounds(proba: np.ndarray) -> dict[str, list[float]]:
    q1, q2, q3 = (float(q) for q in np.quantile(proba, [0.25, 0.5, 0.75]))
    return {
        "low": [0.0, q1],
        "medium": [q1, q2],
        "high": [q2, q3],
        "critical": [q3, 1.0],
    }


def _calibration_curve_points(
    y_true: np.ndarray, proba: np.ndarray, n_bins: int = 10
) -> list[dict[str, float]]:
    edges = np.unique(np.quantile(proba, np.linspace(0, 1, n_bins + 1)))
    bin_indices = np.clip(np.digitize(proba, edges[1:-1], right=True), 0, len(edges) - 2)
    points: list[dict[str, float]] = []
    for bin_index in range(len(edges) - 1):
        mask = bin_indices == bin_index
        count = int(mask.sum())
        if count == 0:
            continue
        points.append(
            {
                "predicted": float(proba[mask].mean()),
                "observed": float(y_true[mask].mean()),
                "count": float(count),
            }
        )
    return points


def train_run(
    df: pd.DataFrame,
    profile: ColumnProfile,
    *,
    algorithms: list[str] | None = None,
    tune: bool = False,
    artifacts_dir: Path,
) -> TrainResult:
    """Train every requested algorithm, pick the PR-AUC winner, calibrate it, and tune its
    decision threshold and risk tiers — all fitted on train/validation only (test is touched
    once, for the winner's reported metrics). Persists every algorithm's fitted pipeline under
    `artifacts_dir` via joblib.
    """
    algorithms = algorithms or list(ALGORITHMS)
    working = df.dropna(subset=[profile.target_column]).reset_index(drop=True)
    y_all = _encode_target(working[profile.target_column])
    binary_cols, onehot_cols = split_categorical_low(working, profile.categorical_low)

    train_df, temp_df, y_train, y_temp = train_test_split(
        working, y_all, test_size=0.4, stratify=y_all, random_state=RANDOM_STATE
    )
    val_df, test_df, y_val, y_test = train_test_split(
        temp_df, y_temp, test_size=0.5, stratify=y_temp, random_state=RANDOM_STATE
    )

    results = [
        _fit_one(algorithm, profile, binary_cols, onehot_cols, train_df, y_train, val_df, y_val)
        for algorithm in algorithms
    ]
    if tune:
        results = _tune_top_two(results, train_df, y_train, val_df, y_val)

    winner = max(results, key=lambda r: r.validation_metrics["pr_auc"])  # type: ignore[arg-type,return-value]
    winner.is_best = True

    # FrozenEstimator marks the already-fitted pipeline as not-to-be-refit, so the wrapper only
    # fits the isotonic calibration mapping on `val_df` (the cv="prefit" replacement since
    # scikit-learn 1.6).
    calibrated = CalibratedClassifierCV(FrozenEstimator(winner.pipeline), method="isotonic")
    calibrated.fit(val_df, y_val)
    calibrated_val_proba = calibrated.predict_proba(val_df)[:, 1]
    test_proba = calibrated.predict_proba(test_df)[:, 1]
    winner.test_metrics = _compute_metrics(y_test, test_proba, threshold=0.5, split="test")
    # Downstream scoring (Phase 4) must use calibrated probabilities, so persist the calibrated
    # wrapper as the winner's artifact rather than the raw pipeline.
    winner.pipeline = calibrated

    artifacts_dir.mkdir(parents=True, exist_ok=True)
    for result in results:
        path = artifacts_dir / f"{result.algorithm}.joblib"
        joblib.dump(result.pipeline, path)
        result.artifact_path = str(path)

    chosen_threshold = _tune_ev_threshold(
        y_val, calibrated_val_proba, val_df[profile.revenue_column]
    )
    return TrainResult(
        models=results,
        best_algorithm=winner.algorithm,
        chosen_threshold=chosen_threshold,
        risk_tier_bounds=_risk_tier_bounds(calibrated_val_proba),
        calibration_curve=_calibration_curve_points(y_val, calibrated_val_proba),
    )
