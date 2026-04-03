---
phase: 18-schema-foundation-zone-logic-fix
plan: 02
subsystem: database
tags: [postgres, supabase, sql, migrations, schema]

# Dependency graph
requires:
  - phase: none
    provides: existing bookings, pricing_globals, coverage_zones tables from migrations 0001-0003
provides:
  - supabase/migrations/018_v13_schema_foundation.sql — idempotent SQL ready to apply in Supabase Dashboard
  - bookings.status column with CHECK constraint (pending/confirmed/completed/cancelled)
  - bookings.operator_notes column (nullable TEXT)
  - bookings.booking_source column with CHECK constraint (online/manual)
  - bookings.payment_intent_id made explicitly nullable for manual bookings
  - promo_codes table with 9 columns (empty, ready for Phase 22)
  - pricing_globals.holiday_dates JSONB column (empty array default, ready for Phase 21)
affects: [19-booking-management, 20-refund-flow, 21-holiday-dates, 22-promo-codes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IF NOT EXISTS guards on ADD COLUMN and CREATE TABLE for idempotent migrations"
    - "CHECK constraints on TEXT enum columns at DB level (status, booking_source)"
    - "Backfill UPDATE immediately after ADD COLUMN for existing rows"

key-files:
  created:
    - supabase/migrations/018_v13_schema_foundation.sql
  modified: []

key-decisions:
  - "CHECK constraints added on bookings.status and bookings.booking_source — DB-level enforcement prevents invalid enum values at zero runtime cost"
  - "No separate index on promo_codes.code — UNIQUE constraint creates one implicitly"
  - "payment_intent_id DROP NOT NULL is safe no-op: column was declared without NOT NULL in 0001_create_bookings.sql"

patterns-established:
  - "Migration naming: NNN_vXX_descriptor.sql (NNN = sequence, vXX = milestone version)"
  - "Schema-only migrations applied manually via Supabase Dashboard SQL Editor (no migration runner in this project)"

requirements-completed: [ZONES-06]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 18 Plan 02: v1.3 Schema Foundation Migration Summary

**SQL migration adding 3 bookings columns, promo_codes table (9 cols), and holiday_dates JSONB to pricing_globals — all prerequisites for Phases 19-22**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-03T10:50:00Z
- **Completed:** 2026-04-03T10:55:00Z
- **Tasks:** 1 of 2 auto-completed (Task 2 awaits human action — Supabase Dashboard)
- **Files modified:** 1

## Accomplishments

- Created `supabase/migrations/018_v13_schema_foundation.sql` with all v1.3 schema prerequisites
- Migration is idempotent where possible (IF NOT EXISTS guards) and safe to re-run
- Confirmed payment_intent_id was already nullable in source schema — DROP NOT NULL is a safe no-op

## Task Commits

1. **Task 1: Create v1.3 schema foundation migration file** - `b180834` (feat)
2. **Task 2: Apply migration in Supabase Dashboard** - awaiting human action

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `supabase/migrations/018_v13_schema_foundation.sql` — Complete v1.3 schema migration covering bookings columns, promo_codes table, and pricing_globals extension

## Decisions Made

- CHECK constraints on `bookings.status` and `bookings.booking_source` added per plan's discretionary notes — prevents invalid values at DB level with zero cost
- No additional index on `promo_codes.code` — UNIQUE constraint already creates a btree index implicitly
- `payment_intent_id DROP NOT NULL` confirmed safe: column was defined as `text UNIQUE` with no explicit NOT NULL in the original migration

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Task 2 requires manual action in Supabase Dashboard:**

1. Open Supabase Dashboard > SQL Editor
2. Paste the contents of `supabase/migrations/018_v13_schema_foundation.sql`
3. Click "Run"
4. Verify in Table Editor:
   - bookings table: `status` column (TEXT, default 'pending'), `operator_notes` column (TEXT, nullable), `booking_source` column (TEXT, default 'online'), `payment_intent_id` is nullable
   - Run `SELECT status, booking_source FROM bookings LIMIT 5` — all existing rows should show `status='confirmed'`, `booking_source='online'`
   - `promo_codes` table exists with columns: id, code, discount_type, discount_value, expiry_date, max_uses, current_uses, is_active, created_at
   - `pricing_globals` table: `holiday_dates` column (JSONB, default '[]')
5. Type "applied" to resume execution

## Next Phase Readiness

- Migration file committed and ready to paste into Supabase Dashboard
- Once applied, schema prerequisites for Phases 19-22 will be in place
- No blockers beyond the manual Dashboard step

## Self-Check: PASSED

- `supabase/migrations/018_v13_schema_foundation.sql` — FOUND
- Commit `b180834` — FOUND

---
*Phase: 18-schema-foundation-zone-logic-fix*
*Completed: 2026-04-03*
