---
phase: 65-dispatch-future-first-bookings-list
plan: 01
subsystem: database
tags: [postgres, supabase, vitest, intl, rpc]

# Dependency graph
requires: []
provides:
  - "lib/prague-date.ts (getPragueTodayISO, shiftIsoDate) — server-only Europe/Prague today helper, zero new deps"
  - "pricing_globals.dispatch_default_horizon / dispatch_horizon_days columns, live (migration 058)"
  - "admin_search_bookings 8-arg signature with p_sort adaptive CASE ordering, live (migration 059 + 472e132)"
affects: [65-02, 65-03]

actuals:
  tokens: 2136
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Server-only Prague-today via Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Prague'}) — no timezone library"
    - "RPC signature-change migration: DROP exact old signature, CREATE OR REPLACE new signature, re-GRANT EXECUTE to service_role, then REVOKE default PUBLIC/anon/authenticated grant that a brand-new function object always receives"

key-files:
  created:
    - lib/prague-date.ts
    - tests/prague-date.test.ts
    - supabase/migrations/058_pricing_globals_dispatch_horizon.sql
    - supabase/migrations/059_admin_search_bookings_sort.sql
  modified: []

key-decisions:
  - "TEXT + CHECK (not Postgres ENUM) for dispatch_default_horizon, matching the customer_profiles.account_type precedent"
  - "p_sort adaptive CASE-expression ORDER BY duplicated identically in both the paged CTE and the jsonb_agg site (Pitfall 1) — never dynamic/concatenated SQL (T-65-01)"
  - "059's DROP+CREATE produces a new Postgres function object that receives a default PUBLIC EXECUTE grant, uncovered only at live-apply time — a matching REVOKE was added and applied (Rule 2 auto-fix, see Deviations)"

patterns-established:
  - "Migration REVOKE-after-CREATE checklist: whenever a SECURITY DEFINER function's signature changes via DROP+CREATE, always follow with an explicit REVOKE EXECUTE FROM PUBIC, anon, authenticated before re-GRANTing to service_role — the new function object does not inherit the old object's revoked grants"

requirements-completed: [DISP-01, DISP-02]

coverage:
  - id: D1
    description: "getPragueTodayISO()/shiftIsoDate() compute Prague 'today' and whole-day shifts correctly across DST/UTC boundaries, server-side, zero new dependencies"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/prague-date.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "pricing_globals gains dispatch_default_horizon (default 'future') and dispatch_horizon_days (default 7) columns, applied live"
    requirement: DISP-02
    verification:
      - kind: manual_procedural
        ref: "operator ran `select dispatch_default_horizon, dispatch_horizon_days from pricing_globals where id = 1;` on live project rideprestigo -> returned 'future', 7"
        status: pass
    human_judgment: false
  - id: D3
    description: "admin_search_bookings accepts p_sort (8-arg signature) with adaptive CASE ordering in both ORDER BY sites, re-GRANTed to service_role only (anon/authenticated/PUBLIC revoked, T-65-02)"
    requirement: DISP-01
    verification:
      - kind: manual_procedural
        ref: "operator ran `select total_count from admin_search_bookings(p_sort := 'pickup_asc', p_limit := 1);` on live project rideprestigo -> no error; live exec grants confirmed {postgres, service_role} only after 472e132"
        status: pass
    human_judgment: false

duration: 52min
completed: 2026-08-28
status: complete
---

# Phase 65 Plan 01: Dispatch Schema Foundation Summary

**Server-only Europe/Prague "today" helper plus two live-applied migrations — pricing_globals dispatch-horizon columns and an admin_search_bookings adaptive-sort RPC signature, with a live-only PUBLIC-grant leak caught and revoked at apply time.**

## Performance

- **Duration:** 52min
- **Started:** 2026-08-28T14:52:00Z
- **Completed:** 2026-08-28T15:44:00Z (operator confirmation received)
- **Tasks:** 3 completed (2 code tasks + 1 blocking-human migration apply)
- **Files modified:** 4 created (lib/prague-date.ts, tests/prague-date.test.ts, migrations 058 + 059)

## Accomplishments
- `lib/prague-date.ts` — `getPragueTodayISO()`/`shiftIsoDate()`, built via TDD (RED then GREEN), zero new dependencies, correct across CET/CEST DST boundaries
- Migration 058 — `pricing_globals` gains `dispatch_default_horizon` (TEXT+CHECK, default `'future'`) and `dispatch_horizon_days` (integer, default `7`), applied live and confirmed
- Migration 059 — `admin_search_bookings` gains an 8th parameter `p_sort` with a static `CASE`-expression adaptive sort duplicated identically in both `ORDER BY` sites, applied live and confirmed
- Live-only security gap caught and fixed: the DROP+CREATE in 059 produced a brand-new function object that received Postgres's default `PUBLIC` EXECUTE grant (bypassing the admin auth guard); a `REVOKE` was added to 059 and applied live, restoring the `{postgres, service_role}`-only grant state required by T-65-02

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-only Europe/Prague "today" helper (TDD)** - `83a1f35` (test, RED) → `213d5eb` (feat, GREEN)
2. **Task 2: Migrations 058 + 059** - `879e66e` (feat)
3. **Task 3: [BLOCKING] Operator applies migrations 058 + 059 live** - operator-executed against live project `rideprestigo` (`enakcryrtxlnjvjutfpv`); security fix committed as `472e132` (`security(65-01):`)

