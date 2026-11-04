---
phase: 88-card-on-file-scheduled-holds
plan: 01
subsystem: payments
tags: [postgres, supabase, stripe, payment-state, ledger, rpc]
status: complete

requires:
  - phase: 87-status-service-driver-step-flow
    provides: advance_booking_status compare-and-set pattern, latest-migration test helpers, status-writers-gate pattern
provides:
  - "Migration 085 live: payment_mode / payment_state columns on bookings, booking_payment_events append-only ledger, booking_payment_consents, card-flow settings on pricing_globals"
  - "RPCs apply_payment_transition, append_payment_event, claim_due_payment_work (service_role only)"
  - "lib/payments/state.ts: the single payment_state writer (PAYMENT_STATES, PAYMENT_MODES, LEDGER_KINDS, TRANSITIONS, applyTransition, appendPaymentEvent, claimDueHolds)"
  - "tests/helpers/fake-payments-db.ts in-memory double of the three RPCs and the payment tables"
affects: [88-02, 88-03, 88-06, 88-17, phase-89, phase-91, phase-92]

plan_head_before: d7f9f6c1b9baac52e28c8333893ae4fbfb362c5d
plan_head_after: 496739d0ec330d0f1c00cecbb228dc98ba012a71

actuals:
  tokens: 40000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "CAS RPC + append-only ledger with (booking_id, event_key) exactly-once key"
    - "Duplicate event check before the compare-and-set, ON CONFLICT + sub-transaction rollback as race backstop"
    - "Writer gate test pinning one module as the only caller of the payment RPCs"

key-files:
  created:
    - supabase/migrations/085_payment_state_card_on_file.sql
    - lib/payments/state.ts
    - tests/helpers/fake-payments-db.ts
    - tests/payments-state.test.ts
    - tests/payments-migration-085.test.ts
    - tests/payment-state-writers-gate.test.ts
    - .planning/phases/88-card-on-file-scheduled-holds/88-01-smoke.sql
  modified:
    - tests/helpers/latest-migration.ts

key-decisions:
  - "payment_mode is the primary payment model (pay_now | card_hold | cash_guarantee | quote | partner); legacy pay-now is the pay_now variant, GNet rows backfilled to partner"
  - "11 payment states and 24 ledger kinds (refund_failed included)"
  - "Consent record stores text version, sha256, full rendered text, locale, amount, planned hold time, IP and user agent"
  - "card_flow_mode allows only off and canary until the Phase 89 legal gate (no 'on' value, a database invariant)"
  - "payment_intent_id is accepted by apply_payment_transition only when the target is captured or balance_due"

requirements-completed: [PAYF-01]

duration: n/a
completed: 2026-11-04
---

# Phase 88 Plan 01: Payment state model and single writer Summary

Migration 085 (payment columns, append-only money ledger, consent record, card-flow settings, three service_role-only RPCs) is live and smoke-tested, with `lib/payments/state.ts` as the only caller of those RPCs, pinned by parity, contract and writer-gate tests.

## Accomplishments

- **Tracer (Task 1):** the 085 CHECK lists, `PAYMENT_STATES` / `PAYMENT_MODES` / `TRANSITIONS` and `applyTransition()` are held together by a parity test (`latestCheckValues` in `tests/helpers/latest-migration.ts`). Commit e2288174.
- **Full schema (Task 2):** `booking_payment_events` (append-only trigger, RLS deny-all, no PII columns), `booking_payment_consents`, the `pricing_globals` settings, the three RPCs, the indexes and the REVOKE/GRANT block. A text contract test, the writer gate (D-05, D-09a), the fake DB and the rolled-back smoke script came with it. Commit 496739d0.
- **Live apply (Task 3):** the owner confirmed the schema and the orchestrator applied 085 and ran the smoke. Results are below.

## Task 3: owner decision and live apply

**Owner option:** `apply-as-written` (chosen in chat).

Orchestrator results on project `enakcryrtxlnjvjutfpv`, 2026-11-04:

