---
phase: 47
plan: 01
subsystem: database
tags: [migration, gnet, rls, supabase, typescript]
dependency_graph:
  requires: []
  provides: [gnet_bookings table, BookingSource type, booking_source CHECK with gnet]
  affects: [phase-49-farm-in-endpoint, phase-51-admin-ui-badge]
tech_stack:
  added: [gnet_bookings PostgreSQL table, RLS policies on gnet_bookings]
  patterns: [CREATE TABLE IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, RLS USING (false)]
key_files:
  created:
    - supabase/migrations/039_gnet_bookings.sql
  modified:
    - types/booking.ts (BookingSource already present in baseline — no change needed)
decisions:
  - "Used DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pattern for idempotent CHECK update"
  - "ON DELETE RESTRICT chosen over CASCADE to preserve GNet audit trail (T-47-03)"
  - "4 RLS policies (SELECT/INSERT/UPDATE/DELETE) all USING (false) — service_role bypasses RLS by default"
  - "BookingSource type found already in baseline commit 2b343e9 — Task 3 was effectively pre-completed"
metrics:
  duration: "10 minutes"
  completed_date: "2026-05-04"
  tasks: 4
  files_created: 1
  files_modified: 0
---

# Phase 47 Plan 01: DB Migration gnet_bookings — Summary

**One-liner:** Created `gnet_bookings` PostgreSQL table with FK ON DELETE RESTRICT, dual UNIQUE constraints, JSONB raw_payload, 4 RLS lockdown policies, and extended `bookings.booking_source` CHECK to include `'gnet'` as a valid value.

## What Was Built

### Migration 039_gnet_bookings.sql

The migration file at `supabase/migrations/039_gnet_bookings.sql` contains:

1. **Extend CHECK constraint** — `DROP CONSTRAINT IF EXISTS bookings_booking_source_check` then `ADD CONSTRAINT` with `CHECK (booking_source IN ('online', 'manual', 'gnet'))`. The original constraint (from migration 018) only allowed `'online'` and `'manual'`.

2. **gnet_bookings table** with columns:
   - `id` UUID PK (gen_random_uuid)
   - `booking_id` UUID NOT NULL FK → `public.bookings(id)` ON DELETE RESTRICT
   - `gnet_res_no` TEXT NOT NULL + UNIQUE constraint
   - `transaction_id` TEXT NOT NULL + UNIQUE constraint
   - `raw_payload` JSONB NOT NULL DEFAULT `'{}'::jsonb`
   - `last_push_status` TEXT nullable
   - `last_push_error` TEXT nullable
   - `last_pushed_at` TIMESTAMPTZ nullable
   - `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

3. **Index** on `booking_id` for FK join performance

4. **RLS lockdown** — 4 policies (SELECT/INSERT/UPDATE/DELETE) all `USING (false)` / `WITH CHECK (false)` — anon public cannot interact with table; service_role bypasses RLS

### BookingSource TypeScript Type

`types/booking.ts` already contained `export type BookingSource = 'online' | 'manual' | 'gnet'` in the baseline commit (`2b343e9`). This was added in a prior session. Task 3 was effectively pre-completed.

## Task Execution Log

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Inspect CHECK constraint via Supabase MCP | Complete — constraint `bookings_booking_source_check` found (results from prior execution recorded in migration header comment) | (read-only) |
| 2 | Write migration 039_gnet_bookings.sql | Complete | 313415a |
| 3 | Extend BookingSource type | Complete — already present in baseline | (no change) |
| 4 | Push migration to live Supabase | Previously applied (migration is idempotent — IF NOT EXISTS/IF EXISTS throughout) | (verified via prior session) |

## Live Supabase State (from prior session — same day)

The migration was applied to the live Supabase project in a previous execution session today (May 4, 2026). Commit `58baad0` documents: "47-01-SUMMARY: gnet_bookings table + BookingSource type (already live in Supabase)".

- `gnet_bookings` table: EXISTS with all 9 columns
- `bookings_booking_source_check`: includes `'gnet'`
- FK ON DELETE RESTRICT: enforced
- UNIQUE on `gnet_res_no` and `transaction_id`: enforced
- 4 RLS policies: active
- FK violation test (bogus UUID INSERT): confirmed failing with 23503

## Deviations from Plan

### Pre-completed Task (not a deviation — just noted)

**Task 3 — BookingSource type already present**
- **Found during:** Task 3 inspection
- **Issue:** `export type BookingSource = 'online' | 'manual' | 'gnet'` was already in `types/booking.ts` as part of baseline commit `2b343e9`
- **Action:** No change needed — acceptance criteria already satisfied
- **Commit:** N/A

## Threat Mitigations Applied

All mitigations from the plan's threat model are in place:

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-47-01 | RLS `USING (false)` on all 4 operations | Applied in migration |
| T-47-02 | UNIQUE constraint on `transaction_id` | Applied in migration |
| T-47-03 | FK ON DELETE RESTRICT (not CASCADE) | Applied in migration |
| T-47-04 | `booking_id` NOT NULL + FK | Applied in migration |
| T-47-05 | Service-role only via RLS | Applied in migration |

## Known Stubs

None. The migration is complete DDL — no placeholder values, no hardcoded empty arrays, no TODO markers.

## Self-Check: PASSED

- [x] `supabase/migrations/039_gnet_bookings.sql` exists
- [x] Contains `ON DELETE RESTRICT`
- [x] Contains `UNIQUE (gnet_res_no)`
- [x] Contains `UNIQUE (transaction_id)`
- [x] Contains `ENABLE ROW LEVEL SECURITY`
- [x] Contains `CHECK (booking_source IN ('online', 'manual', 'gnet'))`
- [x] Contains 4 `DROP POLICY IF EXISTS` statements
- [x] Does NOT contain `ON DELETE CASCADE`
- [x] `types/booking.ts` exports `BookingSource = 'online' | 'manual' | 'gnet'`
- [x] Commit 313415a exists (feat(47-01): write migration)
