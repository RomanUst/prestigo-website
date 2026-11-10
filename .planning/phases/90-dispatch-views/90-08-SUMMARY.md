---
phase: 90-dispatch-views
plan: 08
subsystem: ui
tags: [calendar, prague-time, dst, react, admin, side-panel, polling, vitest]

requires:
  - phase: 90-dispatch-views
    provides: "lib/prague-calendar.ts, lib/trip-duration.ts, admin_calendar_view cookie (90-02)"
  - phase: 90-dispatch-views
    provides: "useDispatchBookings, UpdatedAgo, dispatch range route (90-03)"
  - phase: 90-dispatch-views
    provides: "BookingPanelProvider / useBookingPanel / useBookingEvents, shared side panel (90-05)"
provides:
  - "components/admin/dispatch/calendarModel.ts: toCalendarItems, itemsByDay, monthCells, shiftIsoMonth, formatMinute (pure Prague placement)"
  - "components/admin/dispatch/DispatchCalendar.tsx: DispatchCalendar({ search, tripType, initialView }) with day, week and month views"
  - "tests/dispatch-calendar.test.tsx: 43 tests under TZ America/Los_Angeles"
affects: [90-09 BookingsWorkspace (mounts the calendar from the Calendar tab)]

actuals:
  tokens: 14800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Calendar placement only through pragueDateOf / pragueMinuteOfDay of the pickup instant; own CSS grid, no calendar library"
    - "Views merge BookingEvents: 'patched' -> patchRow in place, 'stale' -> refresh; selection snapshot kept fresh through syncRows"

key-files:
  created:
    - components/admin/dispatch/calendarModel.ts
    - components/admin/dispatch/DispatchCalendar.tsx
    - tests/dispatch-calendar.test.tsx
  modified: []

key-decisions:
  - "Pixel scale 1.25 px per minute so the 30-minute minimum block (37.5 px) holds two text lines (time + reference, status label)"
  - "A block ending exactly at the next Prague midnight is a full-day block, not 'continues'; only a real spill-over gets the marker"
  - "On the 25 h day the wall clock runs backwards inside the repeated 02:xx hour; if the wall end is not after the start the block keeps its real length (start + length, clamped to 1440) instead of being treated as a midnight spill-over"
  - "'+N' drill-down switches to the day view without writing admin_calendar_view (navigation, not a changed preference); only the Day/Week/Month tabs write the cookie"
  - "Items are sorted by comparePickup (instant, then reference) before layoutDay, so equal starts always lay out the same way"

patterns-established:
  - "Month cells: monthCells(items, days, perDay) -> { shown, more } per Prague day"
  - "shiftIsoMonth: month stepping by string and Date.UTC arithmetic with day clamping (no local Date)"

requirements-completed: [DISP-03, DISP-04, DISP-05]

coverage:
  - id: D1
    description: "A booking lands on its Prague day and minute whatever the browser timezone, incl. 2027-10-31T00:30Z -> Sunday 02:30 and 2027-10-31T23:30Z -> 1 November"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/dispatch-calendar.test.tsx#calendarModel.toCalendarItems and #DispatchCalendar week view (TZ America/Los_Angeles)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both 2027 DST weeks: 2027-03-28T01:00Z at 03:00 with nothing in the missing 02:00 hour; 2027-10-31 shows both 02:30 pickups"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/dispatch-calendar.test.tsx#DispatchCalendar DST weeks"
        status: pass
    human_judgment: false
  - id: D3
    description: "Day, week and month views with Prev/Next/Today in Prague days, remembered view cookie, month +N drill-down"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/dispatch-calendar.test.tsx#DispatchCalendar view switch and navigation, #month view"
        status: pass
    human_judgment: false
  - id: D4
    description: "Overlap layout: touching blocks full width, overlapping side by side, deterministic order on equal starts; blocks coloured from status tokens with time, reference and status label in text"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/dispatch-calendar.test.tsx#calendarModel.itemsByDay, #week view (tracer)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Clicking a block or month item opens the shared side panel with that booking"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/dispatch-calendar.test.tsx (block click, month item click)"
        status: pass
    human_judgment: false
  - id: D6
    description: "30 s polling honours pausePolling (move dialog open -> no fetch, one catch-up after), patched events recolour in place, stale events refetch, Updated N s ago, error/truncated/empty lines, Show all"
    requirement: DISP-05
    verification:
      - kind: unit
        ref: "tests/dispatch-calendar.test.tsx#DispatchCalendar events and polling pause, #states, #Show all"
        status: pass
    human_judgment: false
  - id: D7
    description: "Calendar looks right in a real browser in a non-Prague OS timezone: block text legibility at 30 minutes, overlap widths, sticky header, side panel layering over the grid, dark and light themes"
    verification: []
    human_judgment: true
    rationale: "No browser check from a worktree (admin needs login and Supabase env); jsdom covers behaviour and placement, not layout, scroll or z-order."

duration: 40min
completed: 2026-11-10
status: complete
plan_head_before: 8b7f003b51081e7a2dabe54bab3ee6d8b099666e
plan_head_after: 7f5843f8b0275632c0000e26fe3395e284436b0b
commits: 3
---

# Phase 90 Plan 08: Dispatch calendar Summary

**Day, week and month calendar built on its own grid, placing every booking by Prague day and minute (proven under TZ America/Los_Angeles and both 2027 DST weeks), coloured by status tokens, opening the shared side panel and refreshing every 30 seconds without fighting the operator.**

## Performance

- **Duration:** about 40 min
- **Tasks:** 3 (1 tracer, 2 auto/tdd)
- **Files:** 3 created, 0 modified outside the plan

