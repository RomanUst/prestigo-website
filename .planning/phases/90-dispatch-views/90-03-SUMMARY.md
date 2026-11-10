---
phase: 90-dispatch-views
plan: 03
subsystem: api
tags: [next-app-router, supabase-rpc, polling, react-hook, vitest]

requires:
  - phase: 71
    provides: admin_search_bookings RPC (migration 071) with pickup_asc sort and 100-row cap
provides:
  - "GET /api/admin/bookings/dispatch: admin-only bounded range read returning { bookings, truncated }"
  - "useDispatchBookings: 30 s polling hook with D-16 pause rules, visibility refresh, stale-response guard, 401 stop"
  - "UpdatedAgo: isolated 'Updated N s ago' ticker"
affects: [90-04, 90-05, 90-06, 90-07, 90-08, 90-09]

actuals:
  tokens: 6250
  tasks: 3
  commits: 4

plan_head_before: 9bb2470eff05365b57fa4680673d964abca12c4e
plan_head_after: 83941043cdf38567715d1ea0553fc3d2c855f762

tech-stack:
  added: []
  patterns:
    - "Range read loops the existing search RPC (max 5 pages of 100) and reports truncated instead of paging further"
    - "Polling hook: sequence counter + AbortController so only the newest request writes state; missed-tick flag catches up after pause or hidden tab"

key-files:
  created:
    - app/api/admin/bookings/dispatch/route.ts
    - components/admin/dispatch/useDispatchBookings.ts
    - components/admin/dispatch/UpdatedAgo.tsx
    - tests/admin-bookings-dispatch.test.ts
    - tests/use-dispatch-bookings.test.tsx
  modified: []

key-decisions:
  - "Date strings are passed to the RPC as Prague calendar dates (it filters the pickup_date text); never converted to UTC bounds"
  - "MAX_RANGE_DAYS = 62 is duplicated locally in the route (not imported from lib/prague-calendar.ts); the server stays the authority"
  - "A 401 sets a ref (stoppedRef) that survives query changes, so polling stays stopped until the component remounts"
  - "Auto-refresh is polling at 30 s; Realtime stays DISP-F2"

patterns-established:
  - "Admin range route: getAdminUser first, then parse, then service client, no-store on every answer including errors"

requirements-completed: [DISP-01, DISP-05]

coverage:
  - id: D1
    description: "Admin-only range route over admin_search_bookings with validation, 5-page cap, truncation flag, no-store and log hygiene"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/admin-bookings-dispatch.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "useDispatchBookings polls every 30 s with pause/visibility rules, drops stale responses, stops on 401"
    requirement: DISP-05
    verification:
      - kind: unit
        ref: "tests/use-dispatch-bookings.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "A driver step appears on the board/calendar within one poll interval on the deployed admin"
    requirement: DISP-05
    verification: []
    human_judgment: true
    rationale: "Needs the real driver app writing through the status service; localhost admin login is blocked by the fail-closed Upstash limiter, so it is checked in owner UAT on the deployed admin"

duration: 12min
completed: 2026-11-10
status: complete
---

# Phase 90 Plan 03: Dispatch data path Summary

**Admin-guarded, bounded range route over the existing admin_search_bookings RPC plus a 30 s polling hook (pause/visibility/stale/401 rules) and an isolated "Updated N s ago" ticker, with no migration and no new SQL.**

## Performance

- **Duration:** about 12 min
- **Started:** 2026-11-10T12:45Z (approx)
- **Completed:** 2026-11-10T12:58Z
- **Tasks:** 3
- **Files created:** 5

## Accomplishments

- `GET /api/admin/bookings/dispatch?startDate&endDate[&search][&tripType]` answers `{ bookings, truncated }`. `getAdminUser` runs first (401/403 before any parsing or RPC); dates are strict YYYY-MM-DD real calendar dates, start not after end, inclusive span at most 62 days (else 400 `invalid_range`); `tripType` whitelisted (400 `invalid_trip_type`); `search` trimmed and cut to 100 characters, bound as `p_query`. At most 5 RPC pages of 100 rows; `truncated` is true only when `total_count` exceeds rows returned. `Cache-Control: no-store` on every answer; RPC failure is `500 { error: 'DB read failed' }` and the log line carries the error message only.
- `useDispatchBookings` loads at once when the query changes, then every 30 s while the tab is visible and not paused. A tick skipped while paused or hidden is caught up when the pause ends or the tab becomes visible. Only the newest request writes state (sequence counter + AbortController). A 401 stops polling until remount and reports `unauthorized`; other non-2xx reports `failed` and the next tick retries. `patchRow` and `refresh` exposed.
- `UpdatedAgo` renders "Updated N s ago" / "Updated N min ago" / "Loading…" with its own 1 s interval and `aria-live="off"`, so the board does not re-render every second. No colour literals.

## Task Commits

1. **Task 1 (tracer): hook loads one range from the new route** - `29a30041` (security: route + tests), `07c97b44` (feat: hook tracer + tests)
2. **Task 2: validation, paging cap, truncation, log hygiene** - `2155ff4b` (security)
3. **Task 3: polling, pause rules, visibility, stale guard, 401 stop, UpdatedAgo** - `83941043` (feat)

Tracer gate (auto, end-of-phase, automated-only verify): the tracer `<verify>` was re-run green before expansion ("Tracer verified end-to-end - expanding").

## Verification

- `npx vitest run tests/admin-bookings-dispatch.test.ts tests/use-dispatch-bookings.test.tsx tests/admin-bookings.test.ts tests/admin-no-hardcoded-colors.test.ts` : 4 files, 168 tests passed. `tests/admin-bookings-kpi-decoupling.test.tsx` also green (4 tests).
- `npx tsc --noEmit`: zero errors for the new paths.
- `npx eslint --quiet` on all five files: clean.
- Acceptance greps: `getAdminUser` before first `searchParams` (awk exit 0), `p_sort: 'pickup_asc'` 1, `no-store` present, `slice(0, 100)` 1, `DISPATCH_POLL_MS = 30_000` 1, `visibilitychange` 2, `AbortController` 2, `router.refresh` 0, route commits start with `security:`. No `€` in the new files.

## Deviations from Plan

None - plan executed exactly as written. Two minor implementation notes: the route commit split into two `security:` commits (tracer, then hardening) as the plan's task layout implies, and the hook tracer was committed separately as `feat:`. A `prefer-const` lint error on the first draft of the hook timer was fixed before the Task 3 commit.

## Known Stubs

None.

## Threat Flags

None. The new endpoint is the one covered by T-90-04..T-90-08 in the plan's threat model; mitigations are implemented and tested (auth before RPC, 62-day and 5-page caps, no-store, log hygiene, tripType whitelist, 401 stops the poll).

## Issues Encountered

- The worktree has no `node_modules`; used a symlink to the main checkout's (not committed, ignored by `.gitignore`). No test failures traced to it.
- No Supabase MCP / migration work was needed (no new SQL), so nothing is pending for `ORCHESTRATOR_MCP_REQUIRED`.

## Next Phase Readiness

Plans 90-04..90-09 can import `useDispatchBookings`, `DispatchQuery`, `DispatchState`, `DISPATCH_POLL_MS` and `UpdatedAgo`, and call the route. The live "driver step shows up within one poll interval" check (DISP-05) belongs to owner UAT on the deployed admin.

## Self-Check: PASSED

- Files exist: route.ts, useDispatchBookings.ts, UpdatedAgo.tsx, both test files.
- Commits exist: 29a30041, 07c97b44, 2155ff4b, 83941043.
