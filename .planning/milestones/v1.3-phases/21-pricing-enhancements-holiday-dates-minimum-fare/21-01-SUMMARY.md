---
phase: 21-pricing-enhancements-holiday-dates-minimum-fare
plan: 01
subsystem: api
tags: [pricing, supabase, typescript, vitest, zod]

# Dependency graph
requires:
  - phase: 20-booking-management-payment
    provides: pricing-config lib, admin pricing route, calculate-price route
provides:
  - isHolidayDate helper (Set-based O(1) lookup, exported from calculate-price route)
  - applyGlobals updated with holiday coefficient + minimum fare floor
  - getPricingConfig returning holidayDates and minFare from DB
  - Admin PUT schema accepting holiday_dates (ISO date array) and min_fare per class
  - SQL migration adding min_fare column to pricing_config
affects:
  - 21-02 (UI wiring plan — needs these backend fields)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isHolidayDate uses Set for O(1) lookup over potentially long holiday arrays"
    - "Night coefficient takes precedence over holiday coefficient — explicit business rule in ternary chain"
    - "minFare applied via Math.max after all other adjustments — floor is the last operation"
    - "NUMERIC columns from Supabase returned as strings — always cast with Number()"
    - "JSONB columns from Supabase auto-parsed — no JSON.parse needed for holiday_dates"

key-files:
  created:
    - supabase/migrations/021_pricing_enhancements.sql
  modified:
    - prestigo/lib/pricing-config.ts
    - prestigo/app/api/calculate-price/route.ts
    - prestigo/app/api/admin/pricing/route.ts
    - prestigo/tests/pricing.test.ts
    - prestigo/tests/admin-pricing.test.ts

key-decisions:
  - "Night coefficient takes precedence over holiday when both flags are true — isNight ? night : isHoliday ? holiday : 1.0"
  - "isHolidayDate and applyGlobals exported from route.ts for direct unit testing without HTTP layer"
  - "revalidateTag('pricing-config', 'max') added to admin PUT — was missing (pre-existing bug, Rule 1 fix)"
  - "min_fare NUMERIC cast to Number() in getPricingConfig — Supabase returns all NUMERIC as strings"

patterns-established:
  - "Pattern: applyGlobals call always receives isHoliday (computed once before trip-type branch) and rates.minFare"
  - "Pattern: Admin Zod schema extends cleanly — add field to schema, upsert auto-includes it"

requirements-completed: [PRICING-07, PRICING-08]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 21 Plan 01: Pricing Enhancements Backend Summary

**Holiday date detection via Set lookup + minimum fare floor enforcement wired into calculate-price route, admin PUT extended with holiday_dates and min_fare, SQL migration adding min_fare column**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03T17:38:09Z
- **Completed:** 2026-04-03T17:43:15Z
- **Tasks:** 2
- **Files modified:** 5 (+ 1 created)

## Accomplishments
- `isHolidayDate(pickupDate, holidayDates)` exported and unit-tested with 4 cases — Set-based lookup, null-safe
- `applyGlobals` signature extended with `isHoliday` and `minFare` params; night coefficient takes precedence over holiday; `Math.max` floor applied per vehicle class
- Admin PUT Zod schema accepts `holiday_dates` (validated ISO YYYY-MM-DD array) and `min_fare` (non-negative number)
- `getPricingConfig()` returns `holidayDates` and `minFare` alongside existing fields; all 3 call sites in POST handler updated

## Task Commits

1. **Task 1: Migration + types + isHolidayDate + applyGlobals update + pricing tests** - `77dfbb0` (feat, TDD)
2. **Task 2: Admin API schema extension + admin-pricing tests update** - `03b2fd7` (feat)

## Files Created/Modified
- `supabase/migrations/021_pricing_enhancements.sql` — ALTER TABLE pricing_config ADD COLUMN min_fare NUMERIC(10,2) NOT NULL DEFAULT 0
- `prestigo/lib/pricing-config.ts` — Added holidayDates: string[] to PricingGlobals, minFare: Record<string,number> to PricingRates, updated SELECTs
- `prestigo/app/api/calculate-price/route.ts` — isHolidayDate export, applyGlobals updated, 3 call sites updated
- `prestigo/app/api/admin/pricing/route.ts` — min_fare in pricingConfigSchema, holiday_dates in pricingPutSchema, revalidateTag added
- `prestigo/tests/pricing.test.ts` — 10 new tests for PRICING-07 (isHolidayDate, holiday coefficient) and PRICING-08 (min fare floor)
- `prestigo/tests/admin-pricing.test.ts` — validPutBody updated with new fields, PRICING-07+08 extended PUT describe block (3 tests)

## Decisions Made
- Night coefficient takes precedence over holiday when both flags are true — `isNight ? nightCoefficient : isHoliday ? holidayCoefficient : 1.0`
- `isHolidayDate` and `applyGlobals` exported from route.ts to allow direct unit testing without HTTP layer
- `minFare` applied as the final operation after coefficient and airport fee — ensures floor is always respected
- `Number(r.min_fare)` cast because Supabase returns NUMERIC columns as strings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing revalidateTag call to admin pricing PUT**
- **Found during:** Task 2 (Admin API schema extension)
- **Issue:** Existing test `calls revalidateTag("pricing-config") after successful upsert` was failing — the admin PUT handler never called `revalidateTag` despite the test expecting it
- **Fix:** Added `import { revalidateTag } from 'next/cache'` and `revalidateTag('pricing-config', 'max')` after successful upsert in PUT handler
- **Files modified:** prestigo/app/api/admin/pricing/route.ts
- **Verification:** All 10 admin-pricing tests pass including the revalidateTag test
- **Committed in:** 03b2fd7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Cache invalidation was required for correctness — without it, pricing changes in admin would not propagate to calculate-price route. No scope creep.

## Issues Encountered
- Pre-existing test failures in `submit-quote.test.ts` (6 tests) and `BookingWidget.test.tsx` (1 test) unrelated to pricing changes. Logged to `deferred-items.md`.

## User Setup Required
Apply SQL migration manually:

1. Open Supabase Dashboard > SQL Editor
2. Paste contents of `supabase/migrations/021_pricing_enhancements.sql`
3. Run: `ALTER TABLE pricing_config ADD COLUMN IF NOT EXISTS min_fare NUMERIC(10,2) NOT NULL DEFAULT 0`

## Next Phase Readiness
- Backend pricing logic complete — holiday detection and minimum fare enforced server-side
- Admin PUT schema ready to accept both new fields
- Plan 02 can wire the admin UI to send `holiday_dates` and `min_fare` in the PUT body

---
*Phase: 21-pricing-enhancements-holiday-dates-minimum-fare*
*Completed: 2026-04-03*
