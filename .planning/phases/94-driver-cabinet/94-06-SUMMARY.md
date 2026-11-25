---
phase: 94-driver-cabinet
plan: 06
subsystem: ui
tags: [driver-cabinet, rides, tab-bar, prague-day-groups, security]
requires:
  - "94-02: requireDriver, getDriverSession, (cabinet) layout, driver-cabinet.css (.driver-cabinet-header, .driver-sr-only)"
  - "94-03: newestAssignmentByBooking, countLiveOffers, format.ts label helpers"
provides:
  - "lib/driver-cabinet/rides.ts: RIDE_SELECT, RideBadge, RideRowView, DayGroup, DriverRidesSource, loadDriverRides, upcomingGroups, pastRideRows, pastMonthView, monthFeeTotal, isValidMonth, monthLabel"
  - "components/driver/CabinetTabBar.tsx (Rides / Offers / You with the live-offers badge)"
  - "components/driver/RideList.tsx: RideRow, DayGroupHeader, RidesEmptyState"
  - "app/(internal)/driver/(cabinet)/(tabs)/layout.tsx and /driver/rides (Upcoming); /driver redirects to /driver/rides"
affects: [94-07, 94-09, 94-10, 94-12]
tech-stack:
  added: []
  patterns:
    - "pure view-model functions over a loaded source (rows + newest-assignment map + plate), so Upcoming, Past and the month total are tested without rendering"
    - "layout reads the session only for the badge; the page gates itself with requireDriver (a layout is not a gate)"
    - "month = pickup_date prefix, so a 00:30 ride on the 1st counts in the new Prague month"
key-files:
  created:
    - lib/driver-cabinet/rides.ts
    - components/driver/CabinetTabBar.tsx
    - components/driver/RideList.tsx
    - "app/(internal)/driver/(cabinet)/(tabs)/layout.tsx"
    - "app/(internal)/driver/(cabinet)/(tabs)/rides/page.tsx"
    - "app/(internal)/driver/page.tsx"
    - tests/driver-cabinet-rides.test.ts
    - tests/driver-cabinet-rides-ui.test.tsx
  modified:
    - "app/(internal)/driver/(cabinet)/driver-cabinet.css"
key-decisions:
  - "Past counts only the newest assignment of a booking too (a reassigned booking is not the old driver's past ride); pending assignments count as past only on completed / no_show bookings, never on cancelled ones (a cancelled offer was never their ride)"
  - "monthFeeTotal keys on bookingStatus === 'completed' and the positive-integer feeCzk, so a pending assignment on a completed booking still contributes"
  - "Rows and the tab links use next/link (not a bare anchor) so the app router handles navigation and eslint stays clean"
  - "Badge for terminal rows (Completed / Cancelled / No-show) is already in the RideRow label map so 94-10 only has to render the Past list"
status: complete
commits: 2
plan_head_before: ecca97259fbe4e8862b994dc4e0d3394c93d6536
plan_head_after: 7436fd1d5c4d932961157906db3dea6013edc945
actuals:
  tokens: 12300
  tasks: 2
  commits: 2
completed: 2026-11-25
---

# Phase 94 Plan 06: Rides module, tab bar and Upcoming list Summary

A signed-in driver now opens `/driver` (redirects to `/driver/rides`) and sees every upcoming ride grouped by Prague day (Today, Tomorrow, Fri 27 Nov) with the bottom tab bar and the live-offers badge; the same module already computes the Past month view and the month fee total that 94-10 and 94-12 will render.

`commits: 2` counts the two task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1 (commit 2502c5b7, `security:`)**: `lib/driver-cabinet/rides.ts`. `loadDriverRides` selects `RIDE_SELECT` from `driver_assignments` with `.eq('driver_id', driverId)`, status in pending / accepted, limit 500, adds `newestAssignmentByBooking` and the driver's own `vehicle_plate`; a failed read gives an empty source (fail closed). `upcomingGroups` keeps newest-of-booking accepted rides on assigned / confirmed / started bookings and pending rides on started bookings, ascending by pickup instant, grouped by Prague date. `pastRideRows` / `pastMonthView` / `monthFeeTotal` / `isValidMonth` / `monthLabel` as specified (total null, never 0).
- **Task 2 (commit 7436fd1d, `security:`)**: `(tabs)/layout.tsx` (header, content, `CabinetTabBar` last; session read only for `countLiveOffers`), `CabinetTabBar` (nav "Cabinet", `aria-current`, 64px links, badge hidden at 0, `9+` cap, `Offers, n new` name, badge aria-hidden), `RideList` (`RideRow` single-line ellipsis address lines, wrapping meta line, "As directed", plate or "Pending", status badge for started rides; `DayGroupHeader` as h2; `RidesEmptyState` with "Review 1 offer" / "Review n offers" link), `/driver/rides` page (`requireDriver('/driver/rides')` first, `force-dynamic`, service client created in the request), `/driver` redirect, pressed-state rules in `driver-cabinet.css` (tokens only).

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-rides-ui.test.tsx tests/driver-cabinet-rides.test.ts tests/admin-no-hardcoded-colors.test.ts`: 3 files, 58 tests passed (rides 16, ui 16, plus the existing colour scan).
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/`; none in this plan's files.
- `npx eslint --quiet` on all source and test files: exit 0.
- Acceptance greps: forbidden columns in `rides.ts` 0; `.eq('driver_id', driverId)` 1; `newestAssignmentByBooking` used; `requireDriver('/driver/rides')` 1; `force-dynamic` in page and layout; `aria-label="Cabinet"` 1; no `€` / `formatEUR` / `czkToEur` in `RideList.tsx` or the page (0 / 0); `redirect('/driver/rides')` 1.

## Deviations from Plan

None - plan executed as written. Two points inside the plan's latitude: (1) rows and tab links use `next/link` instead of a plain `<a>`; (2) the fake DB returns whole embedded rows, so the "no client data" test asserts the recorded select strings (the real column gate) plus the serialised view models, not the raw source.

## Known Stubs

None. The tab links to `/driver/offers`, `/driver/you` and the row links to `/driver/rides/{id}` point at pages built in later plans (94-07, 94-09, 94-11); they are not stubs in this plan's output.

## Backstop (not covered by an automated check)

UI-SPEC E7 overflow at 360x640 and 390x844 (64px time column plus chevron leave the address column readable) is a held-out viewport check; the layout uses `min-width: 0` + ellipsis but was not measured in a browser (the page needs a signed-in cabinet session).

## Threat surface

T-94-29: every rides query is keyed by `.eq('driver_id', driverId)` from `requireDriver()`; test seeds two drivers and asserts isolation. T-94-30: `RIDE_SELECT` holds first name, route, class, driver fee only; the list renders no fee, and the test asserts no `€`, `Kč`, last name or client fare in the output. T-94-31: the page calls `requireDriver` itself before any read (tested: a thrown redirect makes no query); layout only reads the session; `force-dynamic`. T-94-32: React text rendering only, no `dangerouslySetInnerHTML`. No new surface beyond the register.

## Self-Check: PASSED

Files found: rides.ts, CabinetTabBar.tsx, RideList.tsx, (tabs)/layout.tsx, (tabs)/rides/page.tsx, driver/page.tsx, both test files. Commits found: 2502c5b7, 7436fd1d.
