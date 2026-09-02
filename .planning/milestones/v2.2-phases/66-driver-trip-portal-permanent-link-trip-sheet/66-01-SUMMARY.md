---
phase: 66-driver-trip-portal-permanent-link-trip-sheet
plan: 01
subsystem: api
tags: [supabase, nextjs, zod, driver-portal, security]

# Dependency graph
requires:
  - phase: 65-dispatch-future-first-bookings-list
    provides: booking status/dispatch conventions this phase's terminal-status check builds on
provides:
  - "driver_assignments.trip_token (permanent, unguessable, DB-defaulted) — the D-01/D-02 token model"
  - "lib/trip-token.ts isTripLinkValid — the D-03 security-boundary predicate reused by Plan 02 and Phase 67"
  - "/driver/trip/[token] noindex trip sheet page — the D-05..D-09 police-presentable view"
affects: [66-driver-trip-portal-permanent-link-trip-sheet, 67-driver-trip-portal-status-marking]

# Actuals (#2632)
actuals:
  tokens: 5791
  tasks: 4
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Server-component token-gated page mirrors app/driver/response/page.tsx exactly (service-role client, single neutral invalid view, noindex metadata)"
    - "Validity predicate isolated as a pure function (lib/trip-token.ts) with zero I/O — single source of truth reused across plans/phases"
    - "Explicit interface cast (TripSheetAssignmentRow) around an untyped Supabase select-string join, since createSupabaseServiceClient() has no Database generic in this codebase"

key-files:
  created:
    - lib/trip-token.ts
    - app/driver/trip/[token]/page.tsx
    - supabase/migrations/060_driver_assignments_trip_token.sql
    - tests/driver-trip.test.ts
  modified:
    - types/database.types.ts
    - lib/email.ts

key-decisions:
  - "Task 2 checkpoint:decision — operator selected add-column (D-01, recommended) over a sibling driver_trip_links table"
  - "Migration 060 comment header reworded to avoid the literal substrings REVOKE/GRANT so the acceptance-criteria grep (which does not distinguish comments from SQL) accurately reports zero privilege-adjustment statements"
  - "TripSheetAssignmentRow/TripSheetBookingRow/TripSheetDriverRow interfaces added and the raw select result is cast through them, because createSupabaseServiceClient() is untyped in this codebase and supabase-js's select-string parser otherwise infers `bookings!inner(*)` as an array"

patterns-established:
  - "D-11 uniform invalid response: one InvalidTripLinkView renders identically for unknown token, malformed UUID, terminal status, reassigned driver, and orphaned booking — no branch reveals which reason applied"
  - "Pitfall-3-safe coordinate handling: PlaceResult built from booking lat/lng is null (not {lat:0,lng:0}) when either coordinate is missing, triggering a page-owned 'Map unavailable' placeholder instead of mounting RouteMap at (0,0)"

requirements-completed: [DTRIP-01, DTRIP-02, DTRIP-08]

