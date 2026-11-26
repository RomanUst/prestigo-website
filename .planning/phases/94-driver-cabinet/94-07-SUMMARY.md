---
phase: 94-driver-cabinet
plan: 07
subsystem: ui
tags: [driver-cabinet, ride-detail, trip-screen-reuse, closed-ride, security]
requires:
  - "94-02: requireDriver, (cabinet) layout, driver-cabinet.css"
  - "94-03: newestAssignmentByBooking, format.ts driverFeeLabel / dropoffText, TERMINAL_BOOKING_STATUSES"
  - "94-06: isValidMonth, the Rides list and the Past view href contract"
provides:
  - "app/(internal)/driver/trip/[token]/TripScreenForToken.tsx: shared async trip loader (token, backHref?, showDriverFee?)"
  - "lib/driver-cabinet/ride-detail.ts: resolveCabinetRide, CabinetRideResolution, RideSummary, RIDE_DETAIL_SELECT"
  - "/driver/rides/[assignmentId] page"
  - "TripScreen props backHref / driverFee; TripDetails prop driverFee; InvalidTripLinkView prop cabinetBackHref; CSS class driver-wordmark-optional"
  - "components/driver/ClosedRideView.tsx and components/driver/DriverBackLink.tsx"
affects: [94-08, 94-09, 94-10, 94-12]
tech-stack:
  added: []
  patterns:
    - "one loader for two entrances: the token page calls TripScreenForToken as a function so it still returns the screen's element tree (existing tests unchanged); the cabinet renders it as a server component with two optional props"
    - "ownership from the session: lookup keyed by (id, driver_id) plus newest-of-booking, every non-live combination is the same not_available view"
    - "optional props spread only when set, so the token page element carries exactly the Phase 87 props"
key-files:
  created:
    - "app/(internal)/driver/trip/[token]/TripScreenForToken.tsx"
    - lib/driver-cabinet/ride-detail.ts
    - "app/(internal)/driver/(cabinet)/rides/[assignmentId]/page.tsx"
    - components/driver/ClosedRideView.tsx
    - components/driver/DriverBackLink.tsx
    - tests/driver-cabinet-ride-detail.test.tsx
  modified:
    - "app/(internal)/driver/trip/[token]/page.tsx"
    - "app/(internal)/driver/trip/[token]/TripScreen.tsx"
    - "app/(internal)/driver/trip/[token]/TripDetails.tsx"
    - "app/(internal)/driver/trip/[token]/InvalidTripLinkView.tsx"
    - "app/(internal)/driver/trip/driver-trip.css"
key-decisions:
  - "The token page calls TripScreenForToken({ token }) as a function instead of rendering <TripScreenForToken />: tests/driver-trip*.test.ts call the page and inspect the returned element, so this keeps them green without editing them (D-15)"
  - "A pending assignment on a completed / no_show booking resolves to the closed view (the driver started via the old link), on a cancelled booking to not_available; this mirrors the Past list rule of 94-06"
  - "The Back control is a shared DriverBackLink (next/link) used by the trip screen and ClosedRideView, so the two headers cannot drift"
  - "Cabinet header is a 1fr / auto / 1fr grid with explicit columns, so the wordmark stays centered and Help stays right when the wordmark is hidden below 400px"
patterns-established:
  - "driver_price_czk is added to the select by string replace inside bookings!inner(...) only when showDriverFee is set; the unchanged TRIP_SELECT still matches neither amount_eur nor price"
requirements-completed: [DCAB-05, DCAB-09]
status: complete
commits: 3
plan_head_before: d078882f4de3bae88c1082656ad90e36cffdc17c
plan_head_after: a6ff8361979b458b384bb93dd743cbea0ca658d3
actuals:
  tokens: 14900
  tasks: 3
  commits: 3
completed: 2026-11-25
---

# Phase 94 Plan 07: Ride detail in the cabinet Summary

A driver taps a ride in the cabinet and gets the Phase 87 trip screen at `/driver/rides/[assignmentId]` with a Back link to the list and their own fee in the expanded sheet; a finished ride shows a short summary, an offer sends them to the Offers tab, and anything that is not their live ride is one identical "This ride is not available." view.

