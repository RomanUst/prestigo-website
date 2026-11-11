---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 01
subsystem: database
tags: [supabase, migration, rls, erasure, payments-ledger, stops, extra-charges]
requires: []
provides:
  - "public.booking_stops (deny-all, position 1..5, 15-minute waits, price snapshot)"
  - "bookings.landing_date / landing_time / pickup_offset_min (all-or-none CHECK)"
  - "pricing_config.waiting_rate_per_15min (nullable, no default)"
  - "public.booking_extra_charges (deny-all, one charging row per booking)"
  - "ledger kinds extra_charged, extra_failed in SQL, LEDGER_KINDS and the fake DB"
  - "erasure_anonymise_person / erasure_payment_open copies covering stops and extras"
affects: [91-02, 91-03, 91-14]
tech-stack:
  added: []
  patterns: ["deny-all table like booking_fee_cases", "full CREATE OR REPLACE copy of a definer function with REVOKE repeated"]
key-files:
  created:
    - supabase/migrations/089_stops_landing_extra_charges.sql
    - tests/migration-089.test.ts
    - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-01-smoke.sql
  modified:
    - lib/payments/state.ts
    - tests/helpers/fake-payments-db.ts
    - tests/erasure-payment-pii.test.ts
key-decisions:
  - "Landing columns use named CHECK constraints added with DROP CONSTRAINT IF EXISTS so a re-run is safe"
  - "Erasure copy keeps every 088 statement; new counts go in a separate v_counts statement so the 088 chunks stay intact"
  - "Smoke ends in RAISE EXCEPTION 'SMOKE_OK_91_01' (rollback by exception, the Phase 89 smoke style)"
status: complete
commits: 2
plan_head_before: 314895a9cdde2df330b014c5c854c544aebba44d
plan_head_after: df2b5beb8f31b58e682c876ed65e876dc27a11f3
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
---

# Phase 91 Plan 01: Schema for stops, landing time, waiting rate and extra charges Summary

Migration 089 adds the booking_stops and booking_extra_charges deny-all tables, the landing columns, the per-class waiting rate column (no default, D-05) and the two new ledger kinds, with erasure covering the new personal data. The `commits` figure counts the two task commits; this SUMMARY is committed after them.

## Tasks

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 (tracer) | 089 booking_stops, landing columns, waiting-rate column + text test | done | f477287b |
| 2 | booking_extra_charges, ledger kinds, erasure copies, LEDGER_KINDS, fake DB, smoke file | done | df2b5beb |
| 3 | [BLOCKING] apply 089 live and run the rolled-back smoke | PENDING - orchestrator applies via Supabase MCP | - |

## Task 3: PENDING - orchestrator applies via Supabase MCP

Executors have no Supabase access. The orchestrator does:

1. `apply_migration` on project `enakcryrtxlnjvjutfpv`, name `089_stops_landing_extra_charges`, file `supabase/migrations/089_stops_landing_extra_charges.sql`.
2. `execute_sql` with statement A of `.planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-01-smoke.sql` (catalog listing), then statement B (the DO block).

Expected result:
- A: `tables` rows booking_stops and booking_extra_charges with `rls_enabled=true anon_priv=false authenticated_priv=false`; four `*_no_public_*` policies (SELECT / INSERT, false); `indexes` shows `booking_extra_charges_one_charging` UNIQUE ... WHERE (status = 'charging'); `function_grants` for erasure_anonymise_person(uuid) and erasure_payment_open(uuid[]) all `public_exec=false anon_exec=false authenticated_exec=false`; `waiting_rates rows_with_rate = 0`; the `booking_payment_events_kind_check` definition ends with `'cash_reopened', 'extra_charged', 'extra_failed'`.
- B: the run fails with exactly `SMOKE_OK_91_01 every 089 check passed; this exception rolls the smoke rows back`. Any `SMOKE_FAIL ...` message is a failure of 089. Nothing persists.

The SUMMARY quote of "089 live" and the has_function_privilege rows is the orchestrator's to add after the run.

## Verification (executor side)

- `npx vitest run tests/migration-089.test.ts tests/payments-state.test.ts tests/payments-migration-085.test.ts tests/payments-migration-087.test.ts tests/erasure-payment-pii.test.ts tests/erasure-migration.test.ts`: 197 passed.
- Related suites (webhook isolation, writers gate, cash, policy lifecycle, admin fee / payment routes): 382 passed.
- `npx tsc --noEmit`: only the 8 baseline errors in tests/ (nav-auth, i18n-translate-dnt, passenger-actions). ESLint on the changed files: clean.
- Smoke file 8360 bytes (< 12000).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tests/erasure-payment-pii.test.ts asserted the 088 body equals the latest erasure_anonymise_person**
- **Found during:** Task 2 (re-creating the function in 089 makes 089 the latest definition)
- **Issue:** The test "is the 088 definition (the last one in filename order)" compared the latest body to the 088 text byte for byte, so any later copy broke it.
- **Fix:** It now asserts the latest body equals the 089 copy and still contains every statement of the 088 body.
- **Files modified:** tests/erasure-payment-pii.test.ts
- **Commit:** df2b5beb

**2. [Rule 1 - Bug in own test] "never mentions pickup_utc" also matched the erasure_payment_open copy**
- **Issue:** the 088 request guard legitimately reads the generated pickup column; the Task 1 test banned the word everywhere.
- **Fix:** the test checks the schema part (before the function copies) for any mention, and the whole file for any write or ALTER on it.
- **Commit:** df2b5beb

### Smoke style
The plan sketched BEGIN ... ROLLBACK; the orchestrator brief asked for an exact `SMOKE_OK_*` exception, so the DO block rolls back by raising it (the word ROLLBACK appears in the file's comments only).

## Known Stubs
None.

## Threat Flags
None beyond the plan's register (T-91-01..T-91-04 mitigated in 089 and its tests; live proof pending in Task 3).

## Self-Check: PASSED
- supabase/migrations/089_stops_landing_extra_charges.sql, tests/migration-089.test.ts, 91-01-smoke.sql: found.
- Commits f477287b and df2b5beb: found on branch worktree-agent-a642381949d173921.