coverage:
  - id: D1
    description: "trip_token uuid NOT NULL DEFAULT gen_random_uuid() column + unique index added to driver_assignments; migration 060 applied LIVE and verified via Supabase MCP (18 existing rows all backfilled, zero NULLs)"
    requirement: "DTRIP-01"
    verification:
      - kind: unit
        ref: "tests/driver-trip.test.ts#TERMINAL_STATUSES contains exactly completed and cancelled"
        status: pass
      - kind: other
        ref: "Supabase MCP post-apply check (orchestrator-run): trip_token uuid NOT NULL default gen_random_uuid(), unique index driver_assignments_trip_token_idx exists, 0 NULL rows"
        status: pass
    human_judgment: false
  - id: D2
    description: "isTripLinkValid (D-03 predicate): valid only when assignment.driver_id === booking.driver_id AND booking.status is non-terminal; self-invalidates on reassignment and on completion/cancellation with no stored expiry"
    requirement: "DTRIP-08"
    verification:
      - kind: unit
        ref: "tests/driver-trip.test.ts#isTripLinkValid (6 cases: valid, completed, cancelled, driver-mismatch, null-driver, TERMINAL_STATUSES shape)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/driver/trip/[token] renders the full police-presentable trip sheet (booking reference, date/time, from/to, passenger name+phone, flight if present, special requests if present, vehicle class + driver vehicle_info + driver name/phone, embedded RouteMap) for a valid token, noindex metadata set"
    requirement: "DTRIP-02"
    verification:
      - kind: unit
        ref: "tests/driver-trip.test.ts#TripSheetPage valid token renders booking reference, passenger, from/to, date/time"
        status: pass
      - kind: unit
        ref: "tests/driver-trip.test.ts#TripSheetPage metadata.robots has index and follow both false (D-08 noindex)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every invalid state (unknown token, malformed UUID, terminal status, reassigned driver, orphaned joined booking) renders the identical neutral InvalidTripLinkView with no booking data — no enumeration oracle"
    requirement: "DTRIP-08"
    verification:
      - kind: unit
        ref: "tests/driver-trip.test.ts#TripSheetPage unknown token / terminal / reassigned / malformed-UUID / orphaned-booking (5 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live visual verification of a real /driver/trip/[token] link in a browser (map draws with Google attribution visible, all D-06 fields present, reads as an official police-presentable document)"
    verification: []
    human_judgment: true
    rationale: "Plan's own <human-check> defers this to after Task 4's live migration apply; it is a manual browser test of visual/attribution rendering that automated unit tests (jsdom, RouteMap mocked to a stub) cannot exercise. Deferred to /gsd-verify-work — not blocking plan completion."

duration: ~7min (active execution; excludes wait time for the Task 2 decision checkpoint and the Task 4 live-migration checkpoint)
completed: 2026-08-31
status: complete
---

# Phase 66 Plan 01: Driver Trip Portal — Permanent Link & Trip Sheet Summary

**Additive `trip_token` column + live-checked `isTripLinkValid` predicate + a noindex `/driver/trip/[token]` server-component trip sheet, with one uniform neutral placeholder for every invalid state**

## Performance

- **Duration:** ~7 min active execution (two blocking checkpoints paused the clock: Task 2 decision, Task 4 live migration apply — both resolved by the operator/orchestrator)
- **Started:** 2026-08-31T21:12:47Z
- **Completed:** 2026-08-31T21:26:26Z (SUMMARY authoring)
- **Tasks:** 4 (Task 1 auto/TDD, Task 2 checkpoint:decision, Task 3 tracer/TDD, Task 4 checkpoint:human-action)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- `driver_assignments.trip_token` — a permanent, unguessable (`gen_random_uuid()`), DB-defaulted second token coexisting with the existing single-use accept/decline token; migration 060 applied LIVE and verified via Supabase MCP (18/18 existing rows backfilled)
- `lib/trip-token.ts` — the D-03 security-boundary predicate (`isTripLinkValid`), pure and I/O-free, checked live on every request (no stored expiry, no revoke step — self-invalidates on reassignment and terminal status)
- `/driver/trip/[token]` — a full, English-only, noindex, police-presentable trip sheet (booking reference, trip details, passenger, embedded route map, vehicle & driver) for a valid token, and one identical neutral placeholder for every invalid reason (unknown, malformed UUID, terminal, reassigned, orphaned)

## Task Commits

1. **Task 1: Wave 0 — trip-link validity predicate (D-03) + unit tests** — `984a647` (test, RED) → `4515d7d` (feat, GREEN)
2. **Task 2: checkpoint:decision — additive trip_token column** — decision recorded (`add-column`, matches locked D-01); no code commit
3. **Task 3: Tracer — migration 060 + type + noindex trip sheet page** — `5eb5041` (feat, tracer, TDD extended)
4. **Task 4: checkpoint:human-action — apply migration 060 live** — applied and verified by the orchestrator via Supabase MCP; no code commit

**Plan metadata:** (this commit, following SUMMARY.md write)

_Note: Task 1 and Task 3 both carried `tdd="true"` — Task 1 is a plain RED→GREEN pair; Task 3 is the tracer task, whose GREEN commit also extended the RED test file with the page-render cases in the same commit (single tracer commit per plan convention)._

