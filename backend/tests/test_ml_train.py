import time
from pathlib import Path

import pandas as pd

from app.core.config import get_financial_assumptions
from app.ml.train import train_run
from app.schemas.run import ALGORITHMS
from app.services.profiling import build_column_profile

FIXTURES = Path(__file__).parent / "fixtures"
ASSUMPTIONS = get_financial_assumptions()


def _load_df() -> pd.DataFrame:
    return pd.read_csv(FIXTURES / "train_fixture.csv")


def test_train_run_completes_quickly_without_tuning(tmp_path: Path) -> None:
    df = _load_df()
    profile = build_column_profile(df)

    start = time.monotonic()
    result = train_run(
        df, profile, tune=False, artifacts_dir=tmp_path / "run-a", assumptions=ASSUMPTIONS
    )
    elapsed = time.monotonic() - start

    assert elapsed < 30
    assert {m.algorithm for m in result.models} == set(ALGORITHMS)
    assert result.best_algorithm in {m.algorithm for m in result.models}
    winner = next(m for m in result.models if m.is_best)
    assert winner.test_metrics is not None
    assert all(m.artifact_path for m in result.models)
    assert 0.0 <= result.chosen_threshold <= 1.0
    assert set(result.risk_tier_bounds) == {"low", "medium", "high", "critical"}


def test_train_run_is_deterministic_for_the_same_seed(tmp_path: Path) -> None:
    df = _load_df()
    profile = build_column_profile(df)

    result_a = train_run(
        df, profile, tune=False, artifacts_dir=tmp_path / "run-a", assumptions=ASSUMPTIONS
    )
    result_b = train_run(
        df, profile, tune=False, artifacts_dir=tmp_path / "run-b", assumptions=ASSUMPTIONS
    )

    metrics_a = {m.algorithm: m.validation_metrics for m in result_a.models}
    metrics_b = {m.algorithm: m.validation_metrics for m in result_b.models}
    assert metrics_a == metrics_b
    assert result_a.best_algorithm == result_b.best_algorithm
    assert result_a.chosen_threshold == result_b.chosen_threshold


def test_train_run_fits_preprocessing_on_the_train_fold_only(tmp_path: Path) -> None:
    df = _load_df()
    profile = build_column_profile(df)

    result = train_run(
        df, profile, tune=False, artifacts_dir=tmp_path / "run", assumptions=ASSUMPTIONS
    )

    # The winner's persisted pipeline is wrapped in CalibratedClassifierCV, so inspect a
    # non-winning model's raw Pipeline to reach the fitted ColumnTransformer directly.
    non_winner = next(m for m in result.models if not m.is_best)
    preprocessor = non_winner.pipeline.named_steps["preprocess"]
    numeric_pipeline = {name: t for name, t, _ in preprocessor.transformers_}["numeric"]
    imputer = numeric_pipeline.named_steps["impute"]

    # 220 rows split 60/20/20 leaves a 132-row train fold; the imputer's statistics must come
    # from that fold, not the full frame — the leakage guard this test exists for.
    full_medians = df[profile.numeric].median().to_numpy()
    assert not (imputer.statistics_ == full_medians).all()
