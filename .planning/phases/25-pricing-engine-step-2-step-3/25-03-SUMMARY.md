---
phase: 25-pricing-engine-step-2-step-3
plan: 03
subsystem: ui
tags: [react, zustand, vitest, round-trip, pricing, booking-wizard]

# Dependency graph
requires:
  - phase: 25-01
    provides: returnTime collected in Step 2 + canProceed round_trip guard
  - phase: 25-02
    provides: API returns returnLegPrices with independent return-leg coefficients
provides:
  - Three-line VehicleCard layout (Outbound / Return with discount / Combined) for round_trip mode
  - PriceSummary desktop three-line breakdown + mobile combined total for round_trip
  - TripTypeTabs Round Trip tab disabled (inert click, aria-disabled, opacity 0.4) when quoteMode=true
  - Step3Vehicle sends returnTime to API; consumes returnLegPrices; return date picker removed
affects: [phase-26, phase-27, phase-28, step3, pricing-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - isRoundTripMode boolean prop gates three-line vs two-button layout in VehicleCard
    - combinedTotal computed client-side as outboundWithExtras + selectedReturnLegPrice.total
    - priceDisplay()/czkDisplay() helpers in PriceSummary branch on isRoundTripMode to return combined total
    - quoteMode read from store in TripTypeTabs (no prop drilling)

key-files:
  created:
    - prestigo/tests/PriceSummary.test.tsx (PSRT describe block with 4 real tests, replacing todos)
  modified:
    - prestigo/components/booking/steps/Step3Vehicle.tsx
    - prestigo/components/booking/VehicleCard.tsx
    - prestigo/components/booking/TripTypeTabs.tsx
    - prestigo/components/booking/PriceSummary.tsx
    - prestigo/tests/Step3Vehicle.test.tsx
    - prestigo/tests/TripTypeTabs.test.tsx

key-decisions:
  - "PriceSummary uses priceDisplay()/czkDisplay() branching so mobile bar gets combined total without structural changes"
  - "VehicleCard combinedTotal = price.total + roundTripPrice.total computed at render time, not stored"
  - "PriceSummary desktop three-line uses Return leg label (matching test expectations) not Return"
  - "TripTypeTabs quoteMode message text: existing deployed text kept unchanged to avoid breaking existing tests"

patterns-established:
  - "isRoundTripMode: boolean prop added to VehicleCard — derived from tripType === round_trip at call site"
  - "Three-line breakdown pattern (Outbound/Return leg/Combined) reused across VehicleCard and PriceSummary"

requirements-completed: [RTFR-03, RTFR-04]

# Metrics
duration: 30min
completed: 2026-04-04
---

# Phase 25 Plan 03: Step3 UI — Three-Line Pricing Display + quoteMode Guard Summary

**Round-trip UI completed: VehicleCard and PriceSummary show Outbound/Return(−N%)/Combined breakdown; TripTypeTabs disables Round Trip tab when quoteMode=true; Step3Vehicle sends returnTime and reads returnLegPrices**

## Performance

- **Duration:** 30 min
- **Started:** 2026-04-04T23:03:00Z
- **Completed:** 2026-04-04T23:13:00Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments

- VehicleCard renders three-line combined breakdown (Outbound €X / Return €Y −N% / Combined €Z + CZK) when `isRoundTripMode=true`; two-button One Way/Round Trip layout preserved for transfer tripType
- PriceSummary desktop panel shows three-line round-trip breakdown when `combinedTotal !== null`; mobile bar priceDisplay() returns `€{combinedTotal}` via shared helper
- TripTypeTabs: Round Trip tab has `aria-disabled="true"`, `cursor:not-allowed`, `opacity:0.4`, inert onClick when `quoteMode=true`; inline copper-color message shown when `quoteMode && tripType === round_trip`
- Step3Vehicle sends `returnTime: s.returnTime` in POST body, reads `data.returnLegPrices` (replacing old `roundTripPrices`), passes `isRoundTripMode={tripType === 'round_trip'}` to VehicleCard; return date picker fully removed (123 lines, down from 187)
- 20 tests pass across Step3Vehicle, TripTypeTabs, PriceSummary test files; RTFR-03 and RTFR-04 satisfied

## Task Commits

Each task was committed atomically:

1. **Task 1: Update Step3Vehicle** - `70c6ef0` (feat) — sends returnTime, reads returnLegPrices, removes picker, adds isRoundTripMode prop
2. **Task 2: VehicleCard three-line breakdown** - `0966022` (feat/tdd) — isRoundTripMode prop + three-line layout + 6 tests
3. **Task 3: TripTypeTabs quoteMode guard** - `43a0df3` (feat/tdd) — disabled Round Trip tab + message + 5 tests
4. **Task 4: PriceSummary round-trip breakdown** - `e8910bf` (feat/tdd) — combined total logic + three-line desktop + mobile bar + 4 tests

## Files Created/Modified

- `prestigo/components/booking/steps/Step3Vehicle.tsx` - Sends returnTime, reads returnLegPrices, passes isRoundTripMode; return date picker removed (187 → 123 lines)
- `prestigo/components/booking/VehicleCard.tsx` - isRoundTripMode prop + three-line combined breakdown branch
- `prestigo/components/booking/TripTypeTabs.tsx` - quoteMode selector + disabled Round Trip tab + inline message paragraph
- `prestigo/components/booking/PriceSummary.tsx` - roundTripPriceBreakdown/returnDiscountPercent selectors; combinedTotal computed; desktop three-line breakdown; priceDisplay()/czkDisplay() round-trip branches
- `prestigo/tests/Step3Vehicle.test.tsx` - 6 STEP3-RT tests for VehicleCard three-line behavior
- `prestigo/tests/TripTypeTabs.test.tsx` - 5 TTABS-RT tests for quoteMode guard
- `prestigo/tests/PriceSummary.test.tsx` - 4 PSRT tests for combined breakdown (fixtures fixed: currency field added)

## Decisions Made

- PriceSummary uses shared `priceDisplay()` and `czkDisplay()` helpers that branch on `isRoundTripMode` — mobile bar gets combined total without structural changes to mobileBar JSX
- `combinedTotal = outboundWithExtras + selectedReturnLegPrice.total` computed at render time in PriceSummary; not stored in Zustand
- Desktop three-line uses "Return leg" label (not "Return") to match test expectations written during plan creation
- TripTypeTabs inline message text kept as-is from existing implementation (tests already pass against it)
- Test fixtures in PriceSummary.test.tsx fixed: `night`/`holiday` phantom fields removed, `currency: 'EUR'` added to satisfy `PriceBreakdown` type

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PriceSummary test fixture type mismatch**
- **Found during:** Task 4 (PriceSummary implementation)
- **Issue:** Test fixtures had `night: 0, holiday: 0` (not in PriceBreakdown interface) and were missing required `currency: string` field, causing TypeScript errors
- **Fix:** Removed phantom fields, added `currency: 'EUR'` to all fixture objects
- **Files modified:** `prestigo/tests/PriceSummary.test.tsx`
- **Verification:** `tsc --noEmit` shows 0 PriceSummary errors; all 4 tests pass
- **Committed in:** `e8910bf` (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug in test fixtures)
**Impact on plan:** Minimal — test fixtures aligned with type system. No behavior change.

## Issues Encountered

- Tasks 1-3 were already implemented and committed from earlier work; only Task 4 (PriceSummary) required new implementation in this session
- Admin-pricing test failures pre-exist from unrelated uncommitted changes in the submodule (out of scope per deviation rules)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RTFR-03 and RTFR-04 are fully satisfied: quoteMode disables Round Trip tab; three-line price breakdown appears in both VehicleCard and PriceSummary
- Phase 26+ can proceed with round-trip booking submission: Step3Vehicle sends returnTime, API returns returnLegPrices, UI displays combined totals
- Combined total = outbound(base+extras) + return — ready for payment intent creation in Phase 26

---
*Phase: 25-pricing-engine-step-2-step-3*
*Completed: 2026-04-04*
