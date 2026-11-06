---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 01
subsystem: payments
tags: [migration, payment-state, cash-guarantee, cancellation-policy, supabase, deny-all-rls]
requires:
  - phase: 88-card-on-file-scheduled-holds
    provides: apply_payment_transition with the 086 status gate, payment ledger, card_flow_mode
provides:
  - payment state cash_settled, ledger kinds fee_opened / cash_settled / cash_reopened, consent mode cash_setup
  - pricing_globals cancellation settings (km threshold, three free-hour windows, fee percent) and card_flow_mode allowing on
  - bookings.cancel_policy_version, cancel_policy, fee_case_status
  - deny-all tables booking_fee_cases, booking_manage_tokens, booking_payment_notes
  - trigger booking_fee_cases_sync_status
affects: [89-02, 89-03, 89-04, 89-05, 89-06, 89-07, 89-08, 89-17]
tech-stack:
  added: []
  patterns:
    - "fee cases, tokens and operator notes live in deny-all tables, never in bookings columns (Pitfall 11)"
    - "vocabulary parity: SQL CHECK == lib/payments/state.ts == fake DB, pinned by tests/payments-state.test.ts"
key-files:
  created:
    - supabase/migrations/087_cancellation_cash_fee.sql
    - tests/payments-migration-087.test.ts
    - .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-01-smoke.sql
  modified:
    - lib/payments/state.ts
    - components/admin/PaymentStateBadge.tsx
    - tests/helpers/fake-payments-db.ts
    - tests/payments-state.test.ts
    - tests/admin-payment-api.test.ts
    - tests/PaymentPanel.test.tsx
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
key-decisions:
  - "TRANSITIONS: card_saved and failed may go to cash_settled (D-21); cash_settled goes back to card_saved only (D-22); released and captured stay terminal"
  - "apply_payment_transition is replaced with CREATE OR REPLACE (same six-argument signature), not DROP + CREATE, so the 086 grants survive; the REVOKE / GRANT pair is repeated anyway"
  - "claim_due_payment_work is untouched: its card_hold filter is the guarantee that no hold is placed on a cash booking"
  - "The generated name of the inline consent mode CHECK is booking_payment_consents_mode_check (Postgres default table_column_check); the smoke lists real names so the orchestrator can confirm"
status: complete
completed: 2026-11-06
duration: ~25 min
commits: 2
plan_head_before: a6e076f163b99ea4d534892128d2044363cf0fc1
plan_head_after: 2be81ca09a70c0cb9204ff2bd30cef69235d5c42
actuals:
  tokens: 18500
  tasks: 2
  commits: 2
---

# Phase 89 Plan 01: Migration 087, payment vocabulary, D-16 amendments Summary

**Migration 087 widens the payment vocabulary with cash_settled, adds the five cancellation settings, the policy snapshot columns, three deny-all fee / token / note tables and a status mirror trigger; the same vocabulary is pinned across SQL, TypeScript and the fake DB.**

Status: tasks 1 and 2 DONE and committed. Task 3 was applied by the orchestrator through the Supabase MCP. The executor has no Supabase MCP.

## Tasks

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 (tracer) | cash_settled through the 087 CHECK, state.ts and applyTransition on the fake DB, parity test | done | 23a43f85 |
| 2 | complete 087, text contract, smoke SQL, D-16 / D-14 amendments | done | 2be81ca0 |
| 3 | [BLOCKING] apply 087 via Supabase MCP and run the live smoke | DONE (orchestrator) | none |

Tracer verified end to end: `tests/payments-state.test.ts` drives `applyTransition` on the fake DB through card_saved -> cash_settled -> card_saved with one ledger row each (and failed -> cash_settled), and the parity tests compare PAYMENT_STATES and LEDGER_KINDS with the latest CHECKs in the migrations. No expansion happened on a failing foundation.

## What changed

