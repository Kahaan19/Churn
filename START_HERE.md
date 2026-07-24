# Start Here

## Setup

1. `mkdir crip && cd crip && git init`
2. Copy `CLAUDE.md` to the repo root and the `docs/` folder alongside it.
3. Download the IBM Telco Customer Churn CSV to `data/telco.csv` (gitignored).
4. Run `claude` in the repo root.

## Session 0 — kickoff prompt

Paste this exactly:

> Read `CLAUDE.md`, `docs/AGENT_PLAYBOOK.md`, and the Phase 0 section of `docs/BUILD_PLAN.md`.
> Do not read the other phases.
>
> Then: give me a 5–10 bullet plan for Phase 0 and list anything in the spec that is ambiguous,
> contradictory, or that you'd push back on. Wait for my go-ahead before writing code.

Answer its questions, then say "proceed". When it finishes, verify the acceptance criteria yourself,
then `/clear`.

## Every subsequent session

> Read the Phase N section of `docs/BUILD_PLAN.md` and the docs it lists under "Reads". Do not read
> other phases. Plan first, then build. Run all quality gates before telling me you're done.

## Between phases, always

- Check the phase's "Done when" line against the running app yourself. Don't take its word for it.
- Run the gates in a terminal it doesn't control.
- `git log --oneline` — one clean commit per logical change.
- Mark the phase `[x]` in `BUILD_PLAN.md`.
- `/clear`.

## Useful mid-session prompts

| Situation | Prompt |
|---|---|
| It's drifting off spec | "Re-read the acceptance criteria for this phase. Which are not met?" |
| It's over-engineering | "What in this could be deleted without failing the acceptance criteria? Delete it." |
| Before a big refactor | "Show me the plan and the files you'll touch. Don't edit yet." |
| Context feels heavy | "Summarise state in 10 lines, commit, and tell me what to say in the next session." |
| Tests look thin | "Which of these tests would still pass if the function returned a constant? Fix those." |
| Suspicious success | "Show me the actual command output that proves this works." |

## Guarding the things that will silently break

Check these yourself; they're the failures that pass tests but ruin the project.

- **Leakage.** Ask for proof the scaler/encoder was fitted on train only. `pipeline.named_steps`
  inspection, not a claim in prose.
- **Calibration.** The reliability curve should track the diagonal. If it's a hockey stick, the
  financial numbers are fiction.
- **Test set reuse.** If test metrics move between sessions, something is tuning on test.
- **LLM arithmetic.** Pick a customer, read the recommendation, and check every figure in it appears
  verbatim in the API's `financials` object. One invented number means the guard is broken.
- **Thresholds.** If anything still uses 0.5, the EV threshold work didn't land.

## Cost control

- One phase per session, `/clear` between. This is the single biggest lever.
- Never paste dataset contents, logs, or stack traces longer than 30 lines — point at a file instead.
- If it starts reading `data/` or `artifacts/`, stop it immediately; those rules are in `CLAUDE.md`
  but a long session can drift.
- Use a subagent for well-bounded work (writing the finance tests, generating the API client).
- Phases 0, 1, 6, and 8 are mechanical — a cheaper model handles them fine. Keep the strong model for
  2, 3, 4, and 7, where the ML correctness and the LLM boundary live.
