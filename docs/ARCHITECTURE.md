# Architecture

## System shape

```
Next.js (3000) ──HTTP/JSON──> FastAPI (8000) ──> services/ ──> ml/ ──> artifacts/*.joblib
                                    │                                       ▲
                                    ├──> SQLAlchemy ──> SQLite              │
                                    ├──> jobs/runner (background training) ─┘
                                    └──> llm/ (Gemini or OpenAI) — narration only
```

Frontend never touches the model or the DB. All state changes go through the API. The API layer is
thin; everything meaningful is in `services/` and `ml/`, both importable and testable without HTTP.

## Core concept: the run

A **run** is one training job over one dataset. Everything downstream — model artifacts, the SHAP
explainer, the segmentation model, evaluation metrics, predictions — is keyed by `run_id`.

```
dataset (uploaded csv)
   └── run (training job, one config)
         ├── model_artifact × N   (one per algorithm trained)
         ├── best_model_id        (chosen by PR-AUC on validation)
         ├── segment_model        (K-Means fitted on the same train split)
         └── prediction_batch × N (scoring jobs against this run's best model)
               └── prediction × N  (per-customer: proba, risk tier, shap, finance)
                     └── recommendation (LLM narrative, generated on demand, cached)
```

There is no global "current model". The frontend always names a `run_id`. This is what makes
comparisons, rollback, and reproducibility possible — and it's the single most important structural
decision in the project.

## ML pipeline

### Split strategy
Stratified 60/20/20 train/validation/test, fixed `random_state=42`.
- **train** — fit the pipeline
- **validation** — model selection, hyperparameter search, threshold tuning, calibration
- **test** — touched exactly once, for the final reported metrics

Never tune on test. If a phase needs a number for the dashboard, it comes from validation unless the
field is explicitly named `test_*`.

### Preprocessing (inside a `ColumnTransformer` inside a `Pipeline`)
- numeric: median impute → `StandardScaler`
- low-cardinality categorical (≤10 levels): most-frequent impute → `OneHotEncoder(handle_unknown="ignore")`
- high-cardinality categorical: `TargetEncoder` from `category_encoders`, fitted in-fold only
- binary yes/no: mapped to 0/1

Fitting any of these outside the pipeline is a leak. There are no exceptions to this.

### Class imbalance
Telco churn runs roughly 73/27. Do **not** SMOTE by default — it distorts probability calibration,
and calibrated probabilities are load-bearing here because the financial math multiplies by them.
Instead:
- `class_weight="balanced"` (LR, RF) / `scale_pos_weight = neg/pos` (XGBoost, LightGBM)
- select on **PR-AUC**, not accuracy or ROC-AUC — with 27% positives, accuracy is a vanity metric
  and ROC-AUC flatters the model
- report accuracy anyway, because business users expect it, but never rank models by it

### Models
Phase 2 trains four: Logistic Regression (interpretable baseline), Random Forest, XGBoost, LightGBM.
Anything beyond these is out of scope — CatBoost, SVM, and a bare Decision Tree add compute and
maintenance for no realistic lift on tabular churn data.

### Hyperparameter search
`RandomizedSearchCV`, `n_iter=25`, 5-fold stratified CV, scored on `average_precision`. Only the top
two models by baseline PR-AUC get tuned. A full `GridSearchCV` over seven algorithms would run for
hours and buy nothing.

### Calibration
The selected model is wrapped in `CalibratedClassifierCV(method="isotonic", cv="prefit")` fitted on
validation. Store the reliability curve so the dashboard can show it. Rationale: `predict_proba` from
a boosted tree is a ranking score, not a probability. "Expected revenue at risk = p × ARPU" is only
meaningful if `p` is calibrated, so this is a correctness requirement, not a nicety.

### Decision threshold
Not 0.5. Choose the threshold maximizing expected value on validation:

```
EV(t) = TP(t)·(save_rate · clv − retention_cost)
      − FP(t)·retention_cost
      − FN(t)·clv
```

Store `chosen_threshold` on the run. Risk tiers (Low / Medium / High / Critical) are separate from
this operating threshold — they're quantile bands over the validation probability distribution,
stored per run, so tiers stay meaningful across datasets with different base rates.

## Explainability

- Tree models → `shap.TreeExplainer` (exact, fast, no background dataset needed)
- Logistic Regression → `shap.LinearExplainer`
- Never `KernelExplainer` — it's orders of magnitude slower and unnecessary given the model set

The explainer is fitted once at the end of training and persisted next to the model. Global feature
importance (mean |SHAP| over a 2,000-row validation sample) is computed once and stored as JSON on
the run — never recomputed at request time.

Per-prediction SHAP values are computed at scoring time and stored on the prediction row. Rendering
is done in the frontend from those stored values (Plotly waterfall), not by shipping matplotlib PNGs
from the backend. Force plots are dropped — they're unreadable to the business users this is
supposedly built for, and waterfall plots carry the same information better.

