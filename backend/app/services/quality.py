import math
import re

import pandas as pd
from scipy.stats import chi2_contingency

from app.schemas.dataset import ColumnProfile
from app.schemas.quality import (
    ClassBalance,
    LeakageWarning,
    MissingColumn,
    Outlier,
    QualityReport,
    TypeIssue,
)

_POSITIVE_VALUE_HINTS = ("yes", "true", "1", "churned", "churn")
_LEAKY_NAME_PATTERN = re.compile(r"churn|cancel|left|terminat|exit", re.IGNORECASE)
_LEAKAGE_THRESHOLD = 0.95
_IMBALANCE_BAND = (0.35, 0.65)


def positive_class_value(series: pd.Series) -> object:
    """Pick the "churned" class value of a binary target: a common label if present,
    else the minority class (churn is typically the rarer outcome).
    """
    values = series.dropna().unique().tolist()
    by_label = {str(v).strip().lower(): v for v in values}
    for hint in _POSITIVE_VALUE_HINTS:
        if hint in by_label:
            return by_label[hint]
    return series.value_counts().idxmin()


def missing_summary(df: pd.DataFrame) -> list[MissingColumn]:
    n = len(df)
    result = []
    for column in df.columns:
        count = int(df[column].isna().sum())
        if count:
            result.append(MissingColumn(column=column, count=count, pct=round(count / n * 100, 2)))
    return result


def _type_issues(df: pd.DataFrame, profile: ColumnProfile) -> list[TypeIssue]:
    issues = []
    for column in profile.numeric:
        raw = df[column]
        if pd.api.types.is_numeric_dtype(raw):
            continue
        coerced = pd.to_numeric(raw, errors="coerce")
        n_bad = int((coerced.isna() & raw.notna()).sum())
        if n_bad:
            issues.append(TypeIssue(column=column, expected="numeric", found="string", n_bad=n_bad))
    return issues


def _outliers(df: pd.DataFrame, profile: ColumnProfile) -> list[Outlier]:
    outliers = []
    for column in profile.numeric:
        series = pd.to_numeric(df[column], errors="coerce").dropna()
        if len(series) < 4:
            continue
        q1, q3 = series.quantile([0.25, 0.75])
        iqr = q3 - q1
        if iqr == 0:
            continue
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        count = int(((series < lower) | (series > upper)).sum())
        if count:
            pct = round(count / len(series) * 100, 2)
            outliers.append(Outlier(column=column, method="iqr", count=count, pct=pct))
    return outliers


def _class_balance(df: pd.DataFrame, profile: ColumnProfile) -> ClassBalance:
    target = df[profile.target_column]
    positive = positive_class_value(target)
    total = int(target.notna().sum())
    positive_count = int((target == positive).sum())
    negative_count = total - positive_count
    positive_rate = round(positive_count / total, 4) if total else 0.0
    return ClassBalance(
        positive=positive_count, negative=negative_count, positive_rate=positive_rate
    )


def _leakage_score(df: pd.DataFrame, column: str, profile: ColumnProfile) -> float | None:
    target = df[profile.target_column]
    positive = positive_class_value(target)
    y = (target == positive).astype(float)

    if column in profile.numeric:
        x = pd.to_numeric(df[column], errors="coerce")
        paired = pd.concat([x, y], axis=1).dropna()
        if len(paired) < 2 or paired.iloc[:, 0].nunique() < 2:
            return None
        return float(paired.iloc[:, 0].corr(paired.iloc[:, 1]))

    contingency = pd.crosstab(df[column], target)
    if contingency.shape[0] < 2 or contingency.shape[1] < 2:
        return None
    chi2, *_ = chi2_contingency(contingency)
    n = contingency.to_numpy().sum()
    dof = min(contingency.shape) - 1
    if n == 0 or dof == 0:
        return None
    return float(math.sqrt((chi2 / n) / dof))


def _leakage_warnings(df: pd.DataFrame, profile: ColumnProfile) -> list[LeakageWarning]:
    warnings = []
    for column in profile.numeric + profile.categorical_low + profile.categorical_high:
        reasons = []
        score = _leakage_score(df, column, profile)
        if score is not None and abs(score) > _LEAKAGE_THRESHOLD:
            method = "Pearson" if column in profile.numeric else "Cramér's V"
            reasons.append(f"{method} correlation with target is {score:.3f}")
        if _LEAKY_NAME_PATTERN.search(column):
            reasons.append("column name resembles a churn outcome")
        if reasons:
            reason = "; ".join(reasons)
            warnings.append(LeakageWarning(column=column, reason=reason, score=score or 0.0))
    return warnings


def build_quality_report(df: pd.DataFrame, profile: ColumnProfile) -> QualityReport:
    n_rows = len(df)
    n_duplicate_rows = int(df.duplicated().sum())
    missing = missing_summary(df)
    type_issues = _type_issues(df, profile)
    outliers = _outliers(df, profile)
    class_balance = _class_balance(df, profile)
    leakage_warnings = _leakage_warnings(df, profile)

    warnings: list[str] = []
    if n_duplicate_rows:
        warnings.append(f"{n_duplicate_rows} duplicate rows found.")
    for issue in type_issues:
        warnings.append(
            f"{issue.column}: {issue.n_bad} values could not be parsed as numeric and were coerced "
            "to missing; impute before training."
        )
    if not (_IMBALANCE_BAND[0] <= class_balance.positive_rate <= _IMBALANCE_BAND[1]):
        warnings.append(f"Target class is imbalanced ({class_balance.positive_rate:.0%} positive).")
    for warning in leakage_warnings:
        warnings.append(f"Possible leakage in '{warning.column}': {warning.reason}.")

    blocking_errors: list[str] = []
    if n_rows == 0:
        blocking_errors.append("Dataset has no rows.")
    if class_balance.positive == 0 or class_balance.negative == 0:
        blocking_errors.append("Target column has only one class; a model cannot be trained.")
    if not profile.revenue_column:
        blocking_errors.append(
            "No revenue column could be detected; set one via PATCH /datasets/{id}/profile."
        )

    return QualityReport(
        n_rows=n_rows,
        n_duplicate_rows=n_duplicate_rows,
        missing=missing,
        type_issues=type_issues,
        outliers=outliers,
        class_balance=class_balance,
        leakage_warnings=leakage_warnings,
        warnings=warnings,
        blocking_errors=blocking_errors,
    )
