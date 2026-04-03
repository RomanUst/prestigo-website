---
phase: 22-mobile-admin-promo-code-system
plan: 03
subsystem: payments
tags: [stripe, supabase, zustand, react, promo-codes, booking-wizard]

# Dependency graph
requires:
  - phase: 22-mobile-admin-promo-code-system/22-01
    provides: promo_codes table, claim_promo_code RPC function
provides:
  - Public /api/validate-promo GET endpoint for soft promo validation
  - Atomic promo claim in /api/create-payment-intent via claim_promo_code RPC
  - BookingStore promoCode/promoDiscount state fields (not persisted)
  - PromoInput UI in Step6Payment with apply/remove/error states
  - Promo metadata (promoCode, discountPct) in Stripe PaymentIntent
affects: [booking-wizard, payment-flow, promo-codes, stripe-metadata]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Soft validation (GET validate-promo) separate from atomic claim (POST create-payment-intent)
    - Server re-computes discounted price independently — never trusts client-provided amount
    - Promo state NOT persisted to sessionStorage — fresh per booking session

key-files:
  created:
    - prestigo/app/api/validate-promo/route.ts
    - prestigo/tests/validate-promo.test.ts
  modified:
    - prestigo/types/booking.ts
    - prestigo/lib/booking-store.ts
    - prestigo/app/api/create-payment-intent/route.ts
    - prestigo/tests/create-payment-intent.test.ts
    - prestigo/components/booking/steps/Step6Payment.tsx

key-decisions:
  - "validate-promo is a public GET endpoint (no auth guard) — clients use it in booking wizard before login"
  - "promoCode/promoDiscount NOT added to partialize — promo state is session-ephemeral, not persisted"
  - "Server independently recomputes discounted total from claim_promo_code RPC result; client only sends promoCode string"
  - "Two-phase approach: soft validate on Apply click, atomic claim at PaymentIntent creation time"
  - "promoCode added to useEffect dependency array in Step6Payment — apply/remove triggers new PaymentIntent"

patterns-established:
  - "Promo soft-validation pattern: GET endpoint reads DB without incrementing usage_count"
  - "Atomic promo claim pattern: RPC UPDATE ... RETURNING with race-safe WHERE clause"

requirements-completed: [PROMO-03, PROMO-04]

# Metrics
duration: 7min
completed: 2026-04-03
---

# Phase 22 Plan 03: Promo Code Booking Integration Summary

**Promo code end-to-end: public validate-promo API + atomic claim_promo_code RPC in payment flow + PromoInput UI in Step6Payment with green/red feedback states**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-03T19:09:01Z
- **Completed:** 2026-04-03T19:15:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created public /api/validate-promo GET endpoint — returns discount percentage or specific error messages for expired/exhausted/invalid codes
- Integrated atomic claim_promo_code RPC into create-payment-intent route — server recomputes discounted amount independently, never trusts client
- Added promoCode and discountPct to Stripe PaymentIntent metadata for webhook/email downstream
- Built PromoInput UI section in Step6Payment with copper "Apply Code" button, green checkmark on success, red error text, and Remove link
- 9 tests pass: 4 validate-promo + 5 create-payment-intent promo integration

## Task Commits

1. **Task 1: Zustand store promo fields + validate-promo API + create-payment-intent promo integration + tests** - `3d7478f` (feat)
2. **Task 2: PromoInput UI in Step6Payment** - `364ee87` (feat)

## Files Created/Modified
- `prestigo/types/booking.ts` - Added promoCode, promoDiscount, setPromoCode, setPromoDiscount to BookingStore interface
- `prestigo/lib/booking-store.ts` - Added promo initial values, setters, and reset; excluded from partialize
- `prestigo/app/api/validate-promo/route.ts` - New public GET endpoint: soft validation with max_uses check
- `prestigo/app/api/create-payment-intent/route.ts` - Added supabase import, promo claim block, discounted total computation, promo metadata
- `prestigo/tests/validate-promo.test.ts` - 4 tests: valid code, expired, exhausted, missing param
- `prestigo/tests/create-payment-intent.test.ts` - Added PROMO-04 describe block with 5 tests
- `prestigo/components/booking/steps/Step6Payment.tsx` - PromoInput UI with handlers, discountedTotalEur, dependency array update

## Decisions Made
- validate-promo is a public GET endpoint (no auth guard) — clients use it in the booking wizard without needing to be authenticated
- promoCode/promoDiscount NOT added to `partialize` — promo state is session-ephemeral, not stored in sessionStorage
- Server independently recomputes discounted total from claim_promo_code RPC; client only sends the promoCode string as text
- Two-phase approach: soft validate on Apply click (no usage increment), atomic claim at PaymentIntent creation time
- promoCode added to useEffect dependency array in Step6Payment so apply/remove triggers a fresh PaymentIntent with correct amount

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Stripe mock to include createFetchHttpClient static method**
- **Found during:** Task 1 (Writing create-payment-intent tests)
- **Issue:** Test suite failed with "createFetchHttpClient is not a function" because the Stripe mock lacked the static method used at module init time
- **Fix:** Changed mock from `vi.fn()` constructor to a regular `function MockStripe()` with `MockStripe.createFetchHttpClient = () => ({})` static method
- **Files modified:** prestigo/tests/create-payment-intent.test.ts
- **Verification:** Tests run and fail for the correct reason (RED phase) before implementation
- **Committed in:** 3d7478f (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed DEFAULT_PRICING mock structure to match PricingRates type**
- **Found during:** Task 1 (Test 4 failing with "Cannot read properties of undefined (reading 'business')")
- **Issue:** DEFAULT_PRICING mock used `{ business: { perKm, base } }` structure but getPricingConfig returns `{ ratePerKm, hourlyRate, dailyRate, minFare, globals }` structure
- **Fix:** Rewrote DEFAULT_PRICING to match actual PricingRates shape from pricing-config.ts
- **Files modified:** prestigo/tests/create-payment-intent.test.ts
- **Verification:** Test 4 passes (no promo = full price, no RPC call)
- **Committed in:** 3d7478f (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes required to make tests runnable. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in tests/admin-pricing.test.ts, tests/admin-zones.test.ts, tests/health.test.ts — unrelated to this plan, out of scope
- Pre-existing test failures in tests/submit-quote.test.ts and tests/BookingWidget.test.tsx — unrelated to this plan, out of scope

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Promo code end-to-end flow complete (PROMO-01 through PROMO-04 done)
- Admin can create/manage promo codes (Phase 22-01 + 22-02)
- Clients can apply promo codes at checkout (this plan)
- Ready for Phase 22-04 (if any remaining work in the phase)

## Self-Check: PASSED

- FOUND: prestigo/app/api/validate-promo/route.ts
- FOUND: prestigo/tests/validate-promo.test.ts
- FOUND: .planning/phases/22-mobile-admin-promo-code-system/22-03-SUMMARY.md
- FOUND: commit 3d7478f (Task 1)
- FOUND: commit 364ee87 (Task 2)

---
*Phase: 22-mobile-admin-promo-code-system*
*Completed: 2026-04-03*
