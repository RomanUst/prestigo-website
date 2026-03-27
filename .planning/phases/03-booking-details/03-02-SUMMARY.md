---
phase: 03-booking-details
plan: 02
subsystem: ui
tags: [react, zustand, typescript, nextjs]

# Dependency graph
requires:
  - phase: 03-01
    provides: Step4 test stubs and BookingWizard step routing for step 4

provides:
  - Step4Extras component with three toggleable extras cards (Child Seat, Meet & Greet, Extra Luggage)
  - lib/extras.ts with EXTRAS_PRICES, EXTRAS_CONFIG, computeExtrasTotal
  - BookingStore extended with extras state, passengerDetails, and actions (setExtras, toggleExtra, setPassengerDetails)
  - PriceSummary updated to display base + extras total with per-item breakdown in desktop panel
  - Mobile bar Continue button conditionally shown only at step 3

affects: [03-03-passenger-details, 03-04-booking-wizard-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - outline-based selected state (2px solid var(--copper), outline-offset: -2px) avoids layout shift without padding compensation
    - extras config in lib/extras.ts (client-safe) separate from lib/pricing.ts (server-only)
    - computeExtrasTotal utility for deterministic extras sum

key-files:
  created:
    - prestigo/lib/extras.ts
    - prestigo/components/booking/steps/Step4Extras.tsx
  modified:
    - prestigo/types/booking.ts
    - prestigo/lib/booking-store.ts
    - prestigo/components/booking/PriceSummary.tsx

key-decisions:
  - "Extras config (EXTRAS_PRICES, EXTRAS_CONFIG) lives in lib/extras.ts (client-safe), not lib/pricing.ts (server-only rate tables)"
  - "Selected extra card uses outline: 2px solid var(--copper) with outline-offset: -2px — no border-width change, no padding compensation needed"
  - "PriceSummary price display uses selectedPrice.base + extrasTotal (not selectedPrice.total) so extras are additive client-side on top of server-calculated base"
  - "Mobile bar Continue button guarded by currentStep === 3 to prevent double-bar at steps 4+"

patterns-established:
  - "Extras toggle pattern: aria-pressed button with outline-based selected state, constant padding, no layout shift"
  - "Client-side extras total: computeExtrasTotal(extras) added to selectedPrice.base for live price updates"

requirements-completed: [STEP4-01, STEP4-02, STEP4-03]

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 3 Plan 02: Step 4 Extras Summary

**Three-extra toggle card UI with Zustand-persisted extras state and live PriceSummary base+extras total computation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T06:02:28Z
- **Completed:** 2026-03-27T06:04:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created lib/extras.ts as client-safe config module with EXTRAS_PRICES, EXTRAS_CONFIG, and computeExtrasTotal
- Extended BookingStore with extras state, passengerDetails, and three actions (setExtras, toggleExtra, setPassengerDetails) with sessionStorage persistence
- Built Step4Extras component with three aria-pressed toggle cards using outline-based selected state (no layout shift)
- Updated PriceSummary to show base + extras total with per-item breakdown in desktop panel; mobile bar Continue button now only shows at step 3

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend store types, create extras config, extend booking-store** - `fb3d48c` (feat)
2. **Task 2: Build Step4Extras component and update PriceSummary for extras** - `f1d4b69` (feat)

## Files Created/Modified

- `prestigo/lib/extras.ts` - EXTRAS_PRICES, EXTRAS_CONFIG, computeExtrasTotal (client-safe)
- `prestigo/components/booking/steps/Step4Extras.tsx` - Toggle card grid for three optional extras
- `prestigo/types/booking.ts` - BookingStore extended with extras, passengerDetails fields and actions
- `prestigo/lib/booking-store.ts` - Store implementation with extras/passengerDetails initial state and partialize
- `prestigo/components/booking/PriceSummary.tsx` - Extras total in price display, extras breakdown, currentStep guard on Continue button

## Decisions Made

- Extras config lives in `lib/extras.ts` (client-safe module), separate from `lib/pricing.ts` (server-only rate tables with GOOGLE_MAPS_API_KEY risk)
- Selected card state uses `outline: 2px solid var(--copper)` with `outline-offset: -2px` per UI-SPEC — avoids layout shift without padding compensation (unlike VehicleCard's 23/24px border-width approach)
- Price display uses `selectedPrice.base + extrasTotal` rather than `selectedPrice.total` since extras are applied client-side additively on top of server-calculated base price
- Mobile bar Continue button guarded by `currentStep === 3` to prevent double-bar overlap when user advances to step 4+

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled clean on both tasks, all existing test stubs remain in passing state.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Step4Extras component is complete and ready for integration into BookingWizard step routing (03-03 or 03-04)
- passengerDetails field and setPassengerDetails action are in store, ready for Step5 passenger form (03-03)
- All extras state persists to sessionStorage — survives page refresh during booking flow
