---
phase: 90-dispatch-views
plan: 02
subsystem: ui
tags: [prague-time, intl, dst, calendar-layout, cookies, vitest]

requires:
  - phase: 90-dispatch-views
    provides: "lib/prague-date.ts (getPragueTodayISO, shiftIsoDate, pickupInstantMs) from earlier phases"
provides:
  - "lib/prague-calendar.ts: pure Prague-time day/minute placement, Monday-first weeks, month grid, overlap layout, dispatch ranges, custom range validation"
  - "lib/trip-duration.ts: client-safe estimateDurationMinutes (re-exported by lib/google-calendar.ts)"
  - "lib/admin-shell-prefs.ts: admin_bookings_view / admin_calendar_view cookies and resolveBookingsView"
affects: [90-dispatch-views board, 90-dispatch-views calendar, 90-dispatch-views workspace, 90-08, 90-09]

actuals:
  tokens: 8300
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "All dispatch date math through Intl Europe/Prague or pickupInstantMs; never local Date getters"
    - "describe.each over three process timezones (UTC, America/Los_Angeles, Pacific/Auckland) with process.env.TZ set in beforeAll"
    - "Strict-equality cookie parsers onto closed unions (no trim, no lowercase)"

key-files:
  created:
    - lib/prague-calendar.ts
    - lib/trip-duration.ts
    - tests/prague-calendar.test.ts
    - tests/dispatch-range.test.ts
  modified:
    - lib/prague-date.ts
    - lib/google-calendar.ts
    - lib/admin-shell-prefs.ts
    - tests/admin-shell-prefs.test.ts

key-decisions:
  - "pragueDayStartMs returns number via a cast over pickupInstantMs; callers pass real calendar dates, so the null branch is unreachable in the views"
  - "validateCustomRange does its calendar check by UTC round trip with getUTC* accessors, keeping local Date getters out of the module"
  - "lib/google-calendar.ts both imports (for buildCalendarEvent) and re-exports estimateDurationMinutes, so tests/google-calendar-sync.test.ts is unchanged"

patterns-established:
  - "Cluster-packing layoutDay with MIN_BLOCK_MIN so touching blocks do not overlap and short trips reserve 30 minutes"
  - "resolveBookingsView precedence: valid ?view= > non-empty ?search= (list) > cookie > list"

requirements-completed: [DISP-03, DISP-01]

coverage:
  - id: D1
    description: "A pickup instant lands on the correct Prague day and minute under any process timezone, including both 2027 DST days"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/prague-calendar.test.ts#prague-calendar under TZ=UTC|America/Los_Angeles|Pacific/Auckland"
        status: pass
    human_judgment: false
  - id: D2
    description: "Monday-first weeks, month grid and calendar windows (day/week/month) including the DST weeks"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/prague-calendar.test.ts#monthGrid, #calendarWindow, #mondayOf"
        status: pass
    human_judgment: false
  - id: D3
    description: "Overlapping blocks of one Prague day pack into side-by-side columns with a 30-minute minimum height"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/prague-calendar.test.ts#layoutDay"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dispatch range presets return Prague dates; custom range accepts real dates spanning at most 62 days inclusive"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/dispatch-range.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "comparePickup orders by pickup instant with booking_reference tie-break and unparseable instants last"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/prague-calendar.test.ts#comparePickup"
        status: pass
    human_judgment: false
  - id: D6
    description: "Remembered bookings-view and calendar-view cookies with strict parsing and view precedence"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/admin-shell-prefs.test.ts#parseAdminBookingsView, #parseAdminCalendarView, #resolveBookingsView"
        status: pass
    human_judgment: false
  - id: D7
    description: "estimateDurationMinutes moved to a client-safe module; Google Calendar sync behaviour unchanged"
    verification:
      - kind: unit
        ref: "tests/google-calendar-sync.test.ts"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-10
status: complete
plan_head_before: 9bb2470eff05365b57fa4680673d964abca12c4e
plan_head_after: 54a921c39e7d6bdd2a60424db6bb23b6da5ff663
commits: 3
---

# Phase 90 Plan 02: Prague-time calendar helpers Summary

