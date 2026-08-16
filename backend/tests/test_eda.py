from pathlib import Path

import pandas as pd

from app.services.eda import build_eda_payload
from app.services.profiling import build_column_profile

FIXTURES = Path(__file__).parent / "fixtures"


def _payload(fixture_name: str):
    df = pd.read_csv(FIXTURES / fixture_name)
    profile = build_column_profile(df)
    return build_eda_payload(df, profile), profile


def test_histograms_are_binned_to_at_most_fifty_bins_per_numeric_column() -> None:
    payload, profile = _payload("valid_sample.csv")

    histogram_columns = {h.column for h in payload.histograms}
    assert histogram_columns == set(profile.numeric)
    for histogram in payload.histograms:
        assert len(histogram.bins) - 1 <= 50
        assert len(histogram.counts) == len(histogram.bins) - 1
        assert sum(histogram.counts) == 60


def test_categorical_summary_includes_churn_rate_per_level() -> None:
    payload, _ = _payload("valid_sample.csv")

    contract_summary = next(c for c in payload.categorical if c.column == "Contract")
    assert set(contract_summary.levels) <= {"Month-to-month", "One year", "Two year"}
    assert len(contract_summary.counts) == len(contract_summary.levels)
    assert len(contract_summary.churn_rate) == len(contract_summary.levels)
    assert all(0.0 <= r <= 1.0 for r in contract_summary.churn_rate)


def test_correlation_matrix_is_square_and_covers_numeric_columns() -> None:
    payload, profile = _payload("valid_sample.csv")

    assert payload.correlation.columns == profile.numeric
    assert len(payload.correlation.matrix) == len(profile.numeric)
    assert all(len(row) == len(profile.numeric) for row in payload.correlation.matrix)


def test_target_distribution_sums_to_row_count() -> None:
    payload, _ = _payload("valid_sample.csv")

    assert sum(payload.target_distribution.counts) == 60


def test_target_distribution_names_the_churn_class() -> None:
    # Counts come back frequency-ordered, so the label is the only thing that tells a chart which
    # bar means "left". Position would flip on a dataset where churn is the majority class.
    payload, _ = _payload("valid_sample.csv")

    assert payload.target_distribution.positive_label == "Yes"
    assert payload.target_distribution.positive_label in payload.target_distribution.labels


def test_eda_never_exposes_raw_rows_only_aggregates() -> None:
    payload, _ = _payload("blank_numerics.csv")

    payload_dict = payload.model_dump()
    assert "customerID" not in str(payload_dict)
