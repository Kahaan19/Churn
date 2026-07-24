# Data Contract

Schema and API surface. Change this file **before** changing code; the frontend client is generated
from the OpenAPI schema this produces.

## Dataset schema (Telco reference)

IBM Telco Customer Churn, ~7,043 rows. Canonical columns:

| Column | Type | Notes |
|---|---|---|
| `customerID` | str | identifier, excluded from features |
| `gender`, `Partner`, `Dependents`, `PhoneService`, `PaperlessBilling` | categorical | binary |
| `SeniorCitizen` | int | already 0/1 |
| `tenure` | int | months |
| `MultipleLines`, `InternetService`, `OnlineSecurity`, `OnlineBackup`, `DeviceProtection`, `TechSupport`, `StreamingTV`, `StreamingMovies` | categorical | 2–3 levels |
| `Contract` | categorical | Month-to-month / One year / Two year |
| `PaymentMethod` | categorical | 4 levels |
| `MonthlyCharges` | float | drives all financial math |
| `TotalCharges` | float | **stored as string in the raw file; 11 rows are `" "` blanks.** Coerce with `errors="coerce"`, then impute. Handle this explicitly — it is the single most common bug in this dataset. |
| `Churn` | categorical | target, Yes/No |

### Column mapping
Do not hardcode column names in ML code. Uploads are profiled into a `ColumnProfile` persisted on the
dataset:

```python
class ColumnProfile(BaseModel):
    id_column: str | None
    target_column: str
    revenue_column: str          # required — financial module depends on it
    tenure_column: str | None
    numeric: list[str]
    categorical_low: list[str]   # ≤10 unique
    categorical_high: list[str]  # >10 unique
    dropped: list[str]           # constant, >60% missing, or leaky
```

Inferred automatically on upload, overridable via `PATCH /datasets/{id}/profile`. This is what makes
the platform dataset-agnostic without pretending to be more general than it is.

### Leakage guard
On profiling, flag any feature with |Pearson or Cramér's V| > 0.95 against the target and any column
whose name matches `churn|cancel|left|terminat|exit` other than the target itself. Warn loudly in the
data quality report; do not silently drop.

## Database

SQLite via SQLAlchemy 2.0 (`Mapped[]` / `mapped_column()` style). All ids are UUID strings. All
timestamps `TIMESTAMP` UTC. JSON payloads use the `JSON` column type.

```
dataset            id, name, filename, storage_path, n_rows, n_cols, column_profile(JSON),
                   quality_report(JSON), created_at

run                id, dataset_id→dataset, status(queued|running|succeeded|failed),
                   config(JSON), best_model_id, chosen_threshold, risk_tier_bounds(JSON),
                   global_importance(JSON), calibration_curve(JSON), segment_artifact_path,
                   error_message, started_at, finished_at, created_at

model_artifact     id, run_id→run, algorithm, params(JSON), artifact_path, explainer_path,
                   feature_group_map(JSON), metrics(JSON), is_best, created_at

prediction_batch   id, run_id→run, source(single|csv), filename, n_rows,
                   status, error_message, created_at

prediction         id, batch_id→prediction_batch, customer_ref, features(JSON),
                   churn_probability, risk_tier, shap_values(JSON), financials(JSON),
                   segment_label, created_at

recommendation     id, prediction_id→prediction (unique with prompt_version), prompt_version,
                   provider, payload(JSON), is_fallback, created_at

job                id, kind(train|score), run_id, payload(JSON), status, attempts,
                   error_message, created_at, updated_at
```

Indexes: `prediction(batch_id, churn_probability DESC)` — the customer list is always sorted by risk;
`run(dataset_id, created_at DESC)`; `recommendation(prediction_id, prompt_version)` unique.

## API — `/api/v1`

All errors return `{"detail": {"code": "...", "message": "...", "fields": {...}}}` with the codes in
`CONVENTIONS.md`. All list endpoints take `?limit=&offset=` and return `{items, total, limit, offset}`.

