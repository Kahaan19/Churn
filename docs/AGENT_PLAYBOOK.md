# Agent Playbook

How to work in this repo efficiently. Read once at session start, then follow.

## Session protocol

**One phase per session.** Context degrades as it fills; a fresh session per phase keeps quality high
and cost low.

1. Read `CLAUDE.md` (auto-loaded) and the **single** phase section you're working on in
   `docs/BUILD_PLAN.md`. Do not read other phases.
2. Read only the docs that phase names in its "Reads" line.
3. Write a short plan (5–10 bullets). Confirm with the user before writing code on any phase that
   touches the DB schema or the API contract.
4. Build. Test. Run the phase's acceptance checks.
5. Commit with a conventional-commit message.
6. Tell the user the phase is done and that they should `/clear` before the next one.

## Token discipline

**Never read into context:**
`data/**`, `artifacts/**`, `*.pkl`, `*.joblib`, `.venv/**`, `node_modules/**`, `.next/**`,
`uv.lock`, `pnpm-lock.yaml`, `*.ipynb` outputs, coverage reports, any file over ~1500 lines.

**Inspecting data without reading it:**
```bash
uv run python -c "
import pandas as pd
d = pd.read_csv('data/telco.csv')
print(d.shape); print(d.dtypes); print(d.isna().sum()[lambda s: s>0])
"
```
Never `cat` a CSV. Never paste dataframe dumps into the conversation.

**Searching:** `rg -n --max-count 5 "pattern" backend/app` beats reading files. Use `rg --files -g "*.py" backend/app/ml`
to see structure before opening anything.

**Reading files:** request specific line ranges when you know roughly where the code is. Read a whole
file only when you're about to substantially rewrite it.

**Writing:** prefer targeted edits over rewriting whole files. Do not echo file contents back to the
user after writing them — say what changed in one line.

**Verifying:** run the test suite. Do not re-read files to check your own edits landed.

**Delegating:** for a self-contained chunk with a crisp definition of done — "write tests for
`ml/finance.py` against the cases in DATA_CONTRACT" — spawn a subagent so the exploration happens in
its context, not yours.

**Reporting:** keep responses short. No summaries of code you just wrote, no restating the plan, no
"here's what I did" recaps longer than three lines.

## Quality gates

Before declaring any phase complete, all of these must pass:

```bash
cd backend  && uv run ruff check . && uv run mypy app/ml app/services && uv run pytest -q
cd frontend && pnpm lint && pnpm typecheck && pnpm test
```

If a gate fails, fix it in the same session. Never hand the user a red build.

## Things that will get flagged in review

- Business logic in a router.
- A transform fitted outside a `Pipeline`.
- A financial figure produced by, or passed through, the LLM.
- `except Exception: pass`, or a bare `except`.
- A new dependency added without saying why.
- `any` in TypeScript, or `# type: ignore` without a reason comment.
- Mock data left in a component after the real endpoint exists.
- A test that asserts nothing meaningful (`assert result is not None` as the only assertion).
- Secrets, API keys, or dataset rows committed to the repo.

## When you're stuck or the spec is wrong

Say so. If a phase's design turns out to be infeasible or a better approach exists, stop and propose
the change rather than silently deviating. Record accepted deviations in `docs/DECISIONS.md` as a
dated one-paragraph entry.
