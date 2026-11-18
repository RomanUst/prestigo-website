---
phase: 93-day-trips-custom-tours
plan: 28
subsystem: testing
tags: [tours, e2e, vitest, card-checkout, tracer]
requires:
  - phase: 93-day-trips-custom-tours
    provides: tour store, pricing, checkout query, init/intent tour branch, confirmation snapshot, tour emails (93-05..93-19)
provides:
  - end-to-end proof of the tour booking path on the fake payments DB
affects: [93-28 Task 2 and Task 3 (owner and orchestrator checkpoints)]
tech-stack:
  added: []
  patterns: [one-walk e2e over real route handlers with only the outside world doubled]
key-files:
  created: [tests/phase93-tours-e2e.test.ts]
  modified: []
key-decisions:
  - "The airport refusal is asserted at both gates: init answers AIRPORT_PICKUP, and the intent answers 422 with code AIRPORT_PICKUP and stores nothing"
patterns-established:
  - "Phase e2e for tours: page data fixture -> box href -> parse -> init -> intent -> snapshot -> emails"
requirements-completed: []
status: checkpoint
completed: 2026-11-18
commits: 1
plan_head_before: fc476e1b98ec512d88e9347d561c05a39686419c
actuals:
  tokens: 9000
  tasks: 1
  commits: 1
---

# Phase 93 Plan 28: Tour e2e proof and launch Summary (partial, Task 1 done)

**One end-to-end test walks a Dresden tour from its page data through the box checkout URL, init, intent, the confirmation snapshot and the client and operator emails, in card, cash and airport-refusal cases.**

## Status

Task 1 (tracer) is complete and committed. Tasks 2 (owner price approval, D-21) and 3 (live seed, publish, EspoCRM sync, PR 1 merge, live proofs) are owner and orchestrator checkpoints and were NOT started. Nothing in this summary records a price approval, a seed, a sync, a merge or a live result.

## Task 1: tour end-to-end test and quality gate

Commit: 5faee79d `test(93-28): end-to-end tour booking test (card, cash, airport refusal)`

`tests/phase93-tours-e2e.test.ts` (3 tests, all pass):

- **card**: tour page data -> `buildTourCheckoutHref` -> `parseTourCheckoutQuery` -> init (eligible, setup mode, tour policy 36 h / 100 %, server amount) -> intent (card setup, nothing charged, unpaid `card_hold` row with `trip_type tour`, `tour_id`, `tour_title`, `tour_extra_hours 1`, `hours 9`, `tour-` policy snapshot enforcing the settings hours, consent row) -> `writeTourConfirmation` / `readTourConfirmation` (another reference reads null) -> client confirmation (Day trip, Time at the destination, Pickup and return, no Route row), operator alert and the Google Calendar link (title and 9 h span).
- **cash**: the same walk stores a `cash_guarantee` row with the same tour columns and a `tour-` snapshot; no PaymentIntent.
- **airport**: init answers `AIRPORT_PICKUP`; an intent posted anyway answers 422 `AIRPORT_PICKUP`, stores no booking, creates no SetupIntent.

Only the outside world is doubled (Stripe, in-memory payments DB, tour store, tariffs, rate limiter, Resend, route distance, sessionStorage). The init and intent routes, tour pricing, the checkout query, the confirmation snapshot and the email builders are real.

### Quality gate (hand-run; `.claude/skills/verify` is absent in worktrees)

| Check | Result |
|-------|--------|
| `npx vitest run --exclude '.claude/**' tests/phase93-tours-e2e.test.ts` | 3 passed |
| `npx tsc --noEmit` | 8 errors, all in `tests/` (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1) = baseline; none in app/lib/components |
| `npx eslint --quiet tests/phase93-tours-e2e.test.ts` | clean |
| `€` / secrets / `.env` in the diff | none (diff is one test file) |
| Full suite `npx vitest run --exclude '.claude/**'` | 494 files passed, 15905 tests passed; 9 files not passing in this worktree, see below |

### Full-suite non-passes (environment, not code)

- 8 files (`account-trips`, `auth-customer`, `login-actions`, `manage-actions`, `manage-page`, `passenger-actions`, `profile-actions`, `quote-page`) fail to LOAD: `Cannot find module '/@fs/Users/romanustyugov/Desktop/Prestigo/node_modules/next-intl/dist/esm/development/server.react-server.js'`. The file exists in the main checkout's `node_modules`; Vite's `/@fs` resolution of the symlinked `node_modules` fails inside the worktree for the `next-intl/server` react-server condition. They are untouched by this plan and passed on the main checkout at the same base commit (orchestrator note), so this is a worktree-symlink artefact. Re-run them on the main checkout / merged branch to close it.
- `tests/quote-builder.test.tsx` failed 2 tests under full parallel load (known timeout under load); it passes alone in the worktree (31/31).

## Deviations from Plan

None - plan executed as written for Task 1. (Test-only; no source file touched.)

## Known Stubs

None.

## Open for the orchestrator and owner

- Task 2: run `npx tsx scripts/seed-tours.ts --dry-run`, show the price table, record the owner's D-21 answer here.
- Task 3: seed `--apply`, publish approved slugs, `node infra/espocrm/sync.mjs`, open PR 1, deploy checks (8 x 6 curl table), two canary bookings, e-mail and font checks. Precondition: 93-01-SUMMARY.md contains "092 live".
- Re-run the 8 environment-blocked test files on the main checkout before the PR.

## Self-Check: PASSED

- FOUND: tests/phase93-tours-e2e.test.ts
- FOUND: commit 5faee79d
