---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 12
subsystem: admin
tags: [admin, stops, landing, booking-panel, security, patch-guards]
requires:
  - phase: 91-06
    provides: lib/booking-stops.ts (attachStops, loadStopsByBookingIds)
  - phase: 91-07
    provides: lib/airport-pickup.ts (LANDING_OFFSETS, pickupFromLanding), bookings.landing_date / landing_time / pickup_offset_min
provides:
  - "stops on every row of GET /api/admin/bookings and GET /api/admin/bookings/dispatch"
  - "components/admin/TripRouteSection.tsx (landing, pickup + offset, stops, waiting total) mounted in BookingDetailPanel"
  - "AdminBookingStop type; landing_date, landing_time, pickup_offset_min, stops on AdminBooking"
  - "PATCH 422 stops_edit_unsupported and 422 landing_pickup_mismatch; pickup_offset_min kept in step with a manual pickup edit"
affects: [91-15, 91-16]
tech-stack:
  added: []
  patterns: ["stops read only through lib/booking-stops", "server-side landing + offset invariant on the generic trip edit"]
key-files:
  created:
    - components/admin/TripRouteSection.tsx
    - tests/trip-route-section.test.tsx
  modified:
    - app/api/admin/bookings/route.ts
    - app/api/admin/bookings/dispatch/route.ts
    - components/admin/bookingTypes.ts
    - components/admin/BookingDetailPanel.tsx
    - components/admin/TripEditPanel.tsx
    - tests/admin-bookings.test.ts
    - tests/admin-bookings-dispatch.test.ts
    - tests/admin-bookings-edit-payment.test.ts
key-decisions:
  - "A stops read error fails closed: GET answers the existing 500 'DB read failed'; the PATCH price guard answers 500 and writes nothing"
  - "The offset audit row is written to booking_edit_audit_log only (field pickup_offset_min), not into the client 'booking changed' email entries"
  - "For a booking with stops the price review starts from the booking's own amount, not from a recompute that leaves out the stops"
  - "TripRouteSection returns null without stops and without a landing, so the children slot for Move pickup (91-15) only appears for those bookings"
requirements-completed: [STOP-04, STOP-05]
status: complete
commits: 2
plan_head_before: d7533483c4e2dc329d7dba47472bc87f1e23d932
plan_head_after: 78fe499eb755015d81f4525994c21ae9584790e5
actuals:
  tokens: 28000
  tasks: 2
  commits: 2
---

# Phase 91 Plan 12: Stops and landing in the admin Summary

The operator now sees, in the one booking panel shared by list, board and calendar, the landing time beside the pickup time (+ offset), every stop in order with its waiting time and paid blocks, and the stored "Waiting at stops" total. Two server guards on the generic trip edit keep what the client paid for the detour and waiting from being dropped, and keep landing + offset equal to the pickup.

`commits: 2` counts the two code commits; the SUMMARY docs commit follows (so `plan_head_after` is the head before it).

## What was built

- **GET routes**: `/api/admin/bookings` and `/api/admin/bookings/dispatch` call `attachStops` after the `admin_search_bookings` RPC (admin guard stays first; dispatch keeps `no-store`). Rows carry `stops: []` when none. Landing columns arrive with the row (`select b.*`), no SQL change. A stops read error answers 500 `DB read failed` and logs the message only.
- **TripRouteSection**: "Landing 14:00", "Pickup 14:30 (+30 min)" (offset 0 reads "at landing"; the landing date is shown when it differs from the pickup date), an ordered stop list ("1. Karlovy Vary", "45 min", "2 × 15 min paid" and the stop fee through `formatEUR`, or "Free waiting"), "Address removed" for an erased address, and the "Waiting at stops" total from `waitingTotalEur`. Theme tokens only. `children` slot at the end.
- **PATCH price branch** (Pitfall 10, T-91-38): after the in-flight precheck, a price-affecting edit of a booking with stops answers 422 `stops_edit_unsupported` unless `override_price` is true.
- **PATCH pickup guard** (D-07, D-18, T-91-47): for a booking with landing columns and a changed pickup date/time, the new pickup must equal `pickupFromLanding(landing, offset)` for one of `LANDING_OFFSETS`; the matching `pickup_offset_min` is written in the same update and audited (old -> new). Otherwise 422 `landing_pickup_mismatch` before any write. Midnight roll-over works through `pickupFromLanding`. Bookings without landing columns are unchanged.
- **TripEditPanel**: the stops note in the price review ("This booking has stops: ... Set the price by hand."), the landing hint under the pickup fields, both 422 codes mapped, and the saved row gets the new `pickup_offset_min`.

