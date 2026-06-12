---
phase: 58-sign-in-ui-account-dashboard
plan: "02"
subsystem: database
tags: [supabase, postgres, migrations, rls, typescript, types]

# Dependency graph
requires:
  - phase: 58-sign-in-ui-account-dashboard/58-01
    provides: Wave-0 RED test scaffolds for profile + passenger actions
  - phase: 57-customer-auth-foundation
    provides: customer_profiles table (migration 044), auth.users FK pattern, RLS conventions

provides:
  - customer_profiles.full_name, .phone, .ico, .vat_id columns (migration 047)
  - saved_passengers table with 4 own-row RLS policies + partial unique index + updated_at trigger (migration 048)
  - Regenerated types/database.types.ts reflecting live schema

affects:
  - 58-03-PLAN (nav auth — may reference customer_profiles.full_name)
  - 58-05-PLAN (profile form — reads/writes new columns + saved_passengers)
  - 59 onwards (any plan touching customer_profiles or saved_passengers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent migrations: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS"
    - "Own-row RLS with (select auth.uid()) = user_id — mirroring migration 044 pattern"
    - "Partial unique index WHERE is_default = true for DB-enforced single-default constraint"
    - "updated_at trigger via CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER pattern"
    - "Four RLS policies per table: SELECT/INSERT/UPDATE/DELETE (saved_passengers adds DELETE, unlike customer_profiles)"

key-files:
  created:
    - supabase/migrations/047_customer_profiles_profile_fields.sql
    - supabase/migrations/048_saved_passengers.sql
  modified:
    - types/database.types.ts

key-decisions:
  - "Migration 047 adds all four columns (full_name, phone, ico, vat_id) in one idempotent ALTER TABLE — no separate corporate-only migration"
  - "saved_passengers includes a DELETE RLS policy (deliberate contrast with customer_profiles where deletion is CASCADE-only)"
  - "Partial unique index saved_passengers_one_default_per_user enforces single default atomically at DB layer, no app-level race window"
  - "user_id on saved_passengers is NOT UNIQUE (one user has many passengers) — FK with ON DELETE CASCADE only"

patterns-established:
  - "Pattern: own-row RLS with (select auth.uid()) — prevents auth.uid() re-evaluation per row, matches Phase 57 convention"
  - "Pattern: partial unique index WHERE boolean_col = true for single-active-record enforcement at DB layer"

requirements-completed: [ACCT-02, ACCT-03]

# Metrics
duration: 45min
completed: 2026-06-12
---

# Phase 58 Plan 02: Schema Foundation Summary

**Migrations 047 (customer_profiles profile + corporate fields) and 048 (saved_passengers with own-row RLS, partial unique is_default index, and updated_at trigger) applied to live Supabase DB; TypeScript types regenerated**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-12T06:41:51Z
- **Completed:** 2026-06-12T08:30:00Z
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 3

## Accomplishments

- Migration 047: added `full_name TEXT`, `phone TEXT`, `ico TEXT`, `vat_id TEXT` to `customer_profiles` via idempotent `ADD COLUMN IF NOT EXISTS` — satisfies ACCT-02 (profile editing) and ACCT-03 (corporate fields)
- Migration 048: created `public.saved_passengers` with user_id FK (ON DELETE CASCADE), is_default partial unique index, 4 own-row RLS policies (SELECT/INSERT/UPDATE/DELETE), and `updated_at` trigger — satisfies D-07
- Both migrations applied to the live Supabase database and verified via Supabase MCP (schema columns + 4 RLS policies + partial unique index confirmed)
- `types/database.types.ts` regenerated to include `saved_passengers` table and new `customer_profiles` columns; `tsc --noEmit` passes (only pre-existing RED test errors as expected)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 047 (customer_profiles profile + corporate fields)** - `a777269` (chore)
2. **Task 2: Write migration 048 (saved_passengers table + RLS + trigger + partial unique index)** - `f2000d6` (chore)
3. **Task 3: [BLOCKING] Apply migrations 047 + 048 and regenerate types** - `85364d6` (chore)

**Plan metadata:** (docs commit — see state update)

## Files Created/Modified

- `supabase/migrations/047_customer_profiles_profile_fields.sql` — ALTER TABLE adding full_name, phone, ico, vat_id with ADD COLUMN IF NOT EXISTS; Phase 58 header citing D-03 + D-06
- `supabase/migrations/048_saved_passengers.sql` — saved_passengers table, user_id FK ON DELETE CASCADE, is_default BOOLEAN, partial unique index WHERE is_default=true, 4 own-row RLS policies including DELETE, updated_at trigger
- `types/database.types.ts` — regenerated Supabase types now including saved_passengers table and new customer_profiles columns

## Decisions Made

- All four columns (full_name, phone, ico, vat_id) added in a single migration (047) rather than splitting personal vs corporate — keeps schema simpler; ACCT-02 and ACCT-03 fields are co-located.
- saved_passengers includes a DELETE policy (intentional difference from customer_profiles) because users must be able to remove their own saved passengers.
- Partial unique index `WHERE is_default = true` used instead of app-logic to enforce single default — atomically safe against concurrent requests (RESEARCH Pitfall 3 / Pattern 5).
- user_id on saved_passengers is a plain FK (not UNIQUE) — a user may have many passengers; only the is_default uniqueness constraint exists.

## Deviations from Plan

None - plan executed exactly as written. Checkpoint:human-verify was handled by the orchestrator (migrations applied via Supabase MCP, schema verified, types regenerated); resume signal "applied" received.

## Issues Encountered

None. The plan was marked `autonomous: false` because applying migrations to the live DB requires an explicit step outside the automated executor. The orchestrator handled the blocking checkpoint correctly.

## User Setup Required

None - no external service configuration required beyond what was already in place for Phase 57.

## Threat Surface Scan

No new network endpoints introduced. RLS policies follow the established pattern from migration 044 (Phase 57). The partial unique index (T-58-04) and own-row RLS for saved_passengers (T-58-03) both implemented as planned in the threat register. No unmitigated new surface found.

## Next Phase Readiness

- Schema foundation complete: `customer_profiles` has all profile + corporate columns; `saved_passengers` table is live with RLS and single-default enforcement
- `types/database.types.ts` is current — Plan 05 profile/passenger server actions will type-check against the real schema
- Plan 58-03 (auth-aware Nav) and Plan 58-04 (/account overview + /account/trips shell) are unblocked — they do not depend on the new columns directly
- Plan 58-05 (ProfileForm + server actions) is now fully unblocked: all columns and the saved_passengers table are available

---
*Phase: 58-sign-in-ui-account-dashboard*
*Completed: 2026-06-12*