- `supabase/migrations/087_cancellation_cash_fee.sql` (new, 10 sections): `bookings_payment_state_check` + `cash_settled`; `booking_payment_events_kind_check` + `fee_opened`, `cash_settled`, `cash_reopened`; full copy of `apply_payment_transition` with the 086 `p_require_status` gate word for word and `cash_settled` in `v_states`, REVOKE FROM PUBLIC, anon, authenticated and GRANT to service_role repeated for the six-argument signature; `pricing_globals` columns `cancel_free_km_threshold` (100, 1..1000), `cancel_free_hours_short` (1), `cancel_free_hours_long` (12), `cancel_free_hours_hourly` (12) (each 0..72), `cancel_fee_percent` (100, 1..100), table CHECK long >= short; `card_flow_mode` CHECK widened to off / canary / on with no UPDATE of the stored value; `booking_payment_consents_mode_check` + `cash_setup`; `bookings.cancel_policy_version`, `cancel_policy`, `fee_case_status` (+ partial index on pending); tables `booking_fee_cases`, `booking_manage_tokens`, `booking_payment_notes`, each with REVOKE ALL FROM anon, authenticated, RLS on and deny select / insert policies; `booking_fee_cases_sync_status()` SECURITY DEFINER with EXECUTE revoked from PUBLIC, anon, authenticated and an AFTER INSERT OR UPDATE OF status trigger.
- `lib/payments/state.ts`: `cash_settled` state, three kinds, TRANSITIONS as above, terminal-state comment updated.
- `components/admin/PaymentStateBadge.tsx`: `cash_settled` -> "Paid in cash", family ok (mode-aware labels come in 89-17).
- `tests/helpers/fake-payments-db.ts`: vocabulary, the three tables with their CHECKs and the status mirror, the new `pricing_globals` defaults, new bookings column defaults.
- `tests/payments-migration-087.test.ts` (new, 32 tests): text contract for every object and bound above, plus the fake DB behaviour.
- `.planning/.../89-01-smoke.sql`: statement A lists settings, real constraint names, columns, table RLS / privileges, policies, function grants, every trigger on `bookings` and the mirror trigger; statement B is a rolled-back DO block (settle / reopen, 086 gate still live, fee_opened kind, mirror on insert and update, decided > base refused, short token refused, fee percent 101 refused, card_flow_mode on accepted) that ends in `SMOKE_OK`.
- `.planning/REQUIREMENTS.md` (CANC-02, CASH-03) and `.planning/ROADMAP.md` (line 24, line 35, Phase 89 Goal, criteria 2 and 4, Legal checkpoint paragraph) now record the owner's D-16 decision and "any amount up to 100%" (D-14). No other ROADMAP line changed; STATE.md untouched.

Research A12 (no bookings trigger may fire on `fee_case_status`) was checked statically: `bookings_gcal_sync` (063), `bookings_lead_outbox` (067), `bookings_crm_sync` (069), `bookings_status_log` (084) are all column-listed (UPDATE OF ...) without `fee_case_status`. The live check is part of the orchestrator task.

## Deviations from Plan

**1. [Rule 3 - Blocking] Two existing tests enumerate every payment state**
- **Found during:** Task 2 full run of payment tests
- **Issue:** `tests/admin-payment-api.test.ts` (action matrix EXPECTED / CLOSED) and `tests/PaymentPanel.test.tsx` (badge label list) iterate PAYMENT_STATES / PAYMENT_STATE_BADGE and failed once `cash_settled` existed.
- **Fix:** added `cash_settled` rows (no actions for a card_hold booking, label "Paid in cash"). No production behaviour of `allowedPaymentActions` changed; plan 89-17 owns the cash actions.
- **Files modified:** tests/admin-payment-api.test.ts, tests/PaymentPanel.test.tsx
- **Commit:** 2be81ca0

Otherwise the plan was executed as written.

## Orchestrator task (PENDING)

1. Apply `supabase/migrations/087_cancellation_cash_fee.sql` to project `enakcryrtxlnjvjutfpv` with `apply_migration`.
2. Run statement A of `89-01-smoke.sql`. Expect the five settings 100 / 1 / 12 / 12 / 100, `card_flow_mode` equal to its value before the apply (not changed by 087), three tables with `rls_enabled=true anon_priv=false authenticated_priv=false`, deny policies, `public_exec=false anon_exec=false authenticated_exec=false` for both functions, and confirm none of the listed `bookings` triggers fires on `fee_case_status`.
3. Run statement B. It must FAIL with `SMOKE_OK all checks passed` (rolled back); any `SMOKE_FAIL` is a failure.
4. Record the migration name returned by the MCP and the smoke output here. 087 must be live before any code from plans 89-02 onward that needs it merges.

Live smoke output: applied by the orchestrator 2026-11-06 as 087_cancellation_cash_fee; statement B ended with SMOKE_OK all checks passed; card_flow_mode stayed canary, no leftovers, no new advisors.

## Verification run (worktree)

- `npx vitest run tests/payments-*.test.ts tests/admin-payment-api.test.ts tests/PaymentPanel.test.tsx tests/payment-state-writers-gate.test.ts tests/status-writers-gate.test.ts tests/booking-status-parity.test.ts`: all green (payments-state 43 with parity, 087 text contract 32).
- `npx tsc --noEmit`: no errors in lib/, components/, app/ or the payment test files.
- node_modules is a symlink to the main checkout; no next-intl server module failure appeared in these tests.
- Full suite and eslint were not run in this plan.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-89-01 deny-all tables, T-89-02 grants repeated, T-89-03 086 gate kept and tested). The new surface is database-only; no endpoint was added.

## Self-Check: PASSED

- supabase/migrations/087_cancellation_cash_fee.sql, tests/payments-migration-087.test.ts, 89-01-smoke.sql: FOUND
- commits 23a43f85 and 2be81ca0: FOUND on branch worktree-agent-a6ada0a98d82a55c1