1. `apply_migration` name `085_payment_state_card_on_file` (file content, comments stripped): `{"success":true}`.
2. Smoke `88-01-smoke.sql` via `execute_sql`: `ERROR: P0001: SMOKE_OK all checks passed` (whole block rolled back).
3. Constraint definition dump: not reported separately by the orchestrator. The smoke exercises the state CHECK, and the histogram in step 6 shows only valid payment_mode values.
4. Table security. RLS: `booking_payment_events` = true, `booking_payment_consents` = true. Privileges [anon SELECT, authenticated INSERT]: events [false, false], consents [false, false].
5. Function EXECUTE [anon, authenticated, service_role]:
   - `apply_payment_transition`: [false, false, true]
   - `append_payment_event`: [false, false, true]
   - `claim_due_payment_work`: [false, false, true]
6. `pricing_globals` id=1: `payment_hold_lead_hours` = 72, `card_flow_mode` = 'off', `card_flow_canary_emails` = `{}`. `payment_mode` histogram: pay_now = 78, partner = 6. `payment_state`: none = 84. Ledger rows: 0.
7. `get_advisors` (security): no finding names `booking_payment_events`, `booking_payment_consents` or the three RPCs (only pre-existing `rls_enabled_no_policy` INFO on unrelated tables and a leaked-password WARN).

Task 3 verify, `npx vitest run tests/payments-migration-085.test.ts`: 66 passed.

085 live.

## Verification (worktree)

- Six test files, 165 tests pass: payments-state, payments-migration-085, payment-state-writers-gate, status-writers-gate, booking-status-parity, booking-status-migration.
- `tsc --noEmit`: 8 errors, the tests/ baseline; none from the new files.
- eslint --quiet clean on the new files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate event check runs before the compare-and-set**
- **Found during:** Task 2 (writing apply_payment_transition)
- **Issue:** the plan detected duplicates only through the ledger INSERT conflict. A replay of `none -> checkout_pending` with `p_from=['none']` misses the CAS (state already moved) and would return `applied:false` without `duplicate:true`, contradicting the must-have and the smoke.
- **Fix:** after locking the booking row, the RPC checks whether `(booking_id, event_key)` exists and returns `{applied:false, duplicate:true, current_state}`. The plan's ON CONFLICT plus `P0D01` sub-transaction rollback stays as a race backstop.
- **Files modified:** supabase/migrations/085_payment_state_card_on_file.sql
- **Commit:** 496739d0

**2. [Rule 1 - Bug] NULL lease handling**
- **Issue:** `NOT (... AND payment_lease_until > now())` is NULL when the lease is NULL, which would exclude the row and block every first move into `capturing`.
- **Fix:** `COALESCE(b.payment_lease_until > now(), false)`.
- **Commit:** 496739d0

**3. Ledger kind CHECK is its own named constraint**
- `booking_payment_events_kind_check` is added via ALTER TABLE rather than inline, so `latestCheckValues` can pin `LEDGER_KINDS` and a later migration can widen it.

**4. Git-dir files not written**
- The sandbox refused writes into the git dir, so the `gsd-spawn-toplevel` sentinel and the `gsd-plan-head-before-88-01` ledger were not created. `commits:` and `plan_head_*` above were measured from the known base `d7f9f6c1` with `git rev-list --count` (2 task commits; the SUMMARY commit follows).

**5. Unique index on (setup_intent_id, leg) is plain**
- As specified. `bookings.leg` is always `outbound` or `return` in `lib/supabase.ts`, so NULL legs are not a concern.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-88-01..04 are mitigated (SECURITY DEFINER with empty search_path, REVOKE/GRANT matrix verified live, ? operator allow-list, append-only trigger, RLS deny-all). New personal data (consent IP and user agent) is not covered by the 075 erasure function: Phase 89 go-live blocker D-23, already recorded in the plan.

## Next Step

Wave 2 of Phase 88 can proceed: later plans import `lib/payments/state.ts` and test against `tests/helpers/fake-payments-db.ts`.

## Self-Check: PASSED

- FOUND: supabase/migrations/085_payment_state_card_on_file.sql, lib/payments/state.ts, tests/helpers/fake-payments-db.ts, tests/payments-state.test.ts, tests/payments-migration-085.test.ts, tests/payment-state-writers-gate.test.ts, .planning/phases/88-card-on-file-scheduled-holds/88-01-smoke.sql
- FOUND commits: e2288174, 496739d0
