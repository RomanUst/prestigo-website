---
phase: 23-database-schema-foundation
plan: 01
subsystem: database
tags: [postgres, supabase, sql, migration, plpgsql, round-trip, bookings]

# Dependency graph
requires: []
provides:
  - supabase/migrations/023_v14_schema_foundation.sql — complete v1.4 schema migration file
  - leg column on bookings (NOT NULL DEFAULT 'outbound', CHECK outbound/return)
  - composite UNIQUE(payment_intent_id, leg) on bookings
  - linked_booking_id UUID self-referential FK with ON DELETE SET NULL on bookings
  - outbound_amount_czk and return_amount_czk INTEGER columns on bookings
  - return_discount_pct NUMERIC(5,2) DEFAULT 10 column on pricing_globals
  - create_round_trip_bookings(p_outbound JSONB, p_return JSONB) PL/pgSQL RPC function
affects:
  - 24-webhook-handler
  - 25-booking-form-ui
  - 26-admin-dashboard
  - 27-supabase-client
  - 28-partial-cancel

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PL/pgSQL atomic two-row insert via RPC — inserts outbound + return in single transaction, cross-links via UPDATE after both IDs available
    - Composite UNIQUE(payment_intent_id, leg) — preserves webhook idempotency for round-trip; two rows per PI allowed when legs differ

key-files:
  created:
    - supabase/migrations/023_v14_schema_foundation.sql
  modified: []

key-decisions:
  - "Composite UNIQUE(payment_intent_id, leg) replaces single-column UNIQUE — allows two rows per Stripe PaymentIntent for round-trip while blocking true duplicates"
  - "linked_booking_id uses ON DELETE SET NULL not CASCADE — cancelling one leg must not delete the partner leg"
  - "leg column DEFAULT 'outbound' auto-backfills all existing rows — no explicit UPDATE required"
  - "create_round_trip_bookings RPC uses SELECT...RETURNING pattern (not VALUES) consistent with research code examples"

patterns-established:
  - "Pattern: Atomic cross-linked pair insert — INSERT outbound RETURNING id, INSERT return with linked_booking_id = v_outbound_id RETURNING id, UPDATE outbound SET linked_booking_id = v_return_id"

requirements-completed:
  - RTPM-02
  - RTPM-03

# Metrics
duration: 5min
completed: 2026-04-04
---

# Phase 23 Plan 01: Database Schema Foundation Summary

**SQL migration file with 6 schema steps: leg column, composite UNIQUE, self-referential FK, per-leg amount columns, return_discount_pct, and atomic create_round_trip_bookings PL/pgSQL RPC**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-04T18:11:49Z
- **Completed:** 2026-04-04T18:13:30Z
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint — awaiting DB apply)
- **Files modified:** 1

## Accomplishments

- Created `supabase/migrations/023_v14_schema_foundation.sql` with all 6 required schema steps
- Verified all acceptance criteria pass (file content grep checks)
- Confirmed existing 13-test Vitest suite remains green (tests mock saveBooking, unaffected by schema DDL)
- Migration ready for manual apply via Supabase Dashboard SQL Editor

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the v1.4 schema migration SQL file** - `a5fdfb0` (feat)

**Plan metadata:** pending (awaiting checkpoint completion)

## Files Created/Modified

- `supabase/migrations/023_v14_schema_foundation.sql` - Complete v1.4 schema migration: leg column, composite UNIQUE, linked_booking_id FK, per-leg amounts, return discount config, atomic RPC

## Decisions Made

- Used `IF NOT EXISTS` on all `ADD COLUMN` statements for idempotency
- Used `IF EXISTS` on `DROP CONSTRAINT` as safety net in case constraint name differs
- Migration file follows existing project convention (comment header, numbered step comments)
- RPC function uses `SELECT ... RETURNING` pattern (not VALUES syntax) matching the research code examples

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Node version conflict: system node (v12/v16) too old for vitest. Resolved by using `nvm use v22.22.1` — Vitest ran successfully with all 13 tests passing.

## User Setup Required

**Task 2 requires manual database migration.** Follow these steps in Supabase Dashboard:

1. **Before applying — verify constraint name:**
   ```sql
   SELECT constraint_name FROM information_schema.table_constraints
   WHERE table_name = 'bookings' AND constraint_type = 'UNIQUE';
   ```
   Expected: `bookings_payment_intent_id_key`. If different, update the DROP CONSTRAINT line in the migration file.

2. **Apply the migration:** Open Supabase Dashboard > SQL Editor, paste entire contents of `supabase/migrations/023_v14_schema_foundation.sql`, click Run.

3. **Verify success** using the 6 verification queries in Task 2 of the plan.

## Next Phase Readiness

- Phase 24 (webhook handler) requires all 6 schema changes applied to live DB
- Phase 25 (booking form UI) requires return_discount_pct available on pricing_globals
- Phase 27 (supabase client) requires create_round_trip_bookings RPC callable via supabase.rpc()
- **Blocker:** Migration must be applied to live Supabase DB before phases 24–28 can be built or tested

---
*Phase: 23-database-schema-foundation*
*Completed: 2026-04-04*
