from pathlib import Path

import numpy as np
import pandas as pd

from app.ml.pipeline import build_feature_group_map, build_preprocessor, split_categorical_low
from app.services.profiling import build_column_profile

FIXTURES = Path(__file__).parent / "fixtures"


def _load() -> tuple[pd.DataFrame, list[str], list[str]]:
    df = pd.read_csv(FIXTURES / "train_fixture.csv")
    profile = build_column_profile(df)
    binary_cols, onehot_cols = split_categorical_low(df, profile.categorical_low)
    return df, binary_cols, onehot_cols


def test_split_categorical_low_separates_binary_from_multi_level() -> None:
    df, binary_cols, onehot_cols = _load()

    for column in binary_cols:
        assert df[column].dropna().nunique() == 2
    for column in onehot_cols:
        assert df[column].dropna().nunique() > 2


def test_preprocessor_is_fitted_on_train_fold_only() -> None:
    df, binary_cols, onehot_cols = _load()
    profile = build_column_profile(df)

    # A deliberately skewed, non-representative slice — if the imputer's statistics matched the
    # full-frame medians instead of this slice's, that would mean it saw the held-out rows too.
    train_df = df.iloc[:80]
    preprocessor = build_preprocessor(
        numeric=profile.numeric,
        binary=binary_cols,
        onehot=onehot_cols,
        target_encoded=profile.categorical_high,
    )
    preprocessor.fit(train_df)

    numeric_pipeline = {name: t for name, t, _ in preprocessor.transformers_}["numeric"]
    imputer = numeric_pipeline.named_steps["impute"]
    train_medians = train_df[profile.numeric].median().to_numpy()
    full_medians = df[profile.numeric].median().to_numpy()

    assert (imputer.statistics_ == train_medians).all()
    assert not (imputer.statistics_ == full_medians).all()


def test_numeric_branch_coerces_string_stored_numbers_with_blanks() -> None:
    # Telco's `TotalCharges`: numeric values stored as strings, with " " for missing rows — per
    # DATA_CONTRACT.md, "the single most common bug in this dataset."
    df = pd.DataFrame({"TotalCharges": ["29.85", "1889.5", " ", "108.15", " ", "3046.05"]})
    preprocessor = build_preprocessor(
        numeric=["TotalCharges"], binary=[], onehot=[], target_encoded=[]
    )

    preprocessor.fit(df)
    numeric_pipeline = {name: t for name, t, _ in preprocessor.transformers_}["numeric"]
    imputer = numeric_pipeline.named_steps["impute"]

    assert not np.isnan(imputer.statistics_).any()
    transformed = np.asarray(preprocessor.transform(df))
    assert not np.isnan(transformed).any()


def test_feature_group_map_covers_every_transformed_feature_and_maps_back_to_source() -> None:
    df, binary_cols, onehot_cols = _load()
    profile = build_column_profile(df)

    preprocessor = build_preprocessor(
        numeric=profile.numeric,
        binary=binary_cols,
        onehot=onehot_cols,
        target_encoded=profile.categorical_high,
    )
    preprocessor.fit(df)
    transformed = preprocessor.transform(df)
    feature_names = preprocessor.get_feature_names_out()

    mapping = build_feature_group_map(preprocessor)

    assert transformed.shape[1] == len(feature_names)
    for name in feature_names:
        # ColumnTransformer prefixes output names with the branch name (e.g. "onehot__Contract_..
        # .."); build_feature_group_map keys on the unprefixed name it builds internally.
        unprefixed = name.split("__", 1)[1] if "__" in name else name
        assert unprefixed in mapping

    source_columns = (
        set(profile.numeric) | set(binary_cols) | set(onehot_cols) | set(profile.categorical_high)
    )
    assert set(mapping.values()) <= source_columns
