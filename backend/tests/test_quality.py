from pathlib import Path

import pandas as pd

from app.services.profiling import build_column_profile
from app.services.quality import build_quality_report

FIXTURES = Path(__file__).parent / "fixtures"


def _report(fixture_name: str):
    df = pd.read_csv(FIXTURES / fixture_name)
    profile = build_column_profile(df)
    return build_quality_report(df, profile), profile


def test_blank_total_charges_produces_a_type_issue_without_raising() -> None:
    report, _ = _report("blank_numerics.csv")

    total_charges_issue = next(i for i in report.type_issues if i.column == "TotalCharges")
    assert total_charges_issue.n_bad == 3
    assert total_charges_issue.expected == "numeric"


def test_valid_sample_has_no_total_charges_type_issue() -> None:
    report, _ = _report("valid_sample.csv")

    assert not any(i.column == "TotalCharges" for i in report.type_issues)


def test_class_imbalance_is_detected_and_reported() -> None:
    report, _ = _report("valid_sample.csv")

    assert report.class_balance.positive_rate < 0.35
    assert any("imbalanced" in w for w in report.warnings)


def test_leaky_column_is_warned_about_but_not_dropped_or_fatal() -> None:
    report, profile = _report("leaky_column.csv")

    assert "ChurnFlag" not in profile.dropped
    assert any(w.column == "ChurnFlag" for w in report.leakage_warnings)
    assert report.blocking_errors == []


def test_no_blocking_errors_on_a_clean_well_formed_dataset() -> None:
    report, _ = _report("valid_sample.csv")

    assert report.blocking_errors == []
    assert report.n_rows == 60