_Note: Task 1 followed the TDD RED→GREEN cycle (two commits); Task 3 has no code commit of its own beyond the security fix, since the operator applied the already-committed 058/059 files live._

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/prague-date.ts` - `getPragueTodayISO(now?)` / `shiftIsoDate(iso, days)`, server-only Prague-today helper via `Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Prague'})`
- `tests/prague-date.test.ts` - DST/UTC-boundary and whole-day-shift unit tests (5 tests, all passing)
- `supabase/migrations/058_pricing_globals_dispatch_horizon.sql` - `ALTER TABLE pricing_globals ADD COLUMN dispatch_default_horizon ...`, `dispatch_horizon_days ...`
- `supabase/migrations/059_admin_search_bookings_sort.sql` - `DROP FUNCTION` (7-arg) + `CREATE OR REPLACE FUNCTION` (8-arg, `p_sort`) + `REVOKE ... FROM PUBLIC, anon, authenticated` (added live, commit `472e132`) + `GRANT EXECUTE ... TO service_role`

## Decisions Made
- TEXT + CHECK over Postgres ENUM for `dispatch_default_horizon`, per the project's existing `customer_profiles.account_type` precedent — stays alterable without an `ALTER TYPE` if a fourth horizon option is ever added.
- The adaptive `p_sort` `ORDER BY` is a static `CASE` expression only, never dynamic/concatenated SQL, applied identically in both the `paged` CTE and the `jsonb_agg` sites (Pitfall 1 / T-65-01).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical security functionality] 059 omitted the REVOKE needed after DROP+CREATE**

- **Found during:** Task 3 (operator's live apply)
- **Issue:** The plan's migration 059 (as authored in Task 2) performed `DROP FUNCTION` + `CREATE OR REPLACE FUNCTION` + `GRANT EXECUTE ... TO service_role`, but did not account for the fact that Postgres grants a brand-new function object a default `EXECUTE` grant to `PUBLIC` (and thus `anon`/`authenticated`). Migration 057's earlier `REVOKE` was scoped to the *old* 7-arg function object and does not carry over to the newly created 8-arg object. This left `admin_search_bookings` reachable by unauthenticated/non-admin Supabase roles via PostgREST, bypassing the `getAdminUser()` guard — violating T-65-02 (Elevation of Privilege, high severity) from the plan's own threat register.
- **Fix:** Added `REVOKE EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;` to `supabase/migrations/059_admin_search_bookings_sort.sql`, placed before the `GRANT ... TO service_role` line. Applied live to project `rideprestigo` alongside the operator's Task 3 apply.
- **Files modified:** `supabase/migrations/059_admin_search_bookings_sort.sql`
- **Verification:** Live grant inspection confirmed `admin_search_bookings`'s EXECUTE roles are now `{postgres, service_role}` only, matching the pre-migration (057-hardened) state.
- **Committed in:** `472e132` (`security(65-01): revoke default PUBLIC EXECUTE on new admin_search_bookings 8-arg signature`)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical security functionality)
**Impact on plan:** Necessary for correctness/security (closes an unauthenticated-RPC-access gap that would otherwise have shipped live). No scope creep — the fix is a single `REVOKE` statement scoped exactly to the function signature this plan introduced.

## Issues Encountered
None beyond the security gap documented above, which was caught and fixed during the Task 3 operator apply itself (not a separate incident).

## User Setup Required
None further — the required external configuration (live migration apply) was Task 3 itself, now complete. Operator confirmed on project `rideprestigo` (`enakcryrtxlnjvjutfpv`):
1. `pricing_globals` id=1 returns `dispatch_default_horizon='future'`, `dispatch_horizon_days=7`.
2. `bookings.pickup_date` is live-confirmed `text` — the RPC's `pickup_date >= p_start_date` comparison works with no `date >= text` operator error (Pitfall 3 resolved).
3. `admin_search_bookings(p_sort := 'pickup_asc', p_limit := 1)` runs without error against the new 8-arg signature; EXECUTE grants are `{postgres, service_role}` only.

## Next Phase Readiness
Schema and server-helper foundation is live and confirmed. Plan 65-02 (end-to-end future-first tracer) and Plan 65-03 (settings backend) can now build against the real applied schema — `lib/prague-date.ts`, the `dispatch_default_horizon`/`dispatch_horizon_days` columns, and the `p_sort`-aware `admin_search_bookings` RPC are all live. No blockers.

---
*Phase: 65-dispatch-future-first-bookings-list*
*Completed: 2026-08-28*
