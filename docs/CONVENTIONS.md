# Conventions

## Python

- 3.12, `ruff` (line length 100) for lint and format, `mypy --strict` on `app/ml` and `app/services`.
- Full type hints. Modern syntax: `str | None`, `list[str]`, `Mapped[...]`.
- Pydantic v2 for all boundaries. Schemas in `schemas/`, never reuse ORM models as response types.
- Naming: `snake_case` functions, `PascalCase` classes, `UPPER_SNAKE` constants. Booleans read as
  predicates (`is_best`, `has_target`). No abbreviations except the established `df`, `X`, `y`.
- Docstrings only where the *why* isn't obvious from the signature. No `"""Gets the thing."""`.
- Imports: absolute from `app.`, standard-lib → third-party → local, no wildcards.

### Errors
Domain exceptions in `core/exceptions.py`, each mapped to one HTTP status by a handler:

```python
class CRIPError(Exception): ...
class DatasetInvalid(CRIPError): ...        # 422
class ProfileMismatch(CRIPError): ...       # 422
class RunNotReady(CRIPError): ...           # 409
class InvalidFinancialInput(CRIPError): ... # 422
class ArtifactMissing(CRIPError): ...       # 500
```

Never `except Exception: pass`. Never return `None` to signal failure from a service — raise.
Error messages name the offending column, file, or field. "Invalid input" is not an error message.

### Services
Pure-ish functions taking a session and typed arguments. No FastAPI imports below `api/`. If a
service function can't be called from a plain `python -c` script, the layering is wrong.

## TypeScript / React

- `strict: true`, no `any`, no non-null `!` without a comment justifying it.
- Server Components by default; `"use client"` only where interactivity demands it.
- Data fetching through TanStack Query with typed generated clients. No `fetch` in components.
- Query keys as const arrays: `["run", runId, "importance"]`.
- Components: one per file, `PascalCase.tsx`, props interface named `<Component>Props`.
- No prop drilling past two levels — use context or restructure.
- Loading, empty, and error states are required for every data-driven view. A component that only
  handles the success case is incomplete.

## Testing

- Backend `pytest` with an in-memory SQLite fixture per test, factory helpers over inline dicts,
  small CSV fixtures in `tests/fixtures/` (≤200 rows — never commit the full dataset).
- Test names state behaviour: `test_blank_total_charges_are_coerced_and_flagged`.
- One meaningful assertion minimum; `assert x is not None` alone is not a test.
- Test the pure functions in `ml/` hard — that's where correctness lives. Test routers for status
  codes and validation, not for business rules.
- No test touches the network or a real LLM.
- Frontend: vitest + Testing Library for logic-bearing components, Playwright for the happy path.

## Git

Conventional commits: `feat(ml): calibrate winning model with isotonic regression`.
Scopes: `api`, `ml`, `db`, `ui`, `jobs`, `docs`, `ci`. One phase can be several commits, but the
working tree must be green at each one.

## UI direction

The default shadcn look — slate grey, a blue primary, evenly-weighted cards in a 3-column grid — is
what every one of these dashboards looks like. Deviate deliberately.

**Establish a token system before building Phase 5**, and write it into `frontend/src/app/globals.css`
as CSS variables:
- A palette of 5–6 named values. Risk tiers need their own scale that reads correctly in both themes
  and does not rely on hue alone (colour-blind users exist; pair colour with a label or a shape).
- Two typefaces: one with character for headings and figures, one workhorse for body and tables.
  Not Inter for both. Tabular numerals are mandatory anywhere figures are compared in a column.
- A spacing and radius scale, applied consistently rather than per-component.

**Hierarchy follows money and risk.** The eye should land on revenue at risk and the critical-tier
count first. Metric cards of equal visual weight in a row of four is a layout that says nothing about
what matters; size and position should encode importance.

**One signature element**, executed well — the risk-ranked customer list is the natural candidate,
since it's the screen a retention team would actually live in. Make that excellent and keep
everything around it quiet.

**Charts:** consistent colour semantics across every view (churn is always the same colour). Direct
labelling over legends where it fits. No 3D, no donut charts, no gradient fills for their own sake.
Every chart gets an axis label and a unit.

**Copy:** name things as a retention manager would. "Customers likely to leave", not "Positive class
predictions". Empty states say what to do next. Errors say what happened and how to fix it. Any
assumption-derived figure carries its assumption within one glance of it.
