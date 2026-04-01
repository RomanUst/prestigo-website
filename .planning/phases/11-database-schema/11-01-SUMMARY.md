---
phase: 11-database-schema
plan: 01
subsystem: database
tags: [supabase, postgres, migrations, rls, pricing, coverage-zones]

# Dependency graph
requires:
  - phase: 10-auth-infrastructure
    provides: Supabase client patterns and @supabase/ssr integration established
provides:
  - pricing_config table in Supabase with 3 rows seeded from lib/pricing.ts constants
  - pricing_globals table in Supabase with singleton row seeded from lib/extras.ts constants
  - coverage_zones table in Supabase with correct schema, 0 rows, ready for Phase 16 admin map UI
  - RLS enabled on all 3 tables with public-read SELECT policy
  - Migration files committed to repo at supabase/migrations/0002 and 0003
affects:
  - 12-core-booking-flow-update (reads pricing_config and coverage_zones)
  - 14-admin-api-routes (PUT pricing_config, POST/DELETE coverage_zones)
  - 16-admin-ui-pages (admin map draws to coverage_zones)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Supabase migration files in supabase/migrations/ with sequential numeric prefix
    - pricing_globals singleton enforced via CHECK (id = 1) constraint
    - RLS + public-read SELECT policy pattern for read-only tables

key-files:
  created:
    - supabase/migrations/0002_create_pricing_config.sql
    - supabase/migrations/0003_create_coverage_zones.sql
  modified: []

key-decisions:
  - "Migrations applied via Supabase MCP (not CLI) — CLI installation not required for this project"
  - "pricing_globals uses CHECK (id = 1) constraint to enforce singleton row pattern"
  - "coverage_zones seeded empty — operator draws zones via admin UI in Phase 16"
  - "airport_fee defaults to 0, night_coefficient and holiday_coefficient default to 1.0 — current pricing behavior unchanged"

patterns-established:
  - "Singleton row pattern: CHECK (id = 1) DEFAULT 1 on primary key"
  - "Public-read RLS: ALTER TABLE ... ENABLE ROW LEVEL SECURITY + CREATE POLICY 'public_read' FOR SELECT USING (true)"

requirements-completed: [PRICING-05, ZONES-04]

# Metrics
duration: ~30min (split across two sessions with human-action checkpoint)
completed: 2026-04-01
---

# Phase 11 Plan 01: Database Schema Summary

**Three Supabase tables applied via MCP: pricing_config (3 rows seeded), pricing_globals (1 singleton row), coverage_zones (empty) — all with RLS public-read policy**

## Performance

- **Duration:** ~30 min (includes human-action checkpoint for migration apply)
- **Started:** 2026-04-01T22:00:00Z
- **Completed:** 2026-04-01
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wrote and committed two migration SQL files matching existing hardcoded constants exactly
- All 3 tables applied to live Supabase project via MCP with correct schema and data
- RLS enabled on all 3 tables — no public write access
- Existing bookings table completely untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration SQL files** - `fb93c55` (feat)
2. **Task 2: Supabase CLI setup, migration push, and schema verification** - applied via MCP (no additional commit needed — schema live in Supabase)

**Plan metadata:** (this commit — docs)

## Files Created/Modified
- `supabase/migrations/0002_create_pricing_config.sql` - Creates pricing_config + pricing_globals tables with RLS and seed data matching lib/pricing.ts and lib/extras.ts constants
- `supabase/migrations/0003_create_coverage_zones.sql` - Creates coverage_zones table with id/name/geojson/active/created_at columns, RLS, no seed data

## Decisions Made
- Migrations applied via Supabase MCP rather than CLI — MCP provides direct SQL execution to the live project without requiring CLI auth setup
- pricing_globals singleton row enforced with `CHECK (id = 1)` so no code path can accidentally insert a second row
- coverage_zones left empty — no seed data; zones are drawn by the operator in Phase 16 admin UI

## Deviations from Plan

**Task 2 method change:** Plan specified Supabase CLI (`brew install supabase`, `supabase login`, `supabase db push`). Migrations were applied via Supabase MCP instead. This is functionally equivalent — the same SQL executed against the same database. No behavioral difference.

Otherwise: None — SQL content executed exactly as written in the migration files.

## Issues Encountered
None — MCP apply was straightforward. All 3 tables verified live with correct schema and data.

## User Setup Required
None - no additional external service configuration required.

## Next Phase Readiness
- Phase 12 (Core Booking Flow Update) can proceed: pricing_config and coverage_zones tables exist with correct schema
- pricing_config has 3 rows matching current lib/pricing.ts constants — Phase 12 DB reader will return identical values to current hardcoded behavior
- coverage_zones has 0 rows — Phase 12 zone check will return quoteMode: false (no zones defined), preserving current pricing behavior
- No blockers

---
*Phase: 11-database-schema*
*Completed: 2026-04-01*
