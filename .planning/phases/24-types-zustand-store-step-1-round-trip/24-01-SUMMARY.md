---
phase: 24-types-zustand-store-step-1-round-trip
plan: 01
subsystem: ui
tags: [typescript, zustand, booking-store, round-trip, vitest]

# Dependency graph
requires:
  - phase: 23-database-schema-foundation
    provides: round_trip schema support in bookings table
provides:
  - TripType union with 'round_trip' as 4th literal
  - BookingStore interface with returnTime field and setReturnTime action
  - Zustand store implementation with returnTime (init, set, clear, reset, persist)
  - 7 passing unit tests proving all round_trip store behavioral contracts
affects:
  - phase-25-pricing (combined outbound+return price display)
  - phase-26-payment (round-trip booking creation RPC)
  - Step1TripType UI (needs 'round_trip' option)
  - Step2DateTime UI (needs returnTime picker for round_trip)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional field clear in setTripType: spread pattern `...(clearReturn ? { returnTime: null } : {})`
    - returnTime persisted via partialize alongside returnDate
    - TDD test structure: describe('round_trip store behavior') with beforeEach setState reset

key-files:
  created:
    - prestigo/tests/booking-store.test.ts (extended with round_trip describe block)
  modified:
    - prestigo/types/booking.ts
    - prestigo/lib/booking-store.ts

key-decisions:
  - "returnTime cleared when switching away from round_trip (not when switching to it) — conditional spread in setTripType"
  - "returnDate is shared with daily hire so setTripType never clears it"
  - "returnTime persisted to sessionStorage via partialize alongside returnDate"

patterns-established:
  - "Conditional spread for selective field clearing in setTripType: ...(clearReturn ? { field: null } : {})"

requirements-completed: [RTFR-01]

# Metrics
duration: 15min
completed: 2026-04-04
---

# Phase 24 Plan 01: Types, Zustand Store & Step 1 Round Trip Summary

**Extended TripType union to include 'round_trip', added returnTime to BookingStore and Zustand store with conditional clearing in setTripType, persisted via partialize, and 7 unit tests proving all behavioral contracts.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-04T21:00:00Z
- **Completed:** 2026-04-04T21:15:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- TripType union extended: `'transfer' | 'hourly' | 'daily' | 'round_trip'`
- BookingStore interface updated: `returnTime: string | null` field, `setReturnTime` action, returnDate comment updated
- Zustand store: returnTime initialized as null, cleared conditionally in setTripType (not for round_trip), added setReturnTime action, included in resetBooking and partialize
- 7 unit tests pass covering all store behavioral contracts: trip type setting, returnTime clearing, returnDate preservation, setReturnTime, resetBooking, daily clearing, priceBreakdown clearing

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Extend TripType union, BookingStore interface, and store implementation** - `37b5f25` (feat)
2. **Task 3: Unit tests for round_trip store behavior** - `b0780a1` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `prestigo/types/booking.ts` - Added 'round_trip' to TripType, returnTime field and setReturnTime action to BookingStore
- `prestigo/lib/booking-store.ts` - Added returnTime init, setReturnTime, conditional clear in setTripType, resetBooking inclusion, partialize inclusion
- `prestigo/tests/booking-store.test.ts` - Added 7 unit tests in new describe('round_trip store behavior') block

## Decisions Made
- Tasks 1 and 2 committed together because types and store changes are coupled — TypeScript would fail with only the types changed and store not yet updated
- `setTripType` uses conditional spread `...(clearReturn ? { returnTime: null } : {})` to only clear returnTime when NOT switching to round_trip
- returnDate is NOT cleared in setTripType because it is shared between daily hire and round_trip
- returnTime IS persisted via partialize (alongside returnDate) so round-trip state survives page refresh within session

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in tests/admin-pricing.test.ts, tests/admin-zones.test.ts, tests/health.test.ts and test failures in tests/submit-quote.test.ts — all confirmed pre-existing, out of scope per STATE.md note

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data layer foundation complete for Phase 24 UI work (Step 1 trip type selector with round_trip option)
- returnTime and setReturnTime available for Step 2 return time picker in round_trip mode
- Store contracts proven via unit tests — Phase 25 pricing and Phase 26 payment can rely on returnTime semantics

---
*Phase: 24-types-zustand-store-step-1-round-trip*
*Completed: 2026-04-04*
