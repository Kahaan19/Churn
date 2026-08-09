from pathlib import Path

import joblib
import pandas as pd
from sqlalchemy.orm import Session

from app.core.exceptions import ArtifactMissing, ProfileMismatch, RunNotReady
from app.ml.explain import RunExplainer, align_frame
from app.models.model_artifact import ModelArtifact
from app.models.run import Run as RunModel
from app.schemas.explain import Explanation, GlobalImportance
from app.services.runs import get_run


def _succeeded_run(session: Session, run_id: str) -> RunModel:
    run = get_run(session, run_id)
    if run.status != "succeeded":
        raise RunNotReady(f"Run '{run_id}' is '{run.status}', not yet succeeded.")
    return run


def get_global_importance(session: Session, run_id: str) -> GlobalImportance:
    """Read the importance computed once at training time — never recomputed per request."""
    run = _succeeded_run(session, run_id)
    if run.global_importance is None:
        raise ArtifactMissing(f"Run '{run_id}' stored no global importance.")
    return GlobalImportance.model_validate(run.global_importance)


def _best_artifact(session: Session, run: RunModel) -> ModelArtifact:
    artifact = session.get(ModelArtifact, run.best_model_id) if run.best_model_id else None
    if artifact is None:
        raise ArtifactMissing(f"Run '{run.id}' has no best model recorded.")
    return artifact


def load_run_explainer(session: Session, run_id: str) -> RunExplainer:
    """Load the winner's persisted explainer. Phase 4 scoring reuses this."""
    run = _succeeded_run(session, run_id)
    artifact = _best_artifact(session, run)
    if not artifact.explainer_path or not Path(artifact.explainer_path).exists():
        raise ArtifactMissing(f"Explainer artifact for run '{run_id}' is missing from disk.")
    explainer: RunExplainer = joblib.load(artifact.explainer_path)
    return explainer


def explain_customer(session: Session, run_id: str, features: dict[str, object]) -> Explanation:
    """SHAP-explain one customer against a run's winning model.

    The probability comes from the *calibrated* artifact — that is the number the business acts on
    — while the contributions come from the explainer built on the uncalibrated pipeline it wraps.
    """
    run = _succeeded_run(session, run_id)
    artifact = _best_artifact(session, run)
    explainer = load_run_explainer(session, run_id)

    missing = [c for c in explainer.source_columns if c not in features]
    if missing:
        raise ProfileMismatch(
            "Missing required feature columns: " + ", ".join(sorted(missing)) + "."
        )

    frame = pd.DataFrame([features])
    if not Path(artifact.artifact_path).exists():
        raise ArtifactMissing(f"Model artifact for run '{run_id}' is missing from disk.")
    model = joblib.load(artifact.artifact_path)
    probability = float(model.predict_proba(align_frame(frame, explainer.frame_columns))[0, 1])

    return Explanation(
        run_id=run.id,
        algorithm=artifact.algorithm,
        churn_probability=probability,
        base_value=explainer.base_value,
        output_space=explainer.output_space,
        shap_values=explainer.explain(frame)[0],
    )
