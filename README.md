# CRIP — Customer Retention Intelligence Platform

Upload customer data → train churn models → explain predictions with SHAP → score risk →
quantify revenue at risk → recommend retention actions.

## Stack

- **Backend:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 + Alembic, SQLite (Postgres-ready).
- **ML:** scikit-learn, XGBoost, LightGBM, SHAP, pandas, joblib.
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind v4, shadcn/ui, TanStack Query, Plotly.js.
- **Tooling:** `uv`, `pnpm`, ruff, mypy, pytest, vitest, playwright.

## Prerequisites

- Python 3.12 and [`uv`](https://docs.astral.sh/uv/)
- Node 22+ and [`pnpm`](https://pnpm.io/)
- Docker (optional, for `docker compose`)

## Quick start

```bash
cp .env.example .env

# Backend (from backend/)
uv sync
uv run alembic upgrade head
uv run fastapi dev app/main.py        # http://localhost:8000  (docs at /docs)

# Frontend (from frontend/)
pnpm install
pnpm dev                              # http://localhost:3000
```

The home page renders live backend health fetched from `GET /health`.

### With Docker

```bash
docker compose up --build             # frontend :3000, backend :8000
```

## Common commands

```bash
# backend/
uv run pytest -q
uv run ruff check . && uv run mypy app/ml app/services

# frontend/
pnpm test && pnpm typecheck && pnpm lint
pnpm gen:api                          # regenerate typed client (needs backend running)
```

## Layout

```
backend/   FastAPI app, ML pipeline, services, migrations
frontend/  Next.js App Router UI
docs/      specs (build plan, data contract, architecture, conventions)
data/      datasets (gitignored)
artifacts/ trained models (gitignored)
```

See `docs/` for the build plan and architecture. Development follows a phased plan in
`docs/BUILD_PLAN.md`.