**Encoding-aware attribution:** SHAP operates on the transformed feature space, so a one-hot
`Contract_Month-to-month` gets its own value. Before returning, aggregate SHAP values back to the
original column (`Contract`) by summing the members of each encoding group. Business users need
"Contract type", not "Contract_Month-to-month = +0.11". Build this mapping when the
`ColumnTransformer` is fitted and persist it with the model.

## Segmentation

K-Means on a business-meaningful subset — tenure, monthly charges, total charges, service count —
scaled, `k` chosen by silhouette over 2–8. Fitted on the training split only, persisted with the run.

Clusters get named by rule, not by an LLM: rank the centroids on value (monthly charges) and loyalty
(tenure) and map to labels {High Value, Loyal, New, Budget, At Risk}. Deterministic naming means the
same cluster keeps the same name across sessions.

**Segments must feed downstream or they're decoration.** The segment is a required input to the
retention recommendation prompt and a filter dimension on the customer list. If it isn't wired into
those two places, cut the module.

## Financial model

All parameters live in `backend/config/financial.yaml`, all math in `ml/finance.py` as pure functions
over floats. No I/O, no model calls, fully unit-testable.

```yaml
gross_margin: 0.65              # fraction of revenue that is profit
discount_rate_monthly: 0.01     # for CLV present value
expected_tenure_months: 24      # horizon for CLV if contract length unknown
save_rate: 0.30                 # fraction of targeted at-risk customers actually retained
retention_cost:                 # cost of intervention, by risk tier
  low: 0
  medium: 15
  high: 45
  critical: 90
```

```
arpu                   = monthly_charges
clv                    = Σ_{m=1..H} (arpu · gross_margin) / (1 + r)^m
monthly_revenue_at_risk = p_churn · arpu
annual_revenue_at_risk  = p_churn · arpu · 12
expected_value_at_risk  = p_churn · clv
expected_saved          = p_churn · save_rate · clv
campaign_cost           = retention_cost[tier]
roi                     = (expected_saved − campaign_cost) / campaign_cost      # None if cost == 0
```

`save_rate` is an assumption, not a measurement. The UI must label it as such — show it as an
adjustable input on the KPI page with the current value visible, not baked invisibly into a headline
number. A dashboard that presents an assumption as a finding is worse than no dashboard.

## LLM boundary

The recommendation engine is a **narrator**, and the prompt enforces it:

Input (structured JSON): customer profile, calibrated churn probability, top-5 aggregated SHAP
contributors with signed values, segment label, pre-computed financial figures, risk tier.

Output (JSON schema, validated with Pydantic before storage):
```json
{
  "summary": "string, ≤2 sentences",
  "churn_drivers": ["string", "..."],
  "recommended_actions": [{"action": "string", "rationale": "string", "effort": "low|medium|high"}],
  "priority": "low|medium|high|critical"
}
```

Rules baked into the system prompt and enforced in code:
- The model is given the numbers and told to reference them verbatim. It must not compute, estimate,
  round, or invent any figure.
- Response is parsed against the schema; on validation failure, retry once, then fall back to a
  deterministic template-based recommendation. **Never** show a raw or unvalidated LLM string.
- `priority` returned by the LLM is advisory; the authoritative priority is
  `f(risk_tier, expected_value_at_risk)` computed in Python. If they disagree, Python wins.
- Generated on demand per customer, cached in the `recommendation` table keyed by
  `(prediction_id, prompt_version)`. Never generated in bulk during batch scoring — that's a large
  bill for output nobody will read.
- Provider behind an interface (`LLMProvider` protocol) with Gemini and OpenAI implementations, so
  swapping is a config change. Tests use a fake provider; no test hits a real API.

## Background jobs

Training takes minutes, so `POST /runs` returns immediately with a `run_id` and status `queued`.
A single in-process worker thread consumes a `job` table; the frontend polls `GET /runs/{id}`.

No Celery, no Redis, no message broker. For a single-node platform this is the right amount of
machinery, and the `job` table makes it straightforward to swap in a real queue later if it's ever
needed. Jobs must be idempotent and must record `error_message` on failure — a job that dies silently
is the worst possible failure mode for a long-running training run.

## What is deliberately not here

- **Auth.** Out of scope for the MVP. The API is designed so a dependency-injected `current_user`
  can be added later without reshaping endpoints. Don't build a half-auth system.
- **Real-time streaming / Kafka.** Batch scoring is what churn actually needs.
- **Drift monitoring and retraining loops.** Genuinely important for production; explicitly a Phase 2
  concern. Call the project a prototype until it exists.
- **Multi-tenancy.** Single-workspace assumption throughout.
