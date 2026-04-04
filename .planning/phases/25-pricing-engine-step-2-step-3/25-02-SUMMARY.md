---
phase: 25-pricing-engine-step-2-step-3
plan: 02
subsystem: api
tags: [pricing, round-trip, night-coefficient, holiday-coefficient, typescript, vitest, tdd]

# Dependency graph
requires:
  - phase: 24-ui-tab
    provides: returnTime stored in Zustand and sessionStorage — now consumed by API
  - phase: 23-database-schema-foundation
    provides: pricing_globals.return_discount_percent DB column used here
provides:
  - Extended POST /api/calculate-price: accepts returnTime, returns returnLegPrices with independent night/holiday coefficients and discount applied, extras=0
  - Response field returnLegPrices replaces roundTripPrices across all paths
affects: [25-03-step3-price-display, any consumer of /api/calculate-price response shape]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Independent-leg pricing: outbound and return legs each call applyGlobals separately with their own datetime flags — no coefficient inheritance between legs"
    - "Symmetric distance reuse: distanceKm from outbound Google Routes call reused for return leg, no second fetch"
    - "Zero-extras return: return leg always has extras=0 regardless of request body extras flags"

key-files:
  created: []
  modified:
    - prestigo/app/api/calculate-price/route.ts
    - prestigo/tests/calculate-price.test.ts

key-decisions:
  - "returnLegPrices replaces roundTripPrices — old field was multiplying outbound total * 2 and inheriting outbound coefficients; new field computes return leg independently (RTPR-01)"
  - "Return leg requires BOTH returnDate AND returnTime to be non-null; if either is missing returnLegPrices is null (supports one-way + future step where user fills in return time)"
  - "Discount applied to adjusted base (after applyGlobals) not raw base — preserves coefficient effect before discount"
  - "All transfer early-return quoteMode paths now include returnLegPrices: null for consistent response shape"

patterns-established:
  - "applyGlobals(returnBase, rates.globals, airportFlag, isNightTime(returnTime), isHolidayDate(returnDate, ...), rates.minFare) — pattern for independent-coefficient leg pricing"

requirements-completed: [RTPR-01, RTPR-02, RTPR-03]

# Metrics
duration: 5min
completed: 2026-04-04
---

# Phase 25 Plan 02: Return-Leg Independent Coefficient Pricing Summary

**`/api/calculate-price` now computes return-leg prices via independent night/holiday coefficients from returnDate+returnTime, applies returnDiscountPercent to adjusted base, and returns returnLegPrices with extras=0, replacing the old roundTripPrices double-and-discount approach**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-04T20:44:10Z
- **Completed:** 2026-04-04T20:49:58Z
- **Tasks:** 1 (TDD: RED + GREEN + REFACTOR)
- **Files modified:** 2

## Accomplishments
- Replaced `roundTripPrices` (outbound * 2 with wrong coefficients) with `returnLegPrices` computed independently via `applyGlobals(returnBase, ..., isNightTime(returnTime), isHolidayDate(returnDate, ...))`
- Return-leg discount applied to adjusted base after coefficient, not to raw base
- Return leg extras locked to 0 across all vehicle classes (RTPR-03)
- Single Google Routes API call per request — symmetric distance reuse (no second fetch with returnTime present)
- Added `returnLegPrices: null` to all transfer early-return paths for consistent response shape
- 7 TDD tests covering: night-coeff independence, holiday-coeff independence, discount formula, extras=0, response shape, null-when-no-return, single-fetch assertion

## Task Commits

1. **Task 1: Extend calculate-price API with return-leg independent coefficients** - `89a1754` (feat)

**Plan metadata:** (docs commit — to be created after state update)

## Files Created/Modified
- `prestigo/app/api/calculate-price/route.ts` - Added returnTime destructure, replaced roundTripPrices block with independent-coefficient returnLegPrices computation, updated all response paths
- `prestigo/tests/calculate-price.test.ts` - Added 7-test TDD suite for return-leg pricing (RTPR-01/02/03) with mocked globals, fetch, supabase, rate-limiter

## Decisions Made
- Return leg requires both `returnDate` AND `returnTime` to be non-null for `returnLegPrices` to be computed — if either is absent, `returnLegPrices` is `null`. This supports the Step 1 case (user has not yet provided return time) without breaking one-way pricing.
- `returnLegPrices` field used instead of `roundTripPrices` — the old field semantics (combined total for both legs after discount) are replaced by the new per-leg return price.
- Discount is applied to `b.base` (the post-applyGlobals adjusted base, which includes coefficient and airportFee) — this ensures the night/holiday premium is applied before the discount, not after.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added returnLegPrices: null to all transfer early-return paths**
- **Found during:** Task 1 (acceptance criteria check — returnLegPrices count was 6, needed >= 7)
- **Issue:** Plan action step listed 4 early-return transfer paths to update (no-origin, out-of-zone, no-apikey, google-error, no-distance) but the implementation initially only updated hourly/daily branches
- **Fix:** Added `returnLegPrices: null` to all 4 transfer early-return `{ prices: null, distanceKm: null, quoteMode: true }` responses
- **Files modified:** `prestigo/app/api/calculate-price/route.ts`
- **Verification:** All acceptance criteria pass; returnLegPrices count = 11
- **Committed in:** `89a1754` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — response shape consistency)
**Impact on plan:** Necessary for consistent response shape across all paths. No scope creep.

## Issues Encountered
- Node v12 (at `/usr/local/bin/node`) caused `ERR_REQUIRE_ESM` when running vitest — resolved by using nvm's Node v22.22.1 at `~/.nvm/versions/node/v22.22.1/bin/node`

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `returnLegPrices` field is ready for Phase 25-03 to display three-line price breakdown in Step3Vehicle
- `returnDiscountPercent` exposed in response for UI to show "10% return discount" label
- Pre-existing failures in `submit-quote.test.ts`, `admin-pricing.test.ts`, `TripTypeTabs.test.tsx`, `BookingWidget.test.tsx`, `BookingWizard.test.tsx` remain — these are out-of-scope for this plan (Phase 25-03 will address BookingWizard/TripTypeTabs)

## Self-Check: PASSED

- FOUND: `prestigo/app/api/calculate-price/route.ts`
- FOUND: `prestigo/tests/calculate-price.test.ts`
- FOUND: `.planning/phases/25-pricing-engine-step-2-step-3/25-02-SUMMARY.md`
- FOUND commit: `89a1754`

---
*Phase: 25-pricing-engine-step-2-step-3*
*Completed: 2026-04-04*
