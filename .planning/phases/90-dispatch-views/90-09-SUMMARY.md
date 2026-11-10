---
phase: 90-dispatch-views
plan: 09
subsystem: ui
tags: [react, admin, bookings, tabs, server-component, cookies, board, calendar, vitest]

requires:
  - phase: 90-dispatch-views
    provides: "resolveBookingsView, parseAdminCalendarView, serializeBookingsViewCookie, cookie names (90-02)"
  - phase: 90-dispatch-views
    provides: "BookingPanelProvider, shared side panel, setReferenceSearchHandler (90-05)"
  - phase: 90-dispatch-views
    provides: "DispatchBoard (90-07), DispatchCalendar (90-08)"
provides:
  - "components/admin/BookingsWorkspace.tsx: BookingsWorkspace({ initialView, initialCalendarView }) - header, KPIs, New Booking, List/Board/Calendar tablist, shared filters, ONE BookingPanelProvider, only the active view mounted"
  - "app/(internal)/admin/(dashboard)/bookings/page.tsx: async server page resolving the first view from ?view=, ?search= and the two cookies"
  - "BookingsTable optional props initialSearch, initialTripType, onFiltersChange"
  - "tests/bookings-workspace.test.tsx (29 tests); tests/admin-bookings-kpi-decoupling.test.tsx retargeted to BookingsWorkspace"
affects: [phase 90 verification, owner UAT on the deployed admin]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Server page resolves the first view, client workspace seeds state once and then owns it (same rule as AdminShell)"
    - "Only the active view is mounted, so only the visible board or calendar polls"
    - "Shared filters live in the workspace; the list reports its debounced filters back through onFiltersChange, board and calendar edit them in a shared filter bar"

key-files:
  created:
    - components/admin/BookingsWorkspace.tsx
    - tests/bookings-workspace.test.tsx
  modified:
    - app/(internal)/admin/(dashboard)/bookings/page.tsx
    - components/admin/BookingsTable.tsx
    - tests/admin-bookings-kpi-decoupling.test.tsx

key-decisions:
  - "Calendar tab reads admin_calendar_view from document.cookie each time it mounts (falls back to the server-resolved value), so the remembered Day/Week/Month survives a tab switch"
  - "Tab click on the already active tab is a no-op; arrow keys, Home and End move between tabs (roving tabindex)"
  - "The shared filter bar is mounted only for Board and Calendar; the list keeps its own bar and reports back"
  - "A remount of the list (New Booking) now keeps the shared search and trip type instead of resetting them"

patterns-established:
  - "BookingsTable filters: initial values read once (deep link wins), onFiltersChange through a ref effect keyed on [debouncedSearch, tripType]"

requirements-completed: [DISP-01, DISP-03, DISP-04]

coverage:
  - id: D1
    description: "Three tabs on /admin/bookings (tablist, aria-selected), no sidebar change; the server page renders the right first tab from valid ?view=, ?search= (list), the cookie, else list, including hostile values"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/bookings-workspace.test.tsx#BookingsPage (server) and #BookingsWorkspace - tabs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tab switch writes admin_bookings_view (Path=/admin, one year, SameSite=Lax) and replaces only the view URL parameter, keeping history.state and other parameters; the calendar reopens on the remembered view"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/bookings-workspace.test.tsx#BookingsWorkspace - tabs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shared search and trip type across List, Board and Calendar; ?search= deep link still opens the list with horizon all, is stripped, and then feeds the board"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/bookings-workspace.test.tsx#BookingsWorkspace - shared filters and #BookingsTable - shared filter props; tests/BookingsTable.test.tsx deep-link tests unchanged and green"
        status: pass
    human_judgment: false
  - id: D4
    description: "One provider: a booking opened in the list stays open in the single side panel after switching to Board and Calendar; a board card opens the same panel; New Booking refreshes the active view"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/bookings-workspace.test.tsx#BookingsWorkspace - one side panel and #New Booking refresh"
        status: pass
    human_judgment: false
  - id: D5
    description: "KPI counters keep two independent fetches with byte-identical URLs and are not refetched by tab switches; only the mounted view polls"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/admin-bookings-kpi-decoupling.test.tsx (4, assertions unchanged) and tests/bookings-workspace.test.tsx#BookingsWorkspace - KPI counters, #polling"
        status: pass
    human_judgment: false
  - id: D6
    description: "The tabs, filter bar and the three views look and behave right in the real admin: layout, tab styling in both themes, side panel layering across tab switches, first-paint hydration of a board/calendar tab"
    verification: []
    human_judgment: true
    rationale: "No browser check from a worktree (admin needs login and Supabase env); jsdom covers behaviour, not layout, z-order or SSR hydration."

duration: 25min
completed: 2026-11-10
status: complete
plan_head_before: e94143974f40e17faa36d76932a91efd5e69cf82
plan_head_after: 27090bb04d210598d1eb1d92b5616e45f98d915a
commits: 2
---

# Phase 90 Plan 09: Bookings workspace Summary

