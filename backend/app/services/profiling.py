import re

import pandas as pd

from app.schemas.dataset import ColumnProfile

_ID_NAME_HINTS = {"customerid", "customer_id", "id", "uuid", "userid", "user_id"}
_TARGET_NAME_HINTS = ("churn", "target", "label", "attrition", "ischurn", "churned")
_REVENUE_NAME_HINTS = (
    "monthlycharges",
    "monthly_charges",
    "arpu",
    "monthlyrevenue",
    "revenue",
    "charges",
    "amount",
    "price",
)
_TENURE_NAME_HINTS = ("tenure", "tenuremonths", "months")

_CATEGORICAL_LOW_MAX_UNIQUE = 10
_NUMERIC_COERCION_THRESHOLD = 0.95
_HIGH_MISSING_PCT = 0.60
_NEAR_UNIQUE_RATIO = 0.95


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _find_by_hint(columns: list[str], hints: tuple[str, ...] | set[str]) -> str | None:
    normalized = {_normalize(c): c for c in columns}
    for hint in hints:
        if hint in normalized:
            return normalized[hint]
    return None


def _is_constant(series: pd.Series) -> bool:
    return bool(series.dropna().nunique() <= 1)


def _numeric_coercion_rate(series: pd.Series) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    coerced = pd.to_numeric(non_null, errors="coerce")
    return float(coerced.notna().mean())


def _detect_id_column(df: pd.DataFrame) -> str | None:
    hinted = _find_by_hint(list(df.columns), _ID_NAME_HINTS)
    if hinted is not None:
        return hinted
    for column in df.columns:
        series = df[column]
        if (
            not pd.api.types.is_numeric_dtype(series)
            and series.nunique(dropna=True) / max(len(series), 1) > _NEAR_UNIQUE_RATIO
        ):
            return str(column)
    return None


def build_column_profile(df: pd.DataFrame) -> ColumnProfile:
    """Infer a ColumnProfile from a raw DataFrame. Best-effort and overridable — see
    DATA_CONTRACT.md for the field semantics.
    """
    id_column = _detect_id_column(df)

    is_numeric: dict[str, bool] = {}
    is_constant: dict[str, bool] = {}
    missing_pct: dict[str, float] = {}
    for column in df.columns:
        series = df[column]
        missing_pct[column] = float(series.isna().mean())
        is_constant[column] = _is_constant(series)
        if pd.api.types.is_numeric_dtype(series):
            is_numeric[column] = True
        else:
            is_numeric[column] = _numeric_coercion_rate(series) >= _NUMERIC_COERCION_THRESHOLD

    dropped = [
        column
        for column in df.columns
        if column != id_column and (is_constant[column] or missing_pct[column] > _HIGH_MISSING_PCT)
    ]

    classifiable = [c for c in df.columns if c != id_column and c not in dropped]

    binary_candidates = [c for c in classifiable if df[c].dropna().nunique() == 2]
    target_column = _find_by_hint(binary_candidates, _TARGET_NAME_HINTS)
    if target_column is None:
        if binary_candidates:
            target_column = binary_candidates[0]
        else:
            target_column = classifiable[0] if classifiable else ""

    remaining = [c for c in classifiable if c != target_column]
    numeric_columns = [c for c in remaining if is_numeric[c]]
    categorical_columns = [c for c in remaining if not is_numeric[c]]

    revenue_column = _find_by_hint(numeric_columns, _REVENUE_NAME_HINTS)
    if revenue_column is None:
        revenue_column = numeric_columns[0] if numeric_columns else ""

    tenure_column = _find_by_hint(numeric_columns, _TENURE_NAME_HINTS)

    categorical_low = [
        c for c in categorical_columns if df[c].dropna().nunique() <= _CATEGORICAL_LOW_MAX_UNIQUE
    ]
    categorical_high = [c for c in categorical_columns if c not in categorical_low]

    return ColumnProfile(
        id_column=id_column,
        target_column=target_column,
        revenue_column=revenue_column,
        tenure_column=tenure_column,
        numeric=numeric_columns,
        categorical_low=categorical_low,
        categorical_high=categorical_high,
        dropped=dropped,
    )