## Files Created/Modified
- `lib/trip-token.ts` — `TERMINAL_STATUSES` set + `isTripLinkValid()`, the D-03 predicate
- `supabase/migrations/060_driver_assignments_trip_token.sql` — additive `trip_token uuid NOT NULL DEFAULT gen_random_uuid()` + unique index, applied LIVE
- `types/database.types.ts` — `driver_assignments` Row/Insert/Update gains `trip_token`
- `lib/email.ts` — `formatVehicleLabel` changed from module-private to exported (no behavior change)
- `app/driver/trip/[token]/page.tsx` — the noindex trip sheet server component + `InvalidTripLinkView`
- `tests/driver-trip.test.ts` — 13 tests: 6 predicate cases + 7 page-render cases (valid, unknown, terminal, reassigned, malformed-UUID, orphaned, noindex metadata)

## Decisions Made
- Task 2 checkpoint: operator selected `add-column` (D-01, recommended) over the `sibling-table` alternative — matches the locked CONTEXT.md decision.
- Reworded the migration 060 comment header to avoid literally containing "REVOKE"/"GRANT" as substrings (even in prose explaining their absence), so the acceptance-criteria grep — which does not parse SQL vs. comments — correctly reports zero privilege-adjustment statements.
- Added explicit `TripSheetAssignmentRow`/`TripSheetBookingRow`/`TripSheetDriverRow` interfaces and cast the raw Supabase select result through them, because `createSupabaseServiceClient()` has no `Database` generic anywhere in this codebase (matching existing call-site convention) and supabase-js's select-string type parser otherwise infers a `bookings!inner(*)` join as an array without that generic.

## Deviations from Plan

None - plan executed exactly as written. The two interface/comment adjustments above were needed to satisfy the plan's own acceptance-criteria greps and `tsc --noEmit`, not scope changes — no deviation-rule triggers (Rule 1/2/3/4) applied.

## Issues Encountered

- `npx tsc --noEmit` surfaced 9 pre-existing type errors in three unrelated test files (`tests/account-trips.test.tsx`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts`) not touched by this plan. Confirmed out of scope per the SCOPE BOUNDARY rule (not caused by this plan's changes) and left unfixed; not re-logged to `deferred-items.md` since they predate this plan and are unrelated to any file this plan modified.

## User Setup Required

None beyond the completed Task 4 live migration. Migration 060 was applied live to the rideprestigo Supabase project and verified via Supabase MCP by the orchestrator: `driver_assignments.trip_token` exists as `uuid NOT NULL DEFAULT gen_random_uuid()`, the unique index `driver_assignments_trip_token_idx` exists, and `SELECT count(*) FROM driver_assignments WHERE trip_token IS NULL` returned 0 (18 existing rows backfilled).

## Known Stubs

None — no hardcoded empty values, placeholder text, or unwired data sources introduced by this plan.

## Next Phase Readiness
- Plan 02 (wave 2, `depends_on: [66-01]`) can proceed: it needs `trip_token` selectable on the assignment insert/GET routes (available now via the `types/database.types.ts` update) and the `/driver/trip/[token]` route to link to (built now).
- The live visual `<human-check>` (D5 above) is deferred to `/gsd-verify-work` — a real browser open of `/driver/trip/[token]` for an active assignment, confirming the embedded map draws with visible Google attribution and the page reads as an official document. Not blocking; automated coverage (13/13 tests, full suite 101 passed) already proves the field/branch logic.

---
*Phase: 66-driver-trip-portal-permanent-link-trip-sheet*
*Completed: 2026-08-31*

## Self-Check: PASSED

- FOUND: `lib/trip-token.ts`
- FOUND: `app/driver/trip/[token]/page.tsx`
- FOUND: `supabase/migrations/060_driver_assignments_trip_token.sql`
- FOUND: `tests/driver-trip.test.ts`
- FOUND commit: `984a647`
- FOUND commit: `4515d7d`
- FOUND commit: `5eb5041`
