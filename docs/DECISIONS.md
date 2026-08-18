# Decisions

One dated paragraph per decision. Append; never rewrite history. Any deviation from the spec must be
recorded here before it is built.

---

**2026-07-24 — FastAPI + Next.js over Streamlit.** Streamlit's rerun-everything execution model makes
nine pages with persisted run state and export flows painful, and it reads as a bootcamp artifact.
The split forces a real API layer, which is worth having independently. Cost: more setup, a second
language.

**2026-07-24 — Four algorithms, not seven.** CatBoost, SVM, and a standalone Decision Tree were cut.
On tabular churn data at this size, none beats a tuned LightGBM or XGBoost, and each adds tuning
surface and dependency weight. Revisit only with evidence from a run.

**2026-07-24 — RandomizedSearchCV over GridSearchCV, top two models only.** A grid over seven
algorithms would run for hours for a fraction of a point of PR-AUC.

**2026-07-24 — PR-AUC as the selection metric.** With a ~27% positive rate, accuracy is a vanity
metric and ROC-AUC is optimistic. Accuracy is still displayed because business users expect it, but
never used to rank.

**2026-07-24 — Isotonic calibration is mandatory.** All financial output multiplies by the predicted
probability, so an uncalibrated ranking score would produce confidently wrong money figures. This
makes calibration a correctness requirement rather than a refinement.

**2026-07-24 — No SMOTE by default.** Synthetic oversampling distorts the probability distribution
that the financial layer depends on. Class weights achieve the same recall goal without that cost.

**2026-07-24 — The LLM never computes.** All figures are produced by tested pure functions in
`ml/finance.py` and passed to the model as fixed inputs. Responses are schema-validated with a
deterministic fallback. A hallucinated revenue figure in a business-facing tool would discredit
everything else on the screen.

**2026-07-24 — Everything is keyed by `run_id`.** No global "current model". Buys reproducibility,
comparison, and rollback for the cost of one extra parameter on most endpoints.

**2026-07-24 — In-process job runner, not Celery.** A job table plus one worker thread is right-sized
for a single-node platform and leaves a clean seam if a real queue is ever needed.

**2026-07-24 — Auth deliberately out of scope.** A half-built auth system is worse than none. The
project is described as a prototype until auth, drift monitoring, and a retraining loop exist.

**2026-07-24 — Force plots dropped.** They are hard to read and carry no information the waterfall
plot lacks, and the stated audience is business users without ML background.

**2026-07-24 (Phase 0) — Error envelope shape.** The spec mandates a uniform error envelope but does
not define its fields. Chosen shape: `{"error": {"code, message, request_id, details?}}`, where
`code` is a stable machine string per domain exception, `request_id` echoes `X-Request-ID`, and
`details` carries field-level validation errors. Domain exceptions in `core/exceptions.py` each map
to one status via a handler; `RequestValidationError` and unhandled `Exception` map to 422/500.

**2026-07-24 (Phase 0) — Pinned Next.js 15, not the current 16.** `create-next-app@latest` now
scaffolds Next 16. The stack in `CLAUDE.md` specifies Next 15, so the toolchain was pinned to 15.5.x
(and `eslint-config-next` likewise) to honour the spec and keep the lockfile reproducible. Revisit as
a deliberate upgrade, not a drift. Consequence: the generated flat ESLint config was replaced with a
`FlatCompat` bridge, since 15.x still ships legacy `eslintrc`-style shared configs.

**2026-07-24 (Phase 0) — Generated API client is committed.** `src/lib/api/generated.ts` is produced
by `pnpm gen:api` from a running backend. It is committed (not gitignored) so a fresh clone type-checks
and builds without first starting the API. Regenerate it whenever the OpenAPI schema changes. CI-side
regeneration is deferred (out of Phase 0 scope).

**2026-07-24 (Phase 0) — Pre-commit runs only ruff + eslint.** The full five-gate suite (mypy, pytest,
typecheck, vitest, build) runs before a phase is declared done, not on every commit. Keeping the hook
fast is a deliberate speed trade-off.

**2026-07-24 (Phase 1) — Two small `DATA_CONTRACT.md` additions.** `dataset.eda_payload(JSON,
nullable)` was added because the build plan requires EDA to be "cached to the dataset row on first
request," and the original table listing had no column for it. `POST /datasets/sample → Dataset` was
added because the build plan requires a "load sample dataset" button with no documented endpoint
behind it; it runs the bundled `data/telco.csv` through the same ingestion pipeline as a real upload.
Both were gaps in the original contract rather than deviations from it.