### Datasets
```
POST   /datasets                     multipart csv → Dataset          (413 >50MB, 422 bad csv)
GET    /datasets                     → paginated
GET    /datasets/{id}                → Dataset (incl. column_profile)
PATCH  /datasets/{id}/profile        ColumnProfileUpdate → Dataset
GET    /datasets/{id}/quality        → QualityReport
GET    /datasets/{id}/eda            → EDAPayload   (cached on first call)
DELETE /datasets/{id}                204
```

`QualityReport`: `n_rows`, `n_duplicate_rows`, `missing[]{column, count, pct}`,
`type_issues[]{column, expected, found, n_bad}`, `outliers[]{column, method:"iqr", count, pct}`,
`class_balance{positive, negative, positive_rate}`, `leakage_warnings[]{column, reason, score}`,
`warnings[]`, `blocking_errors[]`. Training is refused if `blocking_errors` is non-empty.

`EDAPayload` returns **data, not images** — the frontend renders with Plotly.js:
`histograms[]{column, bins[], counts[]}`, `categorical[]{column, levels[], counts[], churn_rate[]}`,
`correlation{columns[], matrix[][]}`, `target_distribution`, `missing_matrix`.
Numeric columns are binned server-side to ≤50 bins. Never ship raw rows to the client.

### Runs
```
POST   /runs                         {dataset_id, algorithms[], tune: bool} → Run (202, status=queued)
GET    /runs                         → paginated
GET    /runs/{id}                    → Run + models[] with metrics    (poll this for progress)
GET    /runs/{id}/importance         → global aggregated SHAP importance
GET    /runs/{id}/calibration        → reliability curve points
GET    /runs/{id}/segments           → clusters{label, size, centroid, churn_rate} + 2D PCA points
DELETE /runs/{id}                    204 (removes artifacts from disk too)
```

`metrics` per model: `{accuracy, precision, recall, f1, roc_auc, pr_auc, brier, confusion_matrix,
split: "validation"|"test"}`. Model selection uses `pr_auc` on validation.

### Predictions
```
POST   /predictions/single           {run_id, features{}} → Prediction (sync, <500ms)
POST   /predictions/batch            multipart csv + run_id → PredictionBatch (202)
GET    /predictions/batch/{id}       → batch status + summary aggregates
GET    /predictions/batch/{id}/items → paginated Prediction[], ?risk_tier=&segment=&sort=
GET    /predictions/{id}             → Prediction (full shap + financials)
POST   /predictions/{id}/recommend   → Recommendation (cached; LLM call on miss)
GET    /predictions/batch/{id}/export?format=csv|pdf  → file stream
```

`Prediction.financials`:
```json
{
  "arpu": 89.10, "clv": 1230.31,
  "monthly_revenue_at_risk": 71.28, "annual_revenue_at_risk": 855.36,
  "expected_value_at_risk": 984.25, "expected_saved": 295.27,
  "campaign_cost": 90.0, "roi": 2.28,
  "assumptions": {"save_rate": 0.30, "gross_margin": 0.65, "horizon_months": 24}
}
```
`assumptions` is returned on every response so no number is ever shown without its basis.

`Prediction.shap_values`: `[{feature, display_name, value, contribution, direction}]`, sorted by
|contribution| desc, aggregated to original columns, plus `base_value`.

### KPIs
```
GET /runs/{id}/kpis?save_rate=&gross_margin=   → portfolio aggregates, params override config
```

## Finance unit tests (write these first)

`ml/finance.py` must satisfy:

| Case | Expectation |
|---|---|
| `p=0` | every at-risk figure is 0.0 |
| `p=1, arpu=100, margin=0.65, r=0.01, H=24` | `clv == 1380.82` (24-month annuity PV, ±0.01) |
| `campaign_cost=0` | `roi is None`, not `inf`, not a crash |
| `p=0.8, tier=critical` | `expected_saved = 0.8 · 0.30 · clv` exactly |
| negative or NaN `arpu` | raises `InvalidFinancialInput` |
| doubling `save_rate` | doubles `expected_saved`, leaves `*_at_risk` untouched |

Every function is pure: floats in, floats out, no DB, no model, no config file read at call time
(config is passed in as a `FinancialAssumptions` object).