## Tests

- `tests/trip-route-section.test.tsx` (new, 18): tracer render, order, free stop, sum of stored fees, erased address, midnight date, offset 0, children slot, null render, panel mount order (after the flight block, before the grid), TripEditPanel hint / notes / error mappings / offset in the row patch.
- `tests/admin-bookings.test.ts` (+22): GET stops, stops read failure, auth before stops; stops guard (vehicle, address, override, no price field, no stops, fail closed); landing guard (offset 60 written and audited 30 -> 60, 14:40 refused, all offsets, midnight roll-over both ways, date-only edit, unchanged pickup, no landing columns, `HH:MM:SS` stored time). The stops loader is stubbed so the ordered `from()` chains of the existing tests stay valid.
- `tests/admin-bookings-dispatch.test.ts` (+4, one updated): real loader through a fake `booking_stops` table (position order, `[]`, no query for an empty range, 500 with no-store and no address in the log, no read before the guard).
- `tests/admin-bookings-edit-payment.test.ts`: mocks the stops loader (existing tests encode the old call sequence).

Verification: `tests/trip-route-section`, `admin-bookings`, `admin-bookings-dispatch`, `admin-bookings-edit-payment`, `BookingsTable`, `booking-detail-panel`, `admin-no-hardcoded-colors`, `admin-bookings-status-gates`, `admin-search-bookings-email`, `admin-bookings-payment-link`, `gnet-status-push`, `noshow-alert`, `payments-lifecycle`, `bookings-workspace`, `dispatch-board`, `admin-bookings-kpi-decoupling` all green. `tsc --noEmit`: only the 8 baseline errors in `tests/`. ESLint clean on all touched files.

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing test file outside files_modified updated**
- **Found during:** Task 2 verification
- **Issue:** `tests/admin-bookings-edit-payment.test.ts` drives the real PATCH route with a fake `from()`; the new stops read made 4 of its tests answer 500.
- **Fix:** mocked `@/lib/booking-stops` (empty Map) in that file.
- **Commit:** 78fe499e

**2. Commit granularity**
- Task 1 and Task 2 touch the same files (`route.ts`, `admin-bookings.test.ts`, the new component test), and interactive `git add -p` is not available. Commit 1 (`feat`, 04906646) holds the self-contained UI pieces (TripRouteSection, types, panel mount); commit 2 (`security:`, 78fe499e) holds both route changes, TripEditPanel and all tests, so the acceptance check on `git log -1 -- app/api/admin/bookings/route.ts` (prefix `security:`) holds.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-91-37 (admin guard first, stops attached after it, dispatch `no-store`, tested), T-91-38 (422 `stops_edit_unsupported`, tested), T-91-47 (422 `landing_pickup_mismatch`, offset written in the same update, midnight case tested).

## Notes for dependents

- 91-15 (Move pickup) mounts its button as `children` of `TripRouteSection`; the section renders only for bookings with stops or a landing.
- The audit field `pickup_offset_min` has no label in `BookingChangeHistory` (outside this plan), so it shows by its raw field name.
- Live look in list, board and calendar stays with owner UAT (91-16).

## Self-Check: PASSED

- FOUND: components/admin/TripRouteSection.tsx, tests/trip-route-section.test.tsx
- FOUND commits: 04906646, 78fe499e
- `grep attachStops` in both routes, `TripRouteSection` in BookingDetailPanel (import + use), `landing_time` in bookingTypes, `stops_edit_unsupported` in route and TripEditPanel, `landing_pickup_mismatch` and `pickupFromLanding` in route: all present; last commit touching the route starts with `security:`.