## Accomplishments

- Tracer: `toCalendarItems` / `itemsByDay` (pure) and the week grid. The 2027-10-31T00:30Z booking sits in Sunday's column at 02:30 with its reference and status label under a Los Angeles process timezone; the 23:30Z booking is on 1 November. Tracer gate: `<verify>` re-run green before expanding.
- Day and month views, Prev / Next / Today (day, 7 days, or a calendar month through `shiftIsoMonth`), Day/Week/Month tabs that write `admin_calendar_view`, month grid with the three earliest bookings per day and a `+N` button that drills into the day.
- Show all (unpaid, pending, cancelled, faded), `patched` events recolour in place, `stale` events refetch, `pausePolling` wired into `useDispatchBookings`, `UpdatedAgo`, and the unauthorized / failed / truncated / empty lines with the board's wording.

## Task Commits

1. Task 1 (tracer): `2bb948f4` feat(90-08): week calendar places bookings by Prague day and minute
2. Task 2: `a2b83195` feat(90-08): day and month calendar views, Prev/Next/Today, remembered view
3. Task 3: `7f5843f8` feat(90-08): calendar Show all, live events, updated-ago and state lines

## Verification

- `npx vitest run tests/dispatch-calendar.test.tsx tests/use-dispatch-bookings.test.tsx tests/prague-calendar.test.ts tests/admin-no-hardcoded-colors.test.ts tests/booking-detail-panel.test.tsx`: 193/193 pass (43 in the calendar file).
- `npx tsc --noEmit`: no errors outside the 8 baseline ones in `tests/`. `npx eslint --quiet` on the three files: clean.
- Acceptance greps: local Date getters in the two source files 0; `estimateDurationMinutes` present, `lib/google-calendar` absent; `CALENDAR_ACTIVE_STATUSES`, `serializeCalendarViewCookie`, `monthGrid`/`calendarWindow`, `showAll`, `pausePolling`, `UpdatedAgo` present; `€` count 0; no transform / filter / will-change / contain on calendar wrappers (only a comment names them).

## Deviations from Plan

**1. [Rule 1 - Bug avoided] 25 h day: repeated 02:xx hour**
- **Found during:** Task 1 (model design)
- **Issue:** the plan's literal rule ("end minute after start, else 1440 with continues") would draw a pickup at the first 02:30 lasting 90 minutes as running past midnight, because the wall clock goes back to 02:00 at its end.
- **Fix:** when the end falls on the same Prague date but its wall minute is not after the start, the block keeps its real length (start + length, clamped to 1440) and does not get the marker. A block ending exactly at the next Prague midnight is also a full-day block rather than "continues".
- **Files:** components/admin/dispatch/calendarModel.ts. **Commit:** 2bb948f4

**2. [Process] `pausePolling` wired in Task 1**
- `paused: pausePolling` was passed to the hook from the first commit (a missing pause would have been a regression window), so the Task 3 pause test passed on its first run instead of failing first. The other Task 3 tests (Show all, events, states) were run red before the implementation.

**3. [Process] Tasks 2 and 3 `tdd="true"` committed as one commit each** (tests and implementation together; RED runs done: 9 failing before each implementation).

**Total deviations:** 3 (1 Rule 1, 2 process). No shared module was touched; nothing in `files_modified` was exceeded.

## Known Stubs

None.

## Threat Flags

None. T-90-19 mitigated: placement only through `pragueDateOf` / `pragueMinuteOfDay` (grep gate 0), tests under America/Los_Angeles cover the midnight booking and both 2027 DST weeks. No package installed, no calendar library added (T-90-SC accepted).

## Notes for plan 90-09 (workspace) and the owner

- Mount: `<BookingPanelProvider><DispatchCalendar search={...} tripType={...} initialView={parseAdminCalendarView(cookie)} /></BookingPanelProvider>`. The component reads the shared provider itself; it takes no rows or callbacks.
- The calendar owns its own anchor date and view state (seeded once from `initialView`); a later prop change does not reset them (same rule as AdminShell).
- `search` and `tripType` are the shared filters; any change refetches the current window through the hook's query URL.
- No wrapper around the calendar may add a transform, filter, `will-change` or `contain` (side panel is `position: fixed`).
- `rows.length` is the hook's last answer; it is not cleared when the window changes, so old rows can sit under the new grid for the instant before the new answer lands (they only draw on days that are visible in both windows).

## Needs an owner look in a browser (not coverable in jsdom)

1. Deployed admin, OS timezone set to America/New_York (or Auckland): open the Calendar tab, week view; a pickup around Prague midnight sits on the Prague day and minute shown in the booking panel.
2. Week of 2027-03-22 and 2027-10-25 (or the live equivalent): the 02:00 row on the change day is empty (spring) / both 02:xx pickups show in the 02:00 area (autumn).
3. Legibility of 30-minute blocks (two lines), overlapping blocks side by side, the sticky day header while scrolling, the grid opening scrolled to 06:00.
4. Both themes: status colours (violet / amber / teal / info / ok / danger families) and the faded Show all blocks stay readable.
5. Clicking a block with the side panel already open switches the booking; the panel sits above the grid and the grid stays clickable.
6. Month view on a narrow laptop: horizontal scroll inside the grid, `+N` drill-down, today highlight.

## Self-Check: PASSED

- Files exist: calendarModel.ts, DispatchCalendar.tsx, tests/dispatch-calendar.test.tsx.
- Commits 2bb948f4, a2b83195, 7f5843f8 present; `git rev-list --count` from plan base 8b7f003b = 3.
- STATE.md and ROADMAP.md untouched.
