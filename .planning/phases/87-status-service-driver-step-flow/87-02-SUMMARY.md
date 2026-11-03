---
phase: 87-status-service-driver-step-flow
plan: 02
subsystem: database, booking-status
tags: [postgres, supabase, migration, compare-and-set, audit-log, status-vocabulary]
status: checkpoint
requires: []
provides:
  - lib/booking-status.ts single TS status vocabulary and driver step map
  - migration 084 (statuses on_board/no_show, status log + trigger, advance_booking_status, set_no_show_request, no-show settings)
  - tripLinkViewState and declined-aware isTripLinkValid
affects: [87-03, 87-04, 87-05, 87-06, 87-07, 87-08, 87-09, 88, 89, 91]
tech-stack:
  added: []
  patterns:
    - "CAS in one transaction: UPDATE ... WHERE id AND status = p_from inside a SECURITY DEFINER RPC"
    - "status log written by an AFTER UPDATE OF status trigger fed by transaction-local prestigo.* settings"
    - "tests/helpers/latest-migration.ts: answer from the LAST CREATE OR REPLACE / CHECK in filename order"
key-files:
  created:
    - lib/booking-status.ts
    - supabase/migrations/084_booking_statuses_status_log.sql
    - tests/helpers/latest-migration.ts
    - tests/booking-status.test.ts
    - tests/booking-status-migration.test.ts
    - .planning/phases/87-status-service-driver-step-flow/87-02-smoke.sql
  modified:
    - lib/booking-transitions.ts
    - lib/trip-token.ts
    - tests/driver-trip.test.ts
key-decisions:
  - "advance_booking_status reads p_patch directly (NULL ? 'k' is NULL, so a NULL patch keeps every column); only operator_notes, driver_price_czk, driver_id, clear_payment_link are honoured"
  - "completed_at is set only when p_to = completed AND the old status is not completed, so a replayed completed -> completed never moves the timestamp"
  - "The RPC resets prestigo.actor_type/actor_id/source after its UPDATE so a later legacy write in the same transaction is logged as system"
  - "FOUND is captured into v_applied right after the UPDATE because the following PERFORM set_config calls overwrite FOUND"
patterns-established:
  - "Migration redefining a function: copy the latest body verbatim (extracted programmatically from 080/081), change only the status list, re-REVOKE/GRANT"
requirements-completed: []
duration: ~35 min
completed: 2026-11-03
commits: 2
plan_head_before: 06cde60d218f62e16ab791454f4f7e00f8c66ca1
plan_head_after: f737b15b092b7c708e248fbf044f0ef6a2254ab6
actuals:
  tokens: 17000
  tasks: 2
  commits: 2
---

# Phase 87 Plan 02: Status vocabulary and migration 084 Summary

Tasks 1-2 are done and committed; Task 3 (the live apply of migration 084 and its smoke) was run by the orchestrator via Supabase MCP on 2026-11-03: 084 is live.

One status vocabulary in TypeScript (`lib/booking-status.ts`, 10 statuses) held equal to the newest `bookings_status_check` by a parity test, plus migration 084 with the status log, trigger, compare-and-set RPC, no-show RPC and settings, and a self-rolling-back live smoke.

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 (tracer) | 084 status CHECK -> lib/booking-status.ts -> VALID_TRANSITIONS -> trip-link terminal set, one parity test | done | adb6eb54 |
| 2 | Complete 084 (log + trigger, CAS RPC, no-show RPC + settings, redefined lead/gcal/panel/stats), text contract test, live smoke script | done | f737b15b |
| 3 | [BLOCKING] orchestrator applies 084 live and runs the smoke | DONE (orchestrator, Supabase MCP, 2026-11-03) | live migration 20261103134654 |

## What was built

- `lib/booking-status.ts`: `BOOKING_STATUSES` (unpaid, pending, confirmed, completed, cancelled, assigned, en_route, on_location, on_board, no_show), terminal / revenue / calendar-active sets, labels, `DRIVER_STEPS` with target / label / trip_progress maps (`on_site` -> `on_location`, mirror value `arrived`), `nextStepFor`, `isPartnerBooking`, `assertMoneyEligible`, `PartnerBookingMoneyError`.
- `lib/booking-transitions.ts`: `on_location` -> completed, cancelled, on_board, no_show; `on_board` -> completed, cancelled; `no_show` terminal.
- `lib/trip-token.ts`: `TERMINAL_STATUSES` derived from `TERMINAL_BOOKING_STATUSES` (completed, cancelled, no_show); `isTripLinkValid` refuses declined assignments; `tripLinkViewState` returns active / completed / ended.
- `supabase/migrations/084_booking_statuses_status_log.sql` (12 sections): CHECK with 10 values; `bookings.completed_at`, `bookings.no_show_requested_at`; `booking_status_log` (RLS deny-all, REVOKE ALL, (booking_id, created_at) index, partial unique `booking_status_log_one_completed`); `log_booking_status_change()` + trigger `bookings_status_log`; `advance_booking_status`; `set_no_show_request`; `pricing_globals.noshow_wait_city_min` (30) / `noshow_wait_airport_min` (60) with CHECK 1..240; `booking_lead_status`, `notify_booking_gcal_sync`, `panel_bookings`, `stats_trips` redefined (the last two copied verbatim from 080/081 by script, only the status value list changed); REVOKE/GRANT block for all seven functions.
- `tests/helpers/latest-migration.ts`: `latestFunctionBody`, `latestStatusCheckValues`, `loadMigration`.
- Tests: `tests/booking-status.test.ts` (vocabulary, step map, transitions parity, partner predicate), `tests/booking-status-migration.test.ts` (084 text contract + smoke file shape), extended `tests/driver-trip.test.ts` (no_show terminal, declined, `tripLinkViewState`).
- `.planning/phases/87-status-service-driver-step-flow/87-02-smoke.sql`: one DO block, ends in a forced exception so everything rolls back.

