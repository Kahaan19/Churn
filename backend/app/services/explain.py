from dataclasses import dataclass
from pathlib import Path

import joblib
import pandas as pd
from sqlalchemy.orm import Session

from app.core.exceptions import ArtifactMissing, DatasetNotFound, ProfileMismatch, RunNotReady
from app.ml.explain import RunExplainer, align_frame
from app.models.dataset import Dataset as DatasetModel
from app.models.model_artifact import ModelArtifact
from app.models.run import Run as RunModel
from app.schemas.dataset import ColumnProfile
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


@dataclass
class ScoringBundle:
    """Everything needed to score and explain a customer against a run, loaded once.

    Single scoring and batch scoring share this deliberately: loading the calibrated model and the
    SHAP explainer costs the same whether one row or ten thousand follow, and a batch that reloaded
    them per row would take minutes instead of seconds.
    """

    run: RunModel
    artifact: ModelArtifact
    profile: ColumnProfile
    model: object
    explainer: RunExplainer

    def predict_proba(self, frame: pd.DataFrame) -> list[float]:
        """Calibrated churn probabilities — the numbers the business (and the money) acts on."""
        aligned = align_frame(frame, self.explainer.frame_columns)
        return [float(p) for p in self.model.predict_proba(aligned)[:, 1]]  # type: ignore[attr-defined]

    def missing_columns(self, columns: list[str]) -> list[str]:
        present = set(columns)
        return sorted(c for c in self.explainer.source_columns if c not in present)


def load_scoring_bundle(session: Session, run_id: str) -> ScoringBundle:
    run = _succeeded_run(session, run_id)
    artifact = _best_artifact(session, run)

    if not artifact.explainer_path or not Path(artifact.explainer_path).exists():
        raise ArtifactMissing(f"Explainer artifact for run '{run_id}' is missing from disk.")
    if not Path(artifact.artifact_path).exists():
        raise ArtifactMissing(f"Model artifact for run '{run_id}' is missing from disk.")

    dataset = session.get(DatasetModel, run.dataset_id)
    if dataset is None:
        # The revenue column lives on the dataset's profile, so without it there is no arpu and no
        # financial model — scoring cannot proceed even though the model artifact is intact.
        raise DatasetNotFound(
            f"Run '{run_id}' was trained on dataset '{run.dataset_id}', which no longer exists."
        )

    return ScoringBundle(
        run=run,
        artifact=artifact,
        profile=ColumnProfile.model_validate(dataset.column_profile),
        model=joblib.load(artifact.artifact_path),
        explainer=joblib.load(artifact.explainer_path),
    )


def load_run_explainer(session: Session, run_id: str) -> RunExplainer:
    return load_scoring_bundle(session, run_id).explainer


def explain_customer(session: Session, run_id: str, features: dict[str, object]) -> Explanation:
    """SHAP-explain one customer against a run's winning model.

    The probability comes from the *calibrated* artifact — that is the number the business acts on
    — while the contributions come from the explainer built on the uncalibrated pipeline it wraps.
    """
    bundle = load_scoring_bundle(session, run_id)

    missing = bundle.missing_columns(list(features))
    if missing:
        raise ProfileMismatch("Missing required feature columns: " + ", ".join(missing) + ".")

    frame = pd.DataFrame([features])
    return Explanation(
        run_id=bundle.run.id,
        algorithm=bundle.artifact.algorithm,
        churn_probability=bundle.predict_proba(frame)[0],
        base_value=bundle.explainer.base_value,
        output_space=bundle.explainer.output_space,
        shap_values=bundle.explainer.explain(frame)[0],
    )