**Pure Europe/Prague helpers (day/minute placement, Monday-first month grid, overlap layout, dispatch ranges, pickup ordering) proven under three process timezones and both 2027 DST days, plus a client-safe trip-duration estimate and the two remembered-view cookies**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-10T12:50:00Z
- **Completed:** 2026-11-10T12:56:09Z
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- Tracer: `pragueDateOf` and `pragueMinuteOfDay` place a booking instant on the right Prague day and minute under UTC, America/Los_Angeles and Pacific/Auckland, covering 2027-03-28 (02:xx gap) and 2027-10-31 (02:xx twice, 25 h day). Tracer gate: `<verify>` re-run before expansion, green.
- `layoutDay`, `monthGrid`, `calendarWindow`, `dispatchRange`, `validateCustomRange` (62-day cap) and `comparePickup` are pure and tested; none uses a local Date getter (grep gate returns 0).
- `estimateDurationMinutes` lives in an import-free `lib/trip-duration.ts`; `lib/google-calendar.ts` re-exports it, so the existing sync tests pass untouched.
- `admin_bookings_view` and `admin_calendar_view` cookies with strict parsers, serialisers and `resolveBookingsView` ready for the server page (90-09) and the calendar (90-08).

## Task Commits

1. **Task 1 (tracer): Prague day/minute/Monday helpers** - `16b7db82` (feat)
2. **Task 2: overlap layout, month grid, windows, ranges, trip-duration move** - `87dedb01` (feat)
3. **Task 3: bookings-view / calendar-view cookies and precedence** - `54a921c3` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written first in each task and run to confirm they failed (module absent) before the implementation was added; each task is one commit rather than separate test/feat commits._

## Files Created/Modified

- `lib/prague-calendar.ts` - Prague day/minute/start/Monday/time, comparePickup, layoutDay, monthGrid, calendarWindow, dispatchRange, validateCustomRange
- `lib/trip-duration.ts` - client-safe estimateDurationMinutes (no imports)
- `lib/prague-date.ts` - header comment only: no longer labelled server-only
- `lib/google-calendar.ts` - imports and re-exports estimateDurationMinutes from lib/trip-duration
- `lib/admin-shell-prefs.ts` - two new cookies, parsers, serialisers, resolveBookingsView; serializePrefCookie value widened to string
- `tests/prague-calendar.test.ts`, `tests/dispatch-range.test.ts` - TZ matrix, DST fixtures, layout, grids, ranges
- `tests/admin-shell-prefs.test.ts` - appended hostile-value tables and precedence cases

## Decisions Made

- `pragueDayStartMs` is typed `number` (cast over the nullable `pickupInstantMs`); callers always pass real calendar dates from the grid helpers.
- Calendar validation uses a UTC round trip with `getUTC*` accessors, so the module stays free of local Date getters.
- `resolveBookingsView` treats a non-empty `?search=` as "list" without trimming, matching the no-trim cookie discipline.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Verification note: the `verify` skill steps were run scoped to changed files (tsc: no errors in changed paths; eslint exit 0; vitest 176/176 across the five plan-level test files). Full-suite and browser steps skipped (pure library change, no UI).

## Known Stubs

None.

## Threat Flags

None. T-90-02 (cookie/query tampering) mitigated by strict-equality parsers and hostile-value tables; T-90-03 (placement integrity) mitigated by Intl Europe/Prague only, the local-getter grep gate and the three-timezone matrix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 90-08 (calendar) can import `layoutDay`, `calendarWindow`, `monthGrid`, `estimateDurationMinutes`, `parseAdminCalendarView`.
- 90-09 (server page) can import `resolveBookingsView`, `dispatchRange`, `validateCustomRange`, `comparePickup`.
- No blockers.

## Self-Check: PASSED

- Files present: lib/prague-calendar.ts, lib/trip-duration.ts, tests/prague-calendar.test.ts, tests/dispatch-range.test.ts
- Commits present: 16b7db82, 87dedb01, 54a921c3
- Acceptance greps: local-getter count 0, `export { estimateDurationMinutes } from '@/lib/trip-duration'` 1, `^import` in trip-duration 0, MAX_RANGE_DAYS and MIN_BLOCK_MIN constants present, no `.trim`/`.toLowerCase` or imports in admin-shell-prefs, no "server-only" in prague-date.

---
*Phase: 90-dispatch-views*
*Completed: 2026-11-10*