**2026-08-08 (Phase 2) — Provisional financial constants for the EV-optimal threshold.**
`ARCHITECTURE.md`'s decision-threshold formula needs `save_rate`, `retention_cost`, and `clv`, but
`ml/finance.py` and `config/financial.yaml` (Phase 4) don't exist yet. Rather than build Phase 4
early, `ml/train.py` uses private module-level constants that mirror the exact defaults
`ARCHITECTURE.md` already shows for `financial.yaml` (`gross_margin=0.65`,
`discount_rate_monthly=0.01`, `expected_tenure_months=24`, `save_rate=0.30`,
`retention_cost=15` flat — the "medium" tier, since the EV(t) formula itself is a single tier-agnostic
scalar and tier bounds aren't computed until after the threshold search). `clv` is computed per
validation row from that row's `revenue_column` using the same annuity formula Phase 4 will use. This
is a real threshold search, not a stub. Phase 4 must replace these constants with `FinancialAssumptions`
loaded from config, without changing the search logic itself.

**2026-08-08 (Phase 2) — `CalibratedClassifierCV(cv="prefit")` replaced with `FrozenEstimator`.**
The spec (`ARCHITECTURE.md`) names `cv="prefit"`, but scikit-learn removed that option as of the
1.9.0 resolved by this project's lockfile (deprecated since 1.6). The replacement —
`CalibratedClassifierCV(FrozenEstimator(fitted_pipeline), method="isotonic")` — is scikit-learn's
own documented migration path and produces the identical behavior the spec calls for: the wrapped
estimator is never refit, and only the isotonic calibrator is fit on `val_df`. No change to intent,
only to a since-removed scikit-learn API.

**2026-08-08 (Phase 2) — `libomp` required for xgboost/lightgbm on macOS arm64.** Both failed to
import (`libomp.dylib` not loaded) until `brew install libomp` was run. Current PyPI wheels for these
two packages do not bundle OpenMP on macOS the way some other platforms' wheels do. Documented here
since it's a one-time host setup step, not a project config change — a fresh clone on Apple Silicon
will need the same `brew install libomp` before `uv run pytest` (or the app) can import either
library.

**2026-08-09 (Phase 3) — SHAP explains the uncalibrated pipeline.** The winner's persisted artifact
is `CalibratedClassifierCV(FrozenEstimator(pipeline))`, but the explainer is built from the pipeline
that wrapper wraps. SHAP decomposes a model's raw additive output, and isotonic calibration is a
monotone map applied afterwards — there is no additive decomposition of the calibrated probability,
and forcing one would need `KernelExplainer`, which `ARCHITECTURE.md` rules out. Consequence:
`Explanation.churn_probability` comes from the calibrated model (the number the business acts on)
while `shap_values` explain the uncalibrated score behind it. Because calibration is monotone, the
*ranking* of drivers is unaffected, which is what the waterfall communicates. `output_space` is
returned on every response so the axis is labelled honestly.

**2026-08-09 (Phase 3) — `POST /runs/{id}/explain` added ahead of the contract.**
`DATA_CONTRACT.md` routes per-prediction SHAP through `POST /predictions/single` (Phase 4), so
Phase 3 would have had no way to reach a waterfall and its "done when" would be untestable. The new
endpoint takes a raw feature dict and returns probability + contributions. Phase 4's
`/predictions/single` must delegate to `services/explain.explain_customer` and add the financial
block, rather than growing a second explanation path.

**2026-08-09 (Phase 3) — numpy pinned below 2.5.** `shap` depends on `numba`, which declares
`numpy<2.5`; the resolver otherwise backtracks to a `llvmlite` from 2021 that cannot build on
Python 3.12. `numpy` is therefore constrained to `>=2.4,<2.5` in `pyproject.toml`. Phase 2's
determinism and metric tests pass unchanged on 2.4.6. Lift the pin and the numba bound together
once numba supports 2.5.

**2026-08-09 (Phase 3) — XGBoost additivity is checked at 1e-5, not 1e-6.** `BUILD_PLAN.md` asks
that contributions plus base value reconstruct the model output within 1e-6. Logistic regression,
random forest, and LightGBM hit that at float64 machine precision. XGBoost computes `pred_contribs`
in float32, leaving a ~5e-6 residual on margins of magnitude ~5; calling xgboost's native contribution
API directly reproduces the same residual, so it is that library's precision floor rather than an
error in the aggregation. The test encodes the tolerance per algorithm with this reason attached.

**2026-08-09 (Phase 3) — shap's `expected_value` must be primed before it is read.** For XGBoost,
`TreeExplainer.expected_value` is 0 until the first `shap_values()` call lifts the bias out of the
contributions matrix. Reading it at construction time therefore yielded a base value of 0 and broke
additivity by exactly the bias. `build_explainer` now runs the explainer over a 100-row slice before
capturing `base_value`.

**2026-08-12 (Phase 4) — `assumptions` carries the discount rate too.** `DATA_CONTRACT.md` shows
the block as `{save_rate, gross_margin, horizon_months}`, but CLV is a present value and the monthly
discount rate is one of the three inputs that produces it. Omitting it would leave the largest
figure in the payload — lifetime value — partly unexplained, against the rule that no number is
shown without its basis. The field is additive, so existing consumers are unaffected.

**2026-08-12 (Phase 4) — a single prediction gets its own batch row.** The contract makes
`prediction.batch_id` a required foreign key, so `POST /predictions/single` writes a
`prediction_batch` with `source="single"`, `n_rows=1`, `status="succeeded"` before the prediction.
The alternative, a nullable `batch_id`, would fork every read path — customer list, detail drawer,
Phase 8 export — into "with batch" and "without batch" cases for no gain.

**2026-08-12 (Phase 4) — unusable revenue values reject the file rather than scoring as zero.**
Every currency figure descends from the revenue column, so a blank or negative value there has no
honest interpretation: zero would understate risk and silently. `POST /predictions/batch` validates
the column synchronously and returns a 422 naming it with spreadsheet line numbers, alongside the
missing-column check the phase requires. `prediction_batch.storage_path` (beyond the contract's
column list) keeps the uploaded file so a batch that fails later can be retried without re-upload.

**2026-08-12 (Phase 4) — a failed scoring job no longer fails its run.** The job runner previously
marked `run.status = "failed"` for any job carrying a `run_id`. With a second job kind that is
correct only for training: a scoring job dying says nothing about the model that trained fine, and
marking the run failed would retroactively invalidate a usable model and every other batch scored
against it. Failure is now attributed per kind — train to the run, score to the batch.

**2026-08-12 (Phase 4) — the segment filter ships ahead of segments.**
`GET /predictions/batch/{id}/items` accepts `?segment=` and `prediction.segment_label` is written as
null, per the contract. The UI filter renders only when a batch actually has segments, so Phase 6
wires clustering into the existing column and query parameter rather than changing the API.

**2026-08-12 (Phase 4) — `GET /runs/{id}/kpis` deferred to Phase 5.** It is in `DATA_CONTRACT.md`
but not in this phase's bullet list, and its purpose — portfolio aggregates with adjustable
`save_rate` and `gross_margin` — belongs to the dashboard consolidation phase. Batch-level
aggregates, which Phase 4 does need, are returned on `GET /predictions/batch/{id}` instead.

**2026-08-18 (Phase 5) — the route list is reconciled with what Phase 4 shipped, three ways.**
`BUILD_PLAN.md` names `/predictions/[batchId]`, `/customers/[id]`, and `/settings`; Phase 4 built
the batch view at `/predict/batches/[id]` and the customer view as a drawer, and `/settings` never
existed despite being in the sidebar. (a) The batch route **keeps Phase 4's path** — it has a real
parent page listing scored files, where `/predictions/*` would be an orphan with no index — and the
spec'd URL is a permanent redirect to it, so nobody following the plan hits a 404. (b) The drawer
**stays** as the working view, because a retention team goes down the ranked list and losing their
place on every click is what makes these tools go unused; `/customers/[id]` is added alongside it as
a permalink, and both render the same `CustomerDetail` so one customer cannot be told two stories.
The id is the prediction, not the customer, so a shared link shows the figures that were actually
scored rather than a fresh guess from a since-retrained model. (c) `/settings` is built.

**2026-08-18 (Phase 5) — `GET /runs/{id}/kpis` recomputes rather than sums.** The phase requires
`save_rate` and `gross_margin` to be live inputs, and both change the arithmetic: expected saved is
linear in the save rate, and CLV — hence every lifetime figure — is linear in margin. Summing the
`financials` stored at scoring time could therefore only ever answer the configured question. The
endpoint instead re-runs each customer's stored probability and ARPU through
`ml.finance.customer_financials` with the overridden assumptions. ARPU is read from the stored
financials rather than re-derived from `features`, so it is the revenue figure that was actually
used at scoring time. The returned `assumptions` block always describes the figures in that
response, and `is_overridden` marks a what-if as a what-if.

**2026-08-18 (Phase 5) — `GET /api/v1/settings` added, read-only.** Not in `DATA_CONTRACT.md`, but
a settings page with no data behind it is a stub, and the assumptions are global config rather than
run-scoped, so there was nothing to hang them off before a run exists. It also exposes the per-tier
`retention_cost`, which nothing else did — the UI showed a campaign cost per customer without being
able to say where it came from. Deliberately read-only: `config/financial.yaml` stays the single
source, and a second, racier way to set these would let two customers scored minutes apart rest on
different assumptions with no record of it. To try other values, the overview page's sliders do it
without changing anything.

**2026-08-18 (Phase 5) — `EDAPayload.target_distribution.positive_label`.** Counts arrive ordered by
frequency, so the target chart was colouring by position and would have painted the bars the wrong
way round on any dataset where churn is the majority class. The new field reuses the same
`positive_class_value` heuristic the quality report already applies. Optional, so payloads cached on
a dataset row before it existed still validate on read.

**2026-08-18 (Phase 5) — Playwright added; the e2e run is fully isolated.** `@playwright/test` is
new (the stack in `CLAUDE.md` already named playwright as the e2e tool). The run starts both servers
itself, with the API on a scratch SQLite database and scratch upload/artifact directories under
`backend/.e2e/`, and the frontend building into `.next-e2e/`. The separate build directory is not
tidiness: `NEXT_PUBLIC_*` is inlined at compile time, so sharing `.next/` with the dev server served
the tests a bundle compiled against the developer's own backend, which is how the first run failed.
`pnpm test:e2e` is a separate gate from `pnpm test` — it needs a browser and a Python environment,
and the five fast gates should stay fast.
