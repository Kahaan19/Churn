# Build Plan

Nine phases. **Read only the phase you are working on.** Each is one session, ending in a commit and
a `/clear`.

Phases 0–5 are the MVP — a complete, defensible product on their own. Phases 6–8 are additive; if
time runs out, stopping after Phase 5 leaves something finished rather than something broken.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done. Update this as you go.

---

## `[x]` Phase 0 — Foundation

**Reads:** `CONVENTIONS.md`
**Goal:** both apps boot, talk to each other, and every quality gate runs green on an empty project.

- `backend/` with `uv`, FastAPI app factory, settings via `pydantic-settings`, structured JSON
  logging with a request-id middleware, global exception handlers returning the error envelope.
- SQLAlchemy 2.0 session management, Alembic initialised, an empty first migration.
- `frontend/` with `create-next-app` (TS, App Router, Tailwind v4), shadcn/ui initialised,
  TanStack Query provider, app shell (sidebar + header + dark mode toggle with no flash on load).
- `GET /health` → `{status, version, db: "ok"}`, rendered on the frontend home page from a real fetch.
- `pnpm gen:api` script generating a typed client from `/openapi.json` via `openapi-typescript`.
- `ruff`, `mypy`, `pytest`, `vitest`, `eslint` configured. Pre-commit hook running ruff + eslint.
- `.gitignore` covering `data/`, `artifacts/`, `*.db`, `.env`. `.env.example` committed, `.env` not.
- `docker-compose.yml` running both services.
- `README.md`: what it is, how to run it, in under 60 lines.

**Done when:** `docker compose up` serves a home page showing live backend health; all five quality
gate commands pass; `git log` has one clean commit.

---

## `[ ]` Phase 1 — Ingestion, validation, EDA

**Reads:** `DATA_CONTRACT.md` (dataset schema, quality/EDA sections)
**Goal:** upload a CSV and get back a trustworthy picture of it.

- Upload endpoint: streamed to disk, 50MB cap, CSV sniffing for delimiter/encoding, rejects
  non-tabular files with a useful message rather than a stack trace.
- `services/profiling.py` — infers `ColumnProfile`; target detected by name heuristic plus binary
  cardinality, revenue column by name heuristic, overridable.
- `services/quality.py` — the full `QualityReport` including the leakage guard. `TotalCharges`-style
  numeric-stored-as-string detection is a first-class check, not an afterthought.
- `services/eda.py` — binned aggregates only, cached to the dataset row on first request.
- Frontend: drag-and-drop upload with progress, "load sample dataset" button, quality report page
  where warnings are scannable in five seconds, EDA page with Plotly charts.
- Tests: a malformed CSV fixture, a fixture with blank numerics, a fixture with a leaky column.
  Each must produce the right warning without raising.

**Done when:** uploading raw Telco surfaces the 11 blank `TotalCharges` rows and the class imbalance,
and EDA renders without the browser receiving a single raw data row.

---

## `[ ]` Phase 2 — Training pipeline

**Reads:** `ARCHITECTURE.md` (ML pipeline), `DATA_CONTRACT.md` (run/model tables)
**Goal:** a run trains four models and picks a winner, reproducibly.

- `ml/pipeline.py` — builds the `ColumnTransformer` from a `ColumnProfile`. Also emits
  `feature_group_map` mapping transformed feature names back to source columns. Phase 3 depends on
  this, so build it now.
- `ml/train.py` — stratified 60/20/20, trains LR + RF + XGBoost + LightGBM with imbalance handling,
  evaluates on validation, optionally `RandomizedSearchCV` on the top two, calibrates the winner,
  tunes the EV threshold, computes risk tier bounds, persists artifacts with joblib.
- `jobs/runner.py` — job table + single worker thread, status transitions, `error_message` capture,
  idempotent re-runs.
- Endpoints: `POST /runs`, `GET /runs/{id}`, `GET /runs/{id}/calibration`.
- Frontend: launch-run form, polling progress view, model comparison table sortable by metric with
  PR-AUC visually marked as the selection criterion, calibration curve chart.
- Tests: pipeline has no leakage (transformers fitted only on train — assert on the fitted attributes);
  same seed produces identical metrics twice; a run over a tiny 200-row fixture completes in <30s.

**Done when:** a Telco run reaches PR-AUC ≥ 0.60 on validation and the comparison table renders from
real stored metrics.

---

## `[ ]` Phase 3 — Explainability

**Reads:** `ARCHITECTURE.md` (explainability)
**Goal:** every prediction can answer "why", in business language.

- `ml/explain.py` — `TreeExplainer` / `LinearExplainer` selection, fitted and persisted at end of
  training, global importance over a 2,000-row validation sample stored on the run.
- SHAP-to-source-column aggregation using `feature_group_map`; human display names via a
  `DISPLAY_NAMES` mapping with a readable fallback (`MonthlyCharges` → "Monthly charges").
- `GET /runs/{id}/importance`; per-prediction SHAP computed at scoring time.
- Frontend: global importance bar chart; per-customer waterfall in Plotly, with plain-language
  captions above it ("Being on a month-to-month contract raises this customer's risk the most").
