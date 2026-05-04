---
phase: 47
plan: 01
subsystem: database
tags: [database, migration, gnet, rls, booking-source]
dependency_graph:
  requires: []
  provides: [gnet_bookings_table, booking_source_gnet, BookingSource_type]
  affects:
    - supabase/migrations/039_gnet_bookings.sql
    - types/booking.ts
tech_stack:
  added: []
  patterns: [supabase-mcp-apply-migration, rls-deny-all, fk-on-delete-restrict]
key_files:
  created:
    - supabase/migrations/039_gnet_bookings.sql
  modified:
    - types/booking.ts
decisions:
  - Migration applied via Supabase MCP apply_migration (no supabase CLI needed)
  - BookingSource type added directly after VehicleClass in types/booking.ts
  - ON DELETE RESTRICT (not CASCADE) — preserves GNet audit trail
  - RLS USING (false) for all 4 operations — service_role bypasses automatically
metrics:
  duration: ~15 minutes
  completed: "2026-04-26"
  tasks_completed: 4
  tasks_total: 4
  files_modified: 2
---

# Phase 47 Plan 01: DB Migration — gnet_bookings Summary

**One-liner:** Created `gnet_bookings` table with FK ON DELETE RESTRICT, UNIQUE on `gnet_res_no` and `transaction_id`, 4 RLS deny-all policies, and extended `bookings_booking_source_check` to include `'gnet'`; exported `BookingSource` TS type.

## Tasks Completed

| Task | Name | Files |
|------|------|-------|
| 1 | Inspect existing booking_source CHECK via Supabase MCP | (read-only) |
| 2 | Write migration 039_gnet_bookings.sql | supabase/migrations/039_gnet_bookings.sql |
| 3 | Extend BookingSource type in types/booking.ts | types/booking.ts |
| 4 | Apply migration via Supabase MCP apply_migration + verify | (schema push) |

## What Was Built

- `supabase/migrations/039_gnet_bookings.sql`: DDL for `gnet_bookings` table with 9 columns, FK to `bookings(id)` ON DELETE RESTRICT, UNIQUE constraints, index on `booking_id`, RLS deny-all policies, and DROP+ADD of `bookings_booking_source_check` to include `'gnet'`
- `types/booking.ts`: Added `export type BookingSource = 'online' | 'manual' | 'gnet'`

## DB Verification (live Supabase)

| Check | Result |
|-------|--------|
| gnet_bookings table exists | ✓ (9 columns) |
| booking_id NOT NULL | ✓ |
| UNIQUE gnet_res_no | ✓ (`gnet_bookings_gnet_res_no_key`) |
| UNIQUE transaction_id | ✓ (`gnet_bookings_transaction_id_key`) |
| booking_source CHECK includes 'gnet' | ✓ |
| RLS enabled | ✓ (4 deny-all policies) |
| FK ON DELETE RESTRICT | ✓ |

## Deviations from Plan

None — migration applied via MCP `apply_migration` as specified in Task 4 preferred path.

## Threat Model Compliance

- T-47-01: RLS USING (false) + WITH CHECK (false) on all 4 operations — anon cannot read or write gnet_bookings ✓
- T-47-02: UNIQUE constraint on transaction_id rejects duplicate Farm In requests ✓
- T-47-03: FK ON DELETE RESTRICT prevents parent bookings row deletion while gnet_bookings child exists ✓
- T-47-04: booking_id NOT NULL + FK — no orphan rows possible ✓

## Self-Check

- [x] `supabase/migrations/039_gnet_bookings.sql` created with all required DDL
- [x] `CREATE TABLE IF NOT EXISTS public.gnet_bookings` — present
- [x] `REFERENCES public.bookings(id) ON DELETE RESTRICT` — present
- [x] `UNIQUE (gnet_res_no)` and `UNIQUE (transaction_id)` — present
- [x] `ENABLE ROW LEVEL SECURITY` — present
- [x] 4 DROP POLICY IF EXISTS + CREATE POLICY — present
- [x] `booking_source IN ('online', 'manual', 'gnet')` — present
- [x] `export type BookingSource = 'online' | 'manual' | 'gnet'` — line 18 of types/booking.ts
- [x] Live Supabase: 9 columns confirmed via information_schema
- [x] Live Supabase: 2 UNIQUE constraints confirmed via pg_constraint
- [x] Live Supabase: 4 RLS policies confirmed via pg_policy

## Self-Check: PASSED
