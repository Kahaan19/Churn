import pandas as pd
from category_encoders import TargetEncoder
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, OrdinalEncoder, StandardScaler


def _coerce_numeric(frame: pd.DataFrame) -> pd.DataFrame:
    """`profile.numeric` columns may still be object-dtype — e.g. Telco's `TotalCharges`, stored
    as a string with blank rows (`" "`). Coercing (blanks -> NaN) here, inside the fitted
    Pipeline, means SimpleImputer sees real floats and Phase 4 scoring inherits the same coercion
    automatically instead of having to remember to re-apply it. Per DATA_CONTRACT.md, this is "the
    single most common bug in this dataset."
    """
    coerced: pd.DataFrame = frame.apply(pd.to_numeric, errors="coerce")
    return coerced


def split_categorical_low(df: pd.DataFrame, columns: list[str]) -> tuple[list[str], list[str]]:
    """Split `ColumnProfile.categorical_low` into binary (2-level) and one-hot (3-10 level) groups.

    This is a structural typing decision, not a target-derived statistic, so using the full
    frame (rather than only the train fold) here is not a leak — see ARCHITECTURE.md.
    """
    binary_cols = [c for c in columns if df[c].dropna().nunique() == 2]
    onehot_cols = [c for c in columns if c not in binary_cols]
    return binary_cols, onehot_cols


def build_preprocessor(
    *,
    numeric: list[str],
    binary: list[str],
    onehot: list[str],
    target_encoded: list[str],
) -> ColumnTransformer:
    """Build the ColumnTransformer per ARCHITECTURE.md's preprocessing table. Every branch is
    impute-then-encode inside its own Pipeline, so fitting the returned transformer on a train
    fold fits every statistic (medians, categories, target means) on that fold only.
    """
    transformers: list[tuple[str, Pipeline, list[str]]] = []
    if numeric:
        transformers.append(
            (
                "numeric",
                Pipeline(
                    [
                        (
                            "coerce",
                            FunctionTransformer(_coerce_numeric, feature_names_out="one-to-one"),
                        ),
                        ("impute", SimpleImputer(strategy="median")),
                        ("scale", StandardScaler()),
                    ]
                ),
                numeric,
            )
        )
    if binary:
        transformers.append(
            (
                "binary",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        ("encode", OrdinalEncoder()),
                    ]
                ),
                binary,
            )
        )
    if onehot:
        transformers.append(
            (
                "onehot",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        ("encode", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                onehot,
            )
        )
    if target_encoded:
        transformers.append(
            (
                "target_encoded",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        ("encode", TargetEncoder()),
                    ]
                ),
                target_encoded,
            )
        )
    return ColumnTransformer(transformers, remainder="drop")


def build_feature_group_map(fitted_preprocessor: ColumnTransformer) -> dict[str, str]:
    """Map each transformed feature name back to its source column.

    Phase 3 sums SHAP values over each group to attribute a one-hot-expanded feature like
    `Contract_Month-to-month` back to the source column `Contract`, per ARCHITECTURE.md's
    "encoding-aware attribution" — everything else expands 1:1.
    """
    mapping: dict[str, str] = {}
    for name, transformer, input_columns in fitted_preprocessor.transformers_:
        if name == "remainder":
            continue
        columns = list(input_columns)
        if name == "onehot":
            encoder = transformer.named_steps["encode"]
            output_names = list(encoder.get_feature_names_out(columns))
            index = 0
            for source_column, categories in zip(columns, encoder.categories_, strict=True):
                for _ in categories:
                    mapping[output_names[index]] = source_column
                    index += 1
        else:
            # numeric, binary, and target_encoded branches are all 1:1: one output feature per
            # input column, keeping the original column name.
            for source_column in columns:
                mapping[source_column] = source_column
    return mapping