- Tests: SHAP contributions plus base value reconstruct the model's logit output within 1e-6;
  aggregation sums one-hot members correctly; explainer loads from disk without the training data.

**Done when:** a business reader with no ML background can look at one waterfall and correctly state
the top three reasons that customer is at risk.

---

## `[ ]` Phase 4 — Scoring and financial impact

**Reads:** `ARCHITECTURE.md` (financial model), `DATA_CONTRACT.md` (predictions, finance tests)
**Goal:** score customers and attach money to the risk.

- `ml/finance.py` — pure functions, written **test-first** against the table in `DATA_CONTRACT.md`.
- `config/financial.yaml` + `FinancialAssumptions` model with validation.
- Single and batch scoring endpoints; batch runs through the job runner; input schema validated
  against the run's `ColumnProfile` with a clear error listing missing/extra columns.
- Risk tier assignment from the run's stored bounds.
- Frontend: single-prediction form; batch upload; customer list sorted by expected value at risk,
  filterable by tier and segment; detail drawer showing probability, waterfall, and financials with
  the assumptions panel visible.
- Tests: the finance table in full; batch of 1,000 rows scores in <10s; a CSV with a missing required
  column fails with a 422 naming that column.

**Done when:** uploading a customer CSV returns a risk-ranked list where every figure traces back to a
tested pure function, and the assumptions behind them are on screen.

---

## `[ ]` Phase 5 — Dashboard consolidation

**Reads:** `CONVENTIONS.md` (UI direction)
**Goal:** the pieces become a product.

- Routes: `/` overview, `/datasets`, `/datasets/[id]`, `/runs`, `/runs/[id]`, `/predict`,
  `/predictions/[batchId]`, `/customers/[id]`, `/settings`.
- Portfolio KPI page: total revenue at risk, customers by tier, expected saved under current
  assumptions, with `save_rate` and `gross_margin` as live inputs that re-query the KPI endpoint.
- Real loading skeletons, real empty states ("No runs yet — train one to see model performance"),
  real error states with a retry. No spinner-only screens.
- Responsive to 768px. Keyboard focus visible. `prefers-reduced-motion` respected.
- Playwright happy path: upload → train → wait → score → open a customer → see explanation.

**Done when:** a stranger can go from empty database to a scored customer with an explanation without
being told what to click. **This is the MVP checkpoint — the project is presentable here.**

---

## `[ ]` Phase 6 — Segmentation

**Reads:** `ARCHITECTURE.md` (segmentation)
**Goal:** customer groups that feed decisions.

- `ml/segment.py` — K-Means, silhouette-chosen `k` over 2–8, fitted on the training split,
  deterministic centroid-rank naming, persisted with the run.
- Segment label written onto every prediction at scoring time; PCA 2D projection for the chart.
- `GET /runs/{id}/segments`; frontend scatter coloured by segment with churn rate per cluster; segment
  becomes a filter on the customer list.
- Tests: naming is stable across refits on the same data; every prediction gets a label.

**Done when:** segment is a working filter on the customer list. If it is only a chart, it has not
earned its place — cut it.

---

## `[ ]` Phase 7 — Retention recommendations

**Reads:** `ARCHITECTURE.md` (LLM boundary)
**Goal:** the narration layer, with the numbers locked down.

- `llm/provider.py` — `LLMProvider` protocol, Gemini + OpenAI implementations, `FakeProvider` for
  tests, selected by config. API key from env, never logged.
- `llm/prompts.py` — versioned prompt template (`PROMPT_VERSION` constant), structured JSON input,
  explicit instruction that figures are given and must be quoted, never computed.
- Pydantic-validated response, one retry, then deterministic template fallback keyed on top SHAP
  driver and segment. Cache on `(prediction_id, prompt_version)`.
- Python-computed priority overrides the LLM's.
- Frontend: "Generate recommendation" button on the customer drawer, loading state, fallback badge
  when the deterministic path was used.
- Tests: no test calls a live API; a malformed LLM response triggers fallback rather than an error;
  the cache prevents a second call; a response containing a number not present in the input is
  rejected by a guard test.

**Done when:** you can disconnect the internet and the feature still returns a sensible, clearly
labelled recommendation.

---

## `[ ]` Phase 8 — Export and hardening

**Reads:** —
**Goal:** ship quality.

- CSV export (streamed, no full materialisation) and PDF export (WeasyPrint or ReportLab —
  server-side, template-driven, including the waterfall as an embedded image).
- Rate limiting on upload and LLM endpoints. Request size caps. Artifact cleanup on run deletion.
- OpenAPI descriptions and examples on every endpoint.
- `DECISIONS.md` written up; README with screenshots and an honest "known limitations" section
  naming the absent auth, drift monitoring, and retraining loop.
- Coverage: ≥80% on `app/ml` and `app/services`.

**Done when:** a reviewer cloning the repo can run it, understand the boundaries, and find nothing
that overclaims.

---

## Deliberately excluded

CatBoost, SVM, standalone Decision Tree, SMOTE by default, force plots, matplotlib images over the
wire, Celery/Redis, auth, multi-tenancy, real-time streaming. Each was considered and cut; if you
believe one is now necessary, propose it in `DECISIONS.md` before building it.
