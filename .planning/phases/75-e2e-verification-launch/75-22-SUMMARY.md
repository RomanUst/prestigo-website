---
phase: 75-e2e-verification-launch
plan: 22
subsystem: e2e-qa
status: skipped
tags: [gap-closure, e2e, account-path, VER-01, deferred]
requires: []
provides: []
affects:
  - "75-30 (GAP-1 row = SKIPPED / open; WINDOWS #25 stays open; VER-01 stays Pending)"
key-files:
  created: []
  modified: []
decisions:
  - "USER DECISION 2026-09-27: skip the RU/AR signed-in account-path E2E run (\"пропускаем\") — GAP-1 is recorded as known debt, not closed"
metrics:
  duration: "0 (not executed)"
  completed: 2026-09-27
---

# Plan 75-22: SKIPPED by user decision — GAP-1 stays open

## What happened

Task 1 (checkpoint:human-action, blocking-human) required the user to create a production E2E test account and the git-ignored `scripts/qa/.e2e-account.json` credentials file. The orchestrator confirmed the path is git-ignored (`git check-ignore` exit 0), but the file was never created.

Claude may not create production accounts or sign in with passwords on the user's behalf, so it could not do this step itself. The user then chose to **skip** the plan on 2026-09-27.

Tasks 2–4 were not executed:
- the RU and AR signed-in "My trips" and booking runs via `scripts/qa/booking_e2e.py`;
- evidence capture;
- the strict-marker cleanup.

No production rows were created, so no cleanup is needed.

## Consequences for the phase

- **GAP-1** (ROADMAP SC #2, D-04): the RU/AR signed-in account path is still **unproven on production**. It is recorded as known debt.
- **WINDOWS #25** stays open.
- **VER-01** stays **Pending**. 75-30 marks VER-01 complete only if all four gaps pass, and GAP-1 does not.
- **75-30** must carry GAP-1 into the per-gap table as `SKIPPED (user decision) — open` and list it under "Remaining gaps" and in `deferred-items.md`.

## How to close later

1. The user creates the account and the credentials file (see 75-22-PLAN.md Task 1).
2. Re-run this plan with `/gsd-execute-phase 75 --gaps-only` after deleting this SUMMARY, or run `python3 scripts/qa/booking_e2e.py` for ru and ar directly and do the Task 4 cleanup.

## Self-Check: SKIPPED (not failed)