**/admin/bookings is now one workspace with List, Board and Calendar tabs around a single side panel: a server page resolves the first tab from ?view=, the ?search= deep link and the remembered cookie, tab clicks remember the choice in a cookie and the URL, and search and trip type follow the operator across all three views.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 2 (1 tracer, 1 tdd)
- **Files:** 2 created, 3 modified

## Accomplishments

- Tracer: the page body moved verbatim into `BookingsWorkspace` (KPI fetches with their exact URL shapes, settings gate, header, New Booking, `refreshKey`), wrapped in one `BookingPanelProvider`, with a tablist and a tabpanel that mounts only the active view. `page.tsx` is an async server component. Tracer `<verify>` (workspace, KPI, table, shell-prefs suites, tsc, eslint) was green before expanding.
- Shared filters: `BookingsTable` takes `initialSearch`, `initialTripType`, `onFiltersChange` (deep link and its regexes untouched). Board and calendar get a filter bar (300 ms debounced search, All/Transfer/Hourly/Daily chips).

## Task Commits

1. Task 1 (tracer): `c27a174b` feat(90-09): bookings workspace with List, Board and Calendar tabs and a server page resolving the first view
2. Task 2: `27090bb0` feat(90-09): shared search and trip-type filters across the bookings tabs

## Verification

- `npx vitest run tests/bookings-workspace.test.tsx tests/BookingsTable.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx tests/dispatch-board.test.tsx tests/dispatch-calendar.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/booking-detail-panel.test.tsx tests/admin-shell-prefs.test.ts`: 336/336 pass (29 in the workspace file).
- `npx tsc --noEmit`: 8 errors, the baseline ones; none in the changed files. `npx eslint --quiet` on the changed files: clean.
- Acceptance greps: no `use client` in page.tsx; `resolveBookingsView(` 1, `await cookies()` 1; `limit=1` and `limit=100` KPI URLs in the workspace; `window.history.state` present; KPI test names `BookingsWorkspace` 11 times, `bookings/page'` 0; AdminSidebar.tsx and tests/BookingsTable.test.tsx untouched; `DEEP_LINK_REFERENCE` line unchanged; no euro sign in changed source.

## Deviations from Plan

**1. [Judgment] Server-page tests run under jsdom, not a node environment**
- The repo default is jsdom and the plan's files list holds one test file; the page is a plain async function with `next/headers` mocked, so it needs no DOM but runs fine there. No extra file was added.

**2. [Judgment] BookingsTable prop tests live in tests/bookings-workspace.test.tsx**
- `tests/BookingsTable.test.tsx` must stay untouched (acceptance gate), so the `initialSearch` / `initialTripType` / `onFiltersChange` cases are in a `BookingsTable - shared filter props` block of the workspace test.

**3. [Process] tdd="true" tasks committed test and code together** (no separate RED commit); the Task 2 RED run showed the 4 filter tests failing before the implementation.

**Total deviations:** 3 (2 judgment, 1 process). No shared module outside `files_modified` was changed.

## Behaviour notes

- Filters are shared in the workspace; the list's own Unpaid chip, horizon and date range stay local to the list.
- A list remount after New Booking now keeps the shared search and trip type (previously reset to defaults); the ?search= deep link is still stripped once applied.
- A typed but not yet debounced search (under 300 ms) is dropped if the operator switches tab at that instant.
- `?view=board&search=X` opens the board but does not seed the board's filter from `search` (only the list consumes the deep link).

## Known Stubs

None.

## Threat Flags

None. T-90-20: view and calendar view map onto closed unions by strict equality (tested with `BOARD`, a script string and `?view=kanban`). T-90-21: `readBookingDeepLink` and its regexes unchanged (grep gate), deep-link tests in `tests/BookingsTable.test.tsx` pass unchanged. T-90-22: the page stays under `(dashboard)` so the layout admin gate still runs; no layout or sidebar file changed.

## Needs an owner look in a browser (not coverable in jsdom)

1. Deployed admin `/admin/bookings`: tab row and filter bar styling in both themes; the active tab matches the cookie after a hard reload, and `?view=board` / `?view=calendar` links open the right tab on first paint with no hydration warning in the console (the calendar and board read the Prague date at render).
2. Open a booking in List, switch to Board and Calendar: the side panel stays open above all three views and the grid/board stays clickable.
3. Type a search on the Board, switch to List and back: the same text and trip type chip appear everywhere.
4. Network tab: only the visible view fetches `/api/admin/bookings/dispatch` every 30 s; List fetches nothing on a timer; the KPI counters load once.
5. `/admin/bookings?search=<reference>` from a CRM link still opens the list with the search applied.
6. Phase-level UAT from the plan: drag cards on desktop and touch, calendar under a non-Prague OS timezone, driver step on the trip page updating board and calendar within about 30 s.

## Self-Check: PASSED

- Files exist: components/admin/BookingsWorkspace.tsx, tests/bookings-workspace.test.tsx.
- Commits c27a174b and 27090bb0 present; `git rev-list --count e94143974f40e17faa36d76932a91efd5e69cf82..HEAD` = 2 before this SUMMARY commit.
- STATE.md and ROADMAP.md untouched; node_modules symlink not committed.
