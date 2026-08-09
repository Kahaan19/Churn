import json
import subprocess
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.pipeline import Pipeline

from app.ml.explain import build_explainer, compute_global_importance, display_name
from app.ml.pipeline import build_feature_group_map, build_preprocessor, split_categorical_low
from app.ml.train import _build_classifier, _encode_target
from app.schemas.dataset import ColumnProfile
from app.schemas.run import ALGORITHMS
from app.services.profiling import build_column_profile

FIXTURES = Path(__file__).parent / "fixtures"
BACKEND_ROOT = Path(__file__).resolve().parents[1]

# Additivity is exact in float64 for scikit-learn and LightGBM. XGBoost computes `pred_contribs`
# in float32, so ~5e-6 on margins of magnitude ~5 is its precision floor, not a bug in the
# aggregation — the native xgboost API reproduces the same residual.
_ADDITIVITY_TOLERANCE = {
    "logistic_regression": 1e-6,
    "random_forest": 1e-6,
    "lightgbm": 1e-6,
    "xgboost": 1e-5,
}


def _fit_pipeline(algorithm: str) -> tuple[Pipeline, dict[str, str], pd.DataFrame, ColumnProfile]:
    df = pd.read_csv(FIXTURES / "train_fixture.csv")
    profile = build_column_profile(df)
    y = _encode_target(df[profile.target_column])
    binary_cols, onehot_cols = split_categorical_low(df, profile.categorical_low)
    preprocessor = build_preprocessor(
        numeric=profile.numeric,
        binary=binary_cols,
        onehot=onehot_cols,
        target_encoded=profile.categorical_high,
    )
    pipeline = Pipeline([("preprocess", preprocessor), ("clf", _build_classifier(algorithm, y))])
    pipeline.fit(df, y)
    feature_group_map = build_feature_group_map(pipeline.named_steps["preprocess"])
    return pipeline, feature_group_map, df, profile


@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_contributions_plus_base_value_reconstruct_the_model_output(algorithm: str) -> None:
    pipeline, feature_group_map, df, _ = _fit_pipeline(algorithm)
    explainer = build_explainer(pipeline, feature_group_map, df)

    reconstructed = explainer.base_value + explainer.contributions(df).sum(axis=1)

    assert (
        np.abs(reconstructed - explainer.model_output(df)).max() < _ADDITIVITY_TOLERANCE[algorithm]
    )


def test_aggregation_sums_one_hot_members_into_their_source_column() -> None:
    pipeline, feature_group_map, df, profile = _fit_pipeline("logistic_regression")
    explainer = build_explainer(pipeline, feature_group_map, df)

    raw = explainer.raw_contributions(df)
    aggregated = explainer.contributions(df)

    # `Contract` has three levels in the fixture, so it must expand to three one-hot features that
    # only mean anything summed — the case the whole feature_group_map exists for.
    contract_members = [f for f, source in feature_group_map.items() if source == "Contract"]
    assert len(contract_members) > 1
    member_positions = [explainer.feature_names.index(f) for f in contract_members]
    expected = raw[:, member_positions].sum(axis=1)

    contract_column = explainer.source_columns.index("Contract")
    assert np.allclose(aggregated[:, contract_column], expected, atol=1e-12)
    # Aggregation regroups contributions, it never creates or destroys any.
    assert np.allclose(aggregated.sum(axis=1), raw.sum(axis=1), atol=1e-9)
    assert set(explainer.source_columns) == set(
        profile.numeric + profile.categorical_low + profile.categorical_high
    )


def test_explainer_loads_from_disk_without_the_training_data(tmp_path: Path) -> None:
    pipeline, feature_group_map, df, _ = _fit_pipeline("lightgbm")
    explainer = build_explainer(pipeline, feature_group_map, df)
    expected = explainer.explain(df.iloc[[0]])[0]

    path = tmp_path / "explainer.joblib"
    joblib.dump(explainer, path)
    customer = df.iloc[0].drop(labels=["Churn"]).to_dict()

    # A separate interpreter with no access to the fitted objects or the training frame — the only
    # inputs are the artifact and one customer's raw features.
    script = (
        "import json,sys,joblib,pandas as pd\n"
        "e = joblib.load(sys.argv[1])\n"
        "row = json.loads(sys.argv[2])\n"
        "out = e.explain(pd.DataFrame([row]))[0]\n"
        "print(json.dumps([[c.feature, c.contribution] for c in out]))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script, str(path), pd.Series(customer).to_json()],
        capture_output=True,
        text=True,
        cwd=BACKEND_ROOT,
        check=True,
    )

    reloaded = dict(json.loads(result.stdout))
    assert reloaded
    for contribution in expected:
        assert reloaded[contribution.feature] == pytest.approx(contribution.contribution, abs=1e-9)


def test_global_importance_ranks_every_source_column() -> None:
    pipeline, feature_group_map, df, _ = _fit_pipeline("random_forest")
    explainer = build_explainer(pipeline, feature_group_map, df)

    importance = compute_global_importance(explainer, df)

    assert importance.sample_size == len(df)
    assert importance.output_space == "probability"
    assert {f.feature for f in importance.features} == set(explainer.source_columns)
    scores = [f.importance for f in importance.features]
    assert scores == sorted(scores, reverse=True)
    assert all(score >= 0 for score in scores)
    assert importance.features[0].display_name == display_name(importance.features[0].feature)


@pytest.mark.parametrize(
    ("column", "expected"),
    [
        ("MonthlyCharges", "Monthly charges"),
        ("tenure", "Tenure (months)"),
        ("StreamingTV", "Streaming TV"),
        ("customer_id", "Customer id"),
        ("total_day_minutes", "Total day minutes"),
        ("region", "Region"),
    ],
)
def test_display_name_is_readable(column: str, expected: str) -> None:
    assert display_name(column) == expected
