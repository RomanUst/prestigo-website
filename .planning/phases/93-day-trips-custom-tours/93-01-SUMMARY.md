---
phase: 93-day-trips-custom-tours
plan: 01
subsystem: database
tags: [supabase, migration, rls, tours, storage]
status: complete
requires: []
provides:
  - "supabase/migrations/092_tours.sql: tours, tour_translations, tour_photos, tour_settings (deny-all), bookings tour columns, tour-photos bucket"
  - "lib/tours/types.ts: row types and constants mirroring 092"
affects: [93-02, 93-06, 93-16, 93-20]
tech-stack:
  added: []
  patterns: ["deny-all tables read with the service client only", "text-pinned migration test"]
key-files:
  created:
    - supabase/migrations/092_tours.sql
    - tests/migration-092.test.ts
    - lib/tours/types.ts
    - .planning/phases/93-day-trips-custom-tours/93-01-smoke.sql
  modified: []
decisions:
  - "Task 1 (owner, 2026-11-18): Option A - four tour tables + bookings tour columns + trip_type 'tour'"
  - "No live CHECK on bookings.trip_type, so 092 widens nothing for 'tour'"
metrics:
  tasks_completed: "2 of 3 (Task 3 is the orchestrator's live apply + smoke)"
  completed: 2026-11-18
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: 22c3ca2ff23902275bffa2d2dd82de7829a07e34
plan_head_after: f5c2678d96b36f10d9d8a52e7a115f1d6f643f25
---

# Phase 93 Plan 01: Tours schema Summary

Migration 092 creates the four deny-all tour tables, the three bookings tour columns and the public tour-photos bucket; `lib/tours/types.ts` mirrors it and a text test pins both. 092 is NOT yet applied live: that is Task 3 (orchestrator).

## Task 1 decision (resolved by the owner, 2026-11-18)

**Option A**: four tour tables + bookings tour columns + trip_type `'tour'`.

Live query results (orchestrator, Supabase MCP, read-only, 2026-11-18):

1. CHECK constraints on public.bookings: booking_source, cancel_policy_version, fee_case_status, landing_complete, landing_date, landing_time, last_payment_error, lead_channel, leg, locale_format, payment_amount_minor, payment_currency, payment_mode (pay_now, card_hold, cash_guarantee, quote, partner), payment_state, pickup_offset, quote_deposit_minor, status. **No CHECK on trip_type.**
2. `SELECT DISTINCT trip_type`: transfer (97), round_trip (9), hourly (4), daily (1).
3. `storage.buckets` `tour-photos`: does not exist.

Consequence: 'tour' is accepted by the live table as it stands. 092 contains no DROP/ADD CONSTRAINT on bookings and the test pins that. Plans 93-06 and 93-20 still audit every trip_type list in code, and EspoCRM CBooking needs the 'tour' enum option before go-live.

## What was built

- **Task 2 (tracer, commit c095fdef):** `092_tours.sql`, `tests/migration-092.test.ts`, `lib/tours/types.ts`, committed with the `security:` prefix.
  - tours: slug CHECK `^[a-z0-9]+(-[a-z0-9]+)*-day-trip$` (<= 80), status draft/published, hours_included 1..12, drive minutes 10..600, start window HH:00/HH:30 with max > min, three nullable positive prices, destination_label, first_published_at, index (status, sort_order).
  - tour_translations: PK (tour_id, locale), locale CHECK equal to the 8 site locales, bounded text columns, five jsonb array columns, is_complete.
  - tour_photos: server-generated path CHECK (jpg/png/webp/avif only), position 1..50, source CHECK, https-only credit_url, unique partial index for one cover per tour.
  - tour_settings: singleton (id = 1), extra-hour prices, free_cancel_hours 24 (0..72), pickup_radius_km 15 (1..50), row inserted with ON CONFLICT DO NOTHING.
  - bookings: tour_id (FK, ON DELETE SET NULL), tour_title (<= 200), tour_extra_hours (0..12), partial index.
  - bucket tour-photos: public, 8388608 bytes, four image MIME types, no SVG.
  - Deny-all (REVOKE, RLS, SELECT/INSERT deny policies) on all four tables; no function, no grant, no seeded price.
- **Smoke file (commit f5c2678d):** `93-01-smoke.sql`, in the Phase 92 style: a read-only catalog SELECT (A) and a DO block that ends in `RAISE EXCEPTION 'SMOKE_OK_93_01 ...'` (B). The raise is the rollback, so nothing persists. Used instead of literal BEGIN/ROLLBACK because the MCP `execute_sql` call does not reliably keep a transaction across statements (this is how the 92-12 smoke works).

## Verification (executor side)

- `npx vitest run --exclude '.claude/**' tests/migration-092.test.ts tests/migration-091.test.ts`: 2 files, 115 tests passed.
- `npx tsc --noEmit`: 8 errors, all the known `tests/` baseline; none in `lib/tours/types.ts` or `tests/migration-092.test.ts`.
- `npx eslint --quiet` on both new TS files: clean.
- Invariants: no `€` in app/components touched, no secrets or `.env*` staged.

## Task 3 - pending (orchestrator)

Not run by the executor (no Supabase MCP). To do:

1. Apply `supabase/migrations/092_tours.sql` to project enakcryrtxlnjvjutfpv (apply_migration, name `092_tours`).
2. Run `.planning/phases/93-day-trips-custom-tours/93-01-smoke.sql`: statement A must show four tables with `rls=true anon_priv=false auth_priv=false policies=2`; statement B must FAIL with `SMOKE_OK_93_01 all checks passed (rolled back)`. Then `SELECT count(*) FROM public.tours WHERE slug = 'smoke-test-day-trip'` must be 0.
3. `get_advisors` (security): no new RLS warning for the four tables.
4. Record the outputs here under "092 live".

## Deviations from Plan

None - plan executed as written, apart from the smoke form noted above (DO block with a closing RAISE instead of BEGIN/ROLLBACK; same intent, rolled back).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-93-01..04 mitigated in 092 and pinned by the test; live proof is Task 3).

## Self-Check: PASSED

- FOUND: supabase/migrations/092_tours.sql, tests/migration-092.test.ts, lib/tours/types.ts, .planning/phases/93-day-trips-custom-tours/93-01-smoke.sql
- FOUND commits: c095fdef, f5c2678d

## 092 live (orchestrator, 2026-11-18)

- `apply_migration 092_tours` on enakcryrtxlnjvjutfpv: success (file body without comment lines).
- Smoke A (catalog): tours, tour_translations, tour_photos, tour_settings each `rls=true anon_priv=false auth_priv=false policies=2` (has_table_privilege anon/authenticated SELECT, INSERT, UPDATE, DELETE = false on all four); settings `id=1 free_cancel_hours=24 pickup_radius_km=15.0 extra_hour_e=null`; bucket `tour-photos public=true limit=8388608 mime=image/jpeg,image/png,image/webp,image/avif`; bookings.tour_id uuid / tour_title text / tour_extra_hours smallint, all nullable; 4 indexes and the slug/status/locale/source/tour_extra_hours(0..12) CHECKs present.
- Smoke B: `ERROR P0001: SMOKE_OK_93_01 all checks passed (rolled back)`.
- Leftover `SELECT count(*) FROM public.tours WHERE slug='smoke-test-day-trip'` = 0.
- Security advisors: no finding on the four tour tables (only the pre-existing rls_enabled_no_policy INFO list and leaked-password WARN).
- Next migration number: 093.
