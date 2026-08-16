import numpy as np
import pandas as pd

from app.schemas.dataset import ColumnProfile
from app.schemas.eda import (
    CategoricalSummary,
    Correlation,
    EDAPayload,
    Histogram,
    TargetDistribution,
)
from app.services.quality import missing_summary, positive_class_value

_MAX_BINS = 50
_MAX_CATEGORICAL_LEVELS = 20


def _histograms(df: pd.DataFrame, profile: ColumnProfile) -> list[Histogram]:
    histograms = []
    for column in profile.numeric:
        series = pd.to_numeric(df[column], errors="coerce").dropna()
        if series.empty or series.nunique() < 2:
            continue
        n_bins = min(_MAX_BINS, max(1, int(np.sqrt(len(series)))))
        counts, edges = np.histogram(series, bins=n_bins)
        histograms.append(
            Histogram(
                column=column,
                bins=[round(float(e), 4) for e in edges],
                counts=[int(c) for c in counts],
            )
        )
    return histograms


def _categorical_summaries(df: pd.DataFrame, profile: ColumnProfile) -> list[CategoricalSummary]:
    target = df[profile.target_column]
    positive = positive_class_value(target)
    is_positive = target == positive

    summaries = []
    for column in profile.categorical_low + profile.categorical_high:
        counts = df[column].value_counts(dropna=True).head(_MAX_CATEGORICAL_LEVELS)
        levels = [str(level) for level in counts.index]
        churn_rate = [
            round(float(is_positive[df[column] == level].mean()), 4)
            if (df[column] == level).any()
            else 0.0
            for level in counts.index
        ]
        summaries.append(
            CategoricalSummary(
                column=column,
                levels=levels,
                counts=[int(c) for c in counts.tolist()],
                churn_rate=churn_rate,
            )
        )
    return summaries


def _correlation(df: pd.DataFrame, profile: ColumnProfile) -> Correlation:
    if not profile.numeric:
        return Correlation(columns=[], matrix=[])
    numeric_df = df[profile.numeric].apply(pd.to_numeric, errors="coerce")
    matrix = numeric_df.corr().fillna(0.0)
    return Correlation(
        columns=list(matrix.columns),
        matrix=[[round(float(v), 4) for v in row] for row in matrix.to_numpy()],
    )


def _target_distribution(df: pd.DataFrame, profile: ColumnProfile) -> TargetDistribution:
    target = df[profile.target_column]
    counts = target.value_counts(dropna=True)
    return TargetDistribution(
        labels=[str(v) for v in counts.index],
        counts=[int(c) for c in counts.tolist()],
        positive_label=str(positive_class_value(target)) if len(counts) else None,
    )


def build_eda_payload(df: pd.DataFrame, profile: ColumnProfile) -> EDAPayload:
    """Binned aggregates only — never ships raw rows to the client, per DATA_CONTRACT.md."""
    return EDAPayload(
        histograms=_histograms(df, profile),
        categorical=_categorical_summaries(df, profile),
        correlation=_correlation(df, profile),
        target_distribution=_target_distribution(df, profile),
        missing_matrix=missing_summary(df),
    )
