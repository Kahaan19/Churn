# CRIP — Customer Retention Intelligence Platform

Churn prediction platform: upload customer data → train models → explain predictions with SHAP →
score churn risk → quantify revenue at risk → recommend retention actions.

**This file is loaded every session. Keep it under 150 lines. Detail lives in `docs/`, read on demand.**

## Stack

| Layer     | Choice |
|-----------|--------|
| Backend   | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 + Alembic, SQLite (Postgres-ready) |
| ML        | scikit-learn, XGBoost, LightGBM, SHAP, pandas, joblib |
| Frontend  | Next.js 15 (App Router), TypeScript strict, Tailwind v4, shadcn/ui, TanStack Query, Plotly.js |
| Tooling   | `uv` (Python), `pnpm` (Node), ruff, mypy, pytest, vitest, playwright |

## Layout

```
backend/
  app/
    api/v1/          # routers — HTTP only, zero business logic
    core/            # config, db session, logging, exceptions
    models/          # SQLAlchemy ORM
    schemas/         # Pydantic request/response
    services/        # business logic (importable without FastAPI)
    ml/              # pipeline, training, explain, segment, finance
    jobs/            # background job runner
  tests/
  alembic/
frontend/
  src/app/           # routes
  src/components/    # ui/ (shadcn) + domain components
  src/lib/api/       # generated client + typed fetchers
  src/lib/           # hooks, utils
docs/                # specs — read only the one you need
data/                # datasets (gitignored, NEVER read into context)
artifacts/           # trained models (gitignored, NEVER read into context)
```

## Non-negotiable rules

1. **The LLM never computes numbers.** Probabilities, revenue at risk, ROI, and CLV come from
   deterministic Python in `ml/finance.py`. The LLM receives those numbers as input and only
   writes prose around them. Never let it recalculate or estimate a figure.
2. **No data leakage.** Every transform (impute, encode, scale, resample) lives inside a
   scikit-learn `Pipeline` fitted on training folds only. Never fit on the full dataset.
3. **Calibrate probabilities.** Raw tree-model outputs are not probabilities. Wrap the chosen model
   in `CalibratedClassifierCV` before any financial math depends on it.
4. **Every artifact is keyed by `run_id`.** Datasets, models, SHAP explainers, segments, and
   predictions are all traceable to the run that made them. No global mutable "current model".
5. **Routers stay thin.** An endpoint validates input, calls one service function, returns a schema.
6. **Type everything.** `mypy --strict` on `app/ml` and `app/services`; TS `strict: true`, no `any`.
7. **Tests before moving on.** A phase is not done until its acceptance tests pass.

## Commands

```bash
# backend (from backend/)
uv sync                                   # install
uv run fastapi dev app/main.py            # serve :8000
uv run pytest -q                          # test
uv run ruff check --fix . && uv run ruff format .
uv run mypy app/ml app/services
uv run alembic revision --autogenerate -m "msg" && uv run alembic upgrade head

# frontend (from frontend/)
pnpm install
pnpm dev                                  # serve :3000
pnpm test && pnpm typecheck && pnpm lint
pnpm gen:api                              # regenerate client from OpenAPI
```

## Where to look

| Need | File |
|------|------|
| What to build next | `docs/BUILD_PLAN.md` — **find current phase, read that section only** |
| DB tables, API contract, dataset schema | `docs/DATA_CONTRACT.md` |
| System design, ML decisions, financial model | `docs/ARCHITECTURE.md` |
| Code style, naming, error handling, UI direction | `docs/CONVENTIONS.md` |
| How to work efficiently in this repo | `docs/AGENT_PLAYBOOK.md` — **read once at session start** |
| Why something was built this way | `docs/DECISIONS.md` — append here before deviating from spec |

## Context hygiene

- Never `cat` files in `data/`, `artifacts/`, `.venv/`, `node_modules/`, `.next/`, or any lockfile.
  To inspect a dataset use `uv run python -c "import pandas as pd; d=pd.read_csv(p); print(d.dtypes, d.shape)"`.
- Prefer `rg -n "pattern" path` over reading whole files.
- Verify work by running tests, not by re-reading the files you just wrote.
- One phase per session. Commit, then `/clear` before the next phase.
