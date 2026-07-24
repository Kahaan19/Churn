from pathlib import Path

import pandas as pd

from app.services.profiling import build_column_profile

FIXTURES = Path(__file__).parent / "fixtures"


def test_infers_id_column_target_and_revenue_from_telco_shaped_data() -> None:
    df = pd.read_csv(FIXTURES / "valid_sample.csv")

    profile = build_column_profile(df)

    assert profile.id_column == "customerID"
    assert profile.target_column == "Churn"
    assert profile.revenue_column == "MonthlyCharges"
    assert profile.tenure_column == "tenure"


def test_total_charges_stored_as_string_is_classified_numeric() -> None:
    df = pd.read_csv(FIXTURES / "valid_sample.csv")

    profile = build_column_profile(df)

    assert "TotalCharges" in profile.numeric


def test_blank_total_charges_still_classified_numeric_above_coercion_threshold() -> None:
    df = pd.read_csv(FIXTURES / "blank_numerics.csv")

    profile = build_column_profile(df)

    assert "TotalCharges" in profile.numeric


def test_id_and_target_columns_are_excluded_from_feature_lists() -> None:
    df = pd.read_csv(FIXTURES / "valid_sample.csv")

    profile = build_column_profile(df)

    feature_lists = (
        profile.numeric + profile.categorical_low + profile.categorical_high + profile.dropped
    )
    assert "customerID" not in feature_lists
    assert "Churn" not in feature_lists


def test_low_cardinality_categorical_columns_are_split_from_high_cardinality() -> None:
    df = pd.read_csv(FIXTURES / "valid_sample.csv")

    profile = build_column_profile(df)

    assert "Contract" in profile.categorical_low
    assert "SeniorCitizen" in profile.numeric


def test_leaky_column_is_flagged_by_profile_but_not_silently_dropped() -> None:
    df = pd.read_csv(FIXTURES / "leaky_column.csv")

    profile = build_column_profile(df)

    assert "ChurnFlag" not in profile.dropped
    assert "ChurnFlag" in profile.categorical_low