## Verification run (worktree)

- `npx vitest run tests/booking-status.test.ts tests/booking-status-migration.test.ts tests/driver-trip.test.ts tests/panel-bookings-migration.test.ts`: green (76 + 47 tests across the first runs); 10 other migration / lead / identity / chat test files (444 tests) also green; gnet-status-push, admin-assignment, admin-bookings-payment-link, driver-trip-progress, espocrm-booking-map green.
- Scoped `npx tsc --noEmit` for lib/booking-*, lib/trip-token, tests/helpers, tests/booking-status*: no errors. `npx eslint --quiet` on the touched files: clean.
- Environment note: `tests/stats-migration.test.ts` and `tests/stats-customers-b2b-migration.test.ts` fail in this worktree only with ENOENT on `.planning/phases/85-statistics/85-0x-smoke.sql` (the phase 85 directory is not tracked in this worktree). They read only 081/082, which 084 does not touch; the orchestrator should re-run them on the main checkout. node_modules was a symlink to the main checkout (not committed); no next-intl failure seen.

## Task 3: DONE (orchestrator, 2026-11-03)

Steps 1-7 of the plan are unchanged (apply_migration `084_booking_statuses_status_log`, run `87-02-smoke.sql`, CHECK definition, RLS + table privileges, function privilege matrix, defaults 30 / 60, security advisors). Outputs are to be recorded here by the orchestrator:

- preconditions: 080–083 live; live `panel_bookings`, `stats_trips`, `booking_lead_status`, `notify_booking_gcal_sync` bodies matched the repo (only the status lists differ in 084); `pricing_globals` id=1 present; booking columns present.
- apply_migration result: success (version 20261103134654); all 7 live function bodies md5-match the 084 file
- smoke error text: `P0001: SMOKE_OK all checks passed` (first run; rolled back, booking_status_log has 0 rows afterwards)
- `pg_get_constraintdef` of `bookings_status_check`: 10 values incl. `on_board`, `no_show`
- `relrowsecurity`, `has_table_privilege(anon, SELECT)`, `has_table_privilege(authenticated, INSERT)`: true / false / false
- function privilege matrix: all 7 functions anon=false, authenticated=false, service_role=true
- `noshow_wait_city_min`, `noshow_wait_airport_min`: 30 / 60
- advisors (security): no finding names booking_status_log, advance_booking_status or set_no_show_request (only pre-existing INFO/WARN items)
- resume signal: "084 live"

Do not start Wave 2 plans that write `on_board`, call the RPCs or read the new columns until "084 live" is recorded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FOUND overwritten by PERFORM in advance_booking_status**
- **Found during:** Task 2 (writing the RPC from the RESEARCH skeleton)
- **Issue:** The skeleton checks `IF NOT FOUND` after the UPDATE, but resetting the actor settings with `PERFORM set_config(...)` in between resets FOUND to true, so a lost compare-and-set would be reported as applied.
- **Fix:** capture `v_applied := FOUND` right after the UPDATE and test that.
- **Files modified:** supabase/migrations/084_booking_statuses_status_log.sql
- **Commit:** f737b15b

**2. [Rule 2 - Missing critical] completed_at must not move on a completed -> completed call; actor must not leak**
- **Found during:** Task 2
- **Issue:** The skeleton sets completed_at whenever `p_to = 'completed'`, which would overwrite the fact on a replayed call; the transaction-local actor settings would also label later legacy writes in the same transaction.
- **Fix:** guard `b.status IS DISTINCT FROM 'completed'`; reset the three `prestigo.*` settings after the UPDATE; the smoke covers both.
- **Commit:** f737b15b

Otherwise the plan was executed as written. `payment_link_url` / `payment_link_id` are cleared only when `clear_payment_link` is true (not merely present), a tightening of the skeleton.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-87-04 to T-87-08 are mitigated in 084 and pinned by the contract test; the live part of T-87-04 / T-87-06 is verified in Task 3).

## Notes for later plans

- Phase 88 must sweep `completed_at IS NOT NULL` rows as well as use the in-process completion signal; `completed_at` is NULL on historic completed rows (unknown, not not-completed).
- `notify_booking_gcal_sync` and `booking_lead_status` now have their live definition in 084; text tests must use `latestFunctionBody()` rather than 063 / 067.
- Still to change in code by later plans (not in this plan): `lib/lead-mapping.ts`, `lib/google-calendar.ts`, `lib/panel-bookings.ts`, `lib/chatwoot-mapping.ts`, `lib/customer-mapping.ts`, EspoCRM `booking-map.mjs` / `fields.json`, admin `KNOWN_STATUSES` / zod enum, `BookingsTable` labels (RESEARCH fan-out F5, F7, F9, F11-F18).

## Self-Check: PASSED

- FOUND: lib/booking-status.ts, supabase/migrations/084_booking_statuses_status_log.sql, tests/helpers/latest-migration.ts, tests/booking-status.test.ts, tests/booking-status-migration.test.ts, .planning/phases/87-status-service-driver-step-flow/87-02-smoke.sql
- FOUND commits: adb6eb54, f737b15b
- STATE.md and ROADMAP.md untouched.
