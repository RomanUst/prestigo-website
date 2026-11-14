---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 13
subsystem: ui
tags: [driver-trip, google-maps, stops, airport-pickup, free-waiting]
status: complete

requires:
  - phase: 91-06
    provides: lib/booking-stops.ts (loadStopsSafe) and the booking_stops table
  - phase: 91-07
    provides: lib/airport-pickup.ts (freeWaitUntilMs)
  - phase: 91-09
    provides: wizard store stops with a place and waitMinutes
provides:
  - driver trip page rows Arrival (landing + pickup), Free waiting until and Stop N with its wait
  - RouteMap stops prop (stopover waypoints, max 5, never optimised) with numbered markers and summed legs
  - StickyBookingPanel and driver TripMap pass the stops to the map
affects: [91-10, 91-12, 91-14]

actuals:
  tokens: 28000
  tasks: 2
  commits: 2
plan_head_before: d7533483c4e2dc329d7dba47472bc87f1e23d932
plan_head_after: e9a8e6d7f5c585b47ef33608be26a64a9088553f

tech-stack:
  added: []
  patterns:
    - "map effect keyed on a primitive coordinate string, so a new array identity never rebuilds the map or repeats the Directions call"

key-files:
  created: []
  modified:
    - app/(internal)/driver/trip/[token]/page.tsx
    - app/(internal)/driver/trip/[token]/TripScreen.tsx
    - app/(internal)/driver/trip/[token]/TripDetails.tsx
    - app/(internal)/driver/trip/[token]/TripMap.tsx
    - components/booking/RouteMap.tsx
    - components/booking/StickyBookingPanel.tsx
    - tests/driver-trip.test.ts
    - tests/driver-trip-screen.test.tsx
    - tests/RouteMap.test.tsx
    - tests/StickyBookingPanel.test.tsx

key-decisions:
  - "Free waiting is pickup instant + the live no-show minutes (airport 60 / city 30 by default), formatted in Prague time; shown for every booking, the landing/pickup row only when a landing is stored"
  - "The page maps only position, address, wait and coordinates from a stop; fee columns never reach the driver component"
  - "Stops are read after the token view checks (ended, reassigned, completed never reach booking_stops), through loadStopsSafe so a read error leaves the page working"

requirements-completed: [STOP-04, STOP-05, STOP-01]

duration: 25min
completed: 2026-11-12
---

# Phase 91 Plan 13: Driver trip stops, landing and free waiting; map through the stops Summary

The driver trip page now lists landing, pickup, "Free waiting until HH:MM" (counted from the pickup with the live no-show setting) and every stop with its wait, and both the wizard and driver maps route through the stops in the client's order with numbered markers and summed leg totals.

## What was built

**Task 1 (tracer, commit b95146b3):** `page.tsx` selects `landing_date`, `landing_time`, `pickup_offset_min`; after the view checks it loads the booking's stops with `loadStopsSafe`, reads `getNoShowThresholds`, and computes `freeWaitUntil` with `freeWaitUntilMs(pickupMs, airport ? airportMin : cityMin)` formatted by `formatPragueTime`. `TripScreen` threads `landing`, `freeWaitUntil` and `stops` to `TripDetails`, which renders "Landing 14:00", "Pickup 14:30" (Arrival row), "Free waiting until 15:30", and per stop "Stop N", the address and "wait 45 min" / "no waiting". No amount or fee is selected, mapped or rendered (tested).

**Task 2 (commit e9a8e6d7):** `RouteMap` takes `stops` (first 5 used), sends them as `{ location, stopover: true }` waypoints (no `optimizeWaypoints`, no `waypoints` key at all without stops), extends the bounds, draws a numbered marker per stop, falls back to a polyline through the stops, and reports the sum of all legs to `onRouteInfo` (the `legs?.[0]` read is gone). The effect depends on a primitive key of the stop coordinates. `TripMap` forwards the trip stops with coordinates; `StickyBookingPanel` forwards the store stops that have a place.

## Verification

- `npx vitest run` on driver-trip, driver-trip-screen, driver-trip-cash, driver-trip-progress, RouteMap, StickyBookingPanel (280 tests) and BookingWizard, Step3Vehicle, shared-sections-i18n (216 tests): all pass.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`.
- `npx eslint --quiet` on all changed source and test files: clean.
- `grep -c "stopover: true"` in RouteMap = 1; `grep -c "legs?.\[0\]"` = 0; `landing_time` in page.tsx; "Free waiting until" in TripDetails.

## Deviations from Plan

None - plan executed as written. The tests were written alongside the implementation in the same task commit rather than as a separate failing commit first.

## Issues Encountered

None. The driver-trip page test now mocks `@/lib/booking-stops` and the threshold read (`@/lib/no-show-wait`) so the page's single `driver_assignments` select assertion stays meaningful; the real `loadStopsSafe` path is also exercised by `tests/driver-trip-cash.test.ts` against its Supabase stub (read error -> empty stops).

## Known Stubs

None.

## Threat Flags

None. T-91-39 (stops read by the validated booking id after the view checks; no money rendered) and T-91-40 (React text rendering only) are covered by tests.

## Self-Check: PASSED

- Files modified exist and are committed (b95146b3, e9a8e6d7).