`commits: 3` counts the three task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1 (commit 5ec8a2ff, `security:`)**: the body of the token page moved into `TripScreenForToken.tsx` unchanged (same select, branches and props); `/driver/trip/[token]/page.tsx` keeps its noindex metadata and only awaits params and calls the loader. `resolveCabinetRide` queries `driver_assignments` with `.eq('id', assignmentId).eq('driver_id', driverId)`, then applies newest-of-booking: unknown, foreign, declined, superseded and token-less assignments are `not_available`; accepted on a live booking or pending on a started booking is `trip`; pending on assigned / confirmed is `offer`; terminal bookings are `closed` (completed with the fee label, cancelled and no_show without it; pending + cancelled is `not_available`), with Back to `/driver/rides?view=past&month=YYYY-MM`. The cabinet page calls `requireDriver('/driver/rides/' + id)` first, validates the uuid before any query, renders the loader, redirects offers to `/driver/offers`.
- **Task 2 (commit 926e06d9, `security:`)**: `TripScreen` `backHref` turns the header into Back / centered wordmark (`driver-wordmark-optional`, hidden below 400px in `driver-trip.css`, size rule only) / Help, tab order Back then Help; without it the header is as before. `TripDetails` `driverFee` adds "Your fee" (500 weight, tabular) directly after Booking only for a non-empty label. The loader's `showDriverFee` inserts only `driver_price_czk` into the bookings column list and passes `driverFeeLabel(...)`; the cabinet page passes `backHref="/driver/rides" showDriverFee`.
- **Task 3 (commit a6ff8361, `security:`)**: `ClosedRideView` (Back + wordmark header, 96px ok / info circle with Trip completed / Ride cancelled / Marked as no-show, summary card with Booking, Date, Pickup time, Pickup, Drop-off, Vehicle class and, for completed rides with a fee, Your fee). `InvalidTripLinkView` `cabinetBackHref` gives "This ride is not available." + the office line + "Back to rides"; without the prop it renders as before. The loader passes the Back target to the ended / not-found views, so a list-detail race shows the same view.

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-ride-detail.test.tsx tests/driver-trip.test.ts tests/driver-trip-screen.test.tsx tests/driver-trip-cash.test.ts tests/driver-trip-progress.test.ts tests/status-writers-gate.test.ts tests/admin-no-hardcoded-colors.test.ts tests/driver-cabinet-rides-ui.test.tsx`: 8 files, 360 tests passed. Wider run `tests/driver tests/admin-driver tests/middleware`: 33 files, 1018 tests passed.
- `git diff -- tests/driver-trip.test.ts tests/driver-trip-cash.test.ts tests/driver-trip-progress.test.ts tests/driver-trip-screen.test.tsx` is empty (D-15: no existing trip test edited).
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/`; none in this plan's files.
- `npx eslint --quiet` on all changed source and test files: exit 0.
- Acceptance greps: write-call regex in `ride-detail.ts` and the cabinet page 0; `requireDriver(` in the cabinet page 1; hex / rgb in `driver-trip.css` 0; `ClosedRideView` has no `client_phone|passengerPhone|flight`.
- Test coverage of the threat register: identical `innerHTML` for unknown, foreign, superseded and malformed ids (T-94-33); token-page select has no `price` and cabinet adds only `driver_price_czk` (T-94-34); source gates on the resolver, page and loader (T-94-35); cabinet URL holds the assignment id only (T-94-36); summary JSON never contains name, phone, flight, notes or client fare (T-94-37).

## Deviations from Plan

### Auto-added

**1. [Rule 3 - structure] Shared `components/driver/DriverBackLink.tsx`**
- **Issue:** the plan styles the Back control in both TripScreen (Task 2) and ClosedRideView (Task 3) "like the Help button"; two copies would drift.
- **Fix:** one small shared component using `next/link` (an internal href as a bare `<a>` is an eslint error in this repo), imported by both.
- **Files:** components/driver/DriverBackLink.tsx (not in the plan's files list).
- **Commit:** 926e06d9

**2. [Rule 1 - fit with existing tests] Token page calls the loader as a function**
- **Issue:** `<TripScreenForToken token={token} />` as a returned element would make `tests/driver-trip*.test.ts` (which call the page and read the returned element) see the wrapper instead of the screen.
- **Fix:** `return TripScreenForToken({ token })`; behavior and returned tree are identical to Phase 87.
- **Commit:** 5ec8a2ff

No other deviations.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the read-only `/driver/rides/[assignmentId]` page, covered by T-94-33..37 of the plan.

## Not verified here

- Held-out visual check of the header at 360x640 and 390x844 (Back and Help never overlap, wordmark hidden below 400px) is not run: the layout rules (grid with explicit columns, media query) are in place and unit-tested for DOM order and class, but no browser render was done in this executor session.

## Self-Check: PASSED

- Created files present: TripScreenForToken.tsx, ride-detail.ts, the cabinet page, ClosedRideView.tsx, DriverBackLink.tsx, driver-cabinet-ride-detail.test.tsx.
- Commits present: 5ec8a2ff, 926e06d9, a6ff8361.
