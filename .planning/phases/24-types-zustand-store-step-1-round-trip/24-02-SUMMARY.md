---
phase: 24-types-zustand-store-step-1-round-trip
plan: 02
subsystem: ui
tags: [zustand, react, booking-wizard, vitest, testing-library]

# Dependency graph
requires:
  - phase: 24-01-types-store
    provides: TripType union extended with round_trip, BookingStore with returnDate/returnTime, setTripType clears returnTime on trip type switch

provides:
  - TripTypeTabs renders 4 tabs including ROUND TRIP as 4th option
  - Step1TripType shows swap icon for round_trip selection
  - BookingWizard canProceed Step 2 guard requires returnDate for round_trip
  - 5 passing TripTypeTabs unit tests covering tab count, aria-selected, tablist, click behavior, active state

affects: [phase-25-step2-datetime-round-trip, phase-26-step3-vehicle-price-display]

# Tech tracking
tech-stack:
  added: []
  patterns: ["TDD with vitest + @testing-library/react + @testing-library/user-event for component interaction tests", "Zustand store direct state inspection via useBookingStore.getState() in tests"]

key-files:
  created:
    - prestigo/tests/TripTypeTabs.test.tsx
  modified:
    - prestigo/components/booking/TripTypeTabs.tsx
    - prestigo/components/booking/steps/Step1TripType.tsx
    - prestigo/components/booking/BookingWizard.tsx

key-decisions:
  - "returnTime NOT added to canProceed guard — return time UI does not exist until Phase 25; adding it now would block round_trip users from advancing past Step 2"

patterns-established:
  - "canProceed guards use (tripType !== 'X' || fieldY !== null) pattern — one condition per trip type requiring a specific field"

requirements-completed: [RTFR-01]

# Metrics
duration: 12min
completed: 2026-04-04
---

# Phase 24 Plan 02: Round Trip UI Tab and Step 2 Guard Summary

**ROUND TRIP added as 4th booking wizard tab with swap icon visibility and Step 2 returnDate guard; 5 TripTypeTabs tests pass**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-04T21:20:00Z
- **Completed:** 2026-04-04T21:32:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `{ value: 'round_trip', label: 'ROUND TRIP' }` as 4th entry in TripTypeTabs TRIP_TYPES array — renders via existing `.map()` with all styles/hover/aria automatically applied
- Extended `showSwapIcon` in Step1TripType to include `tripType === 'round_trip'`, making the swap button visible for round trips
- Updated `canProceed` case 2 in BookingWizard with `(tripType !== 'round_trip' || returnDate !== null)` guard — round_trip users blocked from Step 3 until return date selected; returnTime guard deferred to Phase 25
- Replaced `it.todo` stubs in TripTypeTabs.test.tsx with 5 real passing tests covering all tab rendering, aria attributes, store interaction

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ROUND TRIP tab, swap icon guard, and canProceed guard** - `c00f037` (feat)
2. **Task 2: Write TripTypeTabs unit tests** - `78327ab` (test)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `prestigo/components/booking/TripTypeTabs.tsx` - Added `round_trip` entry to TRIP_TYPES array (4 tabs total)
- `prestigo/components/booking/steps/Step1TripType.tsx` - showSwapIcon now includes `round_trip`
- `prestigo/components/booking/BookingWizard.tsx` - canProceed case 2 requires returnDate for round_trip
- `prestigo/tests/TripTypeTabs.test.tsx` - 5 unit tests for TripTypeTabs component

## Decisions Made

- `returnTime` deliberately excluded from `canProceed` case 2 guard — the return time UI (Step 2 time picker for round_trip) is implemented in Phase 25. Adding it now would permanently block all round_trip users from progressing past Step 2 with no way to enter the value.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript compilation revealed pre-existing errors in `tests/admin-pricing.test.ts`, `tests/admin-zones.test.ts`, and `tests/health.test.ts` — these are out-of-scope pre-existing issues, not regressions from this plan. No errors in the 3 component files modified.
- `submit-quote.test.ts` and `BookingWidget.test.tsx` have pre-existing failures (documented in STATE.md since Phase 5); all 14 other test files pass including the new TripTypeTabs tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Round Trip tab renders and wires to Zustand store; clicking it stores `tripType: 'round_trip'`
- Step 2 returnDate guard is in place; users cannot proceed to Step 3 without selecting a return date
- Phase 25 needs to add the return time picker in Step 2 for round_trip bookings
- All 5 TripTypeTabs tests passing; full vitest suite shows no new regressions

---
*Phase: 24-types-zustand-store-step-1-round-trip*
*Completed: 2026-04-04*
