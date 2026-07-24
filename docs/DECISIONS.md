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
