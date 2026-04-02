---
phase: 17
plan: 02
status: complete
completed: 2026-04-02
requirements: [PRICING-03, PRICING-04]
subsystem: booking-wizard, pricing-api
tags: [pricing, airport-fee, night-coefficient, extras, booking]
dependency_graph:
  requires: [17-01]
  provides: [PRICING-03, PRICING-04]
  affects: [calculate-price-api, create-payment-intent-api, booking-wizard]
tech_stack:
  added: []
  patterns: [optional-parameter-backward-compat, globals-injection]
key_files:
  created: []
  modified:
    - prestigo/components/booking/steps/Step3Vehicle.tsx
    - prestigo/components/booking/steps/Step6Payment.tsx
    - prestigo/lib/extras.ts
    - prestigo/app/api/calculate-price/route.ts
    - prestigo/app/api/create-payment-intent/route.ts
    - prestigo/app/api/admin/zones/route.ts
decisions:
  - Holiday coefficient deferred — no detection mechanism exists (documented in code comment)
  - z.record() arity fix in admin/zones route — pre-existing build blocker auto-fixed
metrics:
  duration: ~20min
  tasks: 3
  files_modified: 6
---

# Phase 17 Plan 02: Wire Globals into Booking Wizard Summary

## One-liner

Airport fee + night coefficient from DB applied in calculate-price and create-payment-intent routes; extras prices sourced from pricing_globals table.

## What was done

- **Step3Vehicle.tsx**: sends `isAirport` (boolean, derived from PRG_CONFIG.placeId match) and `pickupTime` (string) to calculate-price API
- **Step6Payment.tsx**: sends `isAirport` (stringified boolean) in bookingData to create-payment-intent
- **lib/extras.ts**: `computeExtrasTotal` updated to accept optional `prices` parameter — backward-compatible, falls back to `EXTRAS_PRICES` constants when not provided
- **calculate-price route**: added `isNightTime()` and `applyGlobals()` helpers; all three `buildPriceMap()` calls (hourly, daily, transfer) now wrapped with `applyGlobals()` to apply airport_fee and night_coefficient from DB
- **create-payment-intent route**: uses `rates.globals.extraChildSeat/extraMeetGreet/extraLuggage` as DB extras prices; applies same airport_fee/night_coefficient logic to `adjustedBase` before computing `totalEur`

## Requirements satisfied

- PRICING-03: Airport fee from DB applied in booking wizard
- PRICING-04: Night coefficient from DB applied in booking wizard
- Holiday coefficient deferred (no detection mechanism, documented in code comment in applyGlobals)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed z.record() arity in admin/zones route**
- **Found during:** Final build verification
- **Issue:** `z.record(z.unknown())` requires 2-3 arguments in current Zod version — blocked production build
- **Fix:** Changed to `z.record(z.string(), z.unknown())`
- **Files modified:** `prestigo/app/api/admin/zones/route.ts`
- **Commit:** 64244aa (included in same commit)

## Verification

- tsc --noEmit --skipLibCheck — zero new errors (pre-existing test mock errors remain, out of scope)
- npm run build — successful, all routes compiled
- vitest pricing.test.ts — 14/14 passed
- vitest admin-pricing.test.ts — 1 failure (pre-existing: revalidateTag called with 'max' extra arg from 17-01, not introduced by this plan)

## Self-Check: PASSED

- All 6 modified files staged and committed: 64244aa
- Build output confirms /api/calculate-price and /api/create-payment-intent compiled as dynamic routes
- pricing.test.ts: 14 passed
