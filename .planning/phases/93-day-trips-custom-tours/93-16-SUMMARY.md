---
phase: 93-day-trips-custom-tours
plan: 16
subsystem: payments
tags: [checkout, tours, stripe, zod, server-pricing]
requires:
  - phase: 93-05
    provides: getPublishedTourBySlug, tourFare, checkTourPickup, TOUR_SLUG_PATTERN, MAX_EXTRA_HOURS
provides:
  - tour branch in checkoutBookingSchema / validateCheckoutBooking / priceCheckout
  - 'tour' in CARD_FLOW_TRIP_TYPES
  - PricedCheckout.tour and ValidatedCheckout.tour blocks
affects: [93-17, card-checkout init/intent, tour booking UI]
tech-stack:
  added: []
  patterns: [tour pricing branch returns before transfer pricing code; sync refusals before any DB read]
key-files:
  created: [tests/checkout-compute-tour.test.ts]
  modified: [lib/checkout/compute.ts, lib/payments/config.ts]
key-decisions:
  - "Tour refusals that need no data (slug, extra hours, stops, landing, return, promo, coordinates, airport) run synchronously in validateCheckoutBooking so a crafted body never costs a DB read"
  - "priceTour is a separate helper called at the top of priceCheckout; it never calls getPricingConfig, computeRouteDistance or the promo table"
status: complete
commits: 1
plan_head_before: 36e0c261d15b2525161a34ef45ccdc45a3f4fc13
plan_head_after: 882c7bc3
actuals:
  tokens: 9500
  tasks: 2
  commits: 1
completed: 2026-11-18
---

# Phase 93 Plan 16: Tour checkout core Summary

The shared card checkout now validates and prices tours on the server: `tourFare(published tour, tour_settings, class, extraHours)` in minor units, with no client amount, no transfer pricing config, no routing call and no promo.

## What was built

- `lib/checkout/compute.ts`: `CheckoutTripType`, schema fields `tourSlug` (TOUR_SLUG_PATTERN) and `extraHours` (1-2 digits), `ValidatedCheckout.tour`, `PricedCheckout.tour` (null for every other trip), the sync tour validation block and the async `priceTour` branch.
- Codes: 400 INVALID_REQUEST, 400 INVALID_EXTRA_HOURS, 400 STOPS_NOT_ALLOWED, 400 LANDING_NOT_ALLOWED, 400 PROMO_NOT_ALLOWED, 400 TOO_MANY_PASSENGERS (existing), 422 AIRPORT_PICKUP, 422 PICKUP_OUT_OF_AREA, 422 TOUR_UNAVAILABLE (unknown/draft tour, no class price, no extra-hour price).
- `lib/payments/config.ts`: `'tour'` added to `CARD_FLOW_TRIP_TYPES`.
- `tests/checkout-compute-tour.test.ts`: 27 tests (tracer pricing, forged `amountEur`/`combinedTotal` ignored, spies prove no pricing config / routing / promo DB call, every refusal, radius read from settings, non-tour unchanged).

## Verification

- vitest: tour test + checkout-compute, checkout-stops, checkout-landing, card-checkout-init, card-checkout-intent: 6 files, 232 tests passed.
- tsc: 8 errors, all the old `tests/` baseline; none in lib/ or app/. eslint clean on the three files.

## Deviations from Plan

**Commits:** Both plan tasks landed in one commit (`882c7bc3`), because the sync refusal order and the test file are one unit and the Task 2 cases ran green against the Task 1 implementation without any branch reordering. Plan listed two commits.

Otherwise none; the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None. Mitigations T-93-41..44 are implemented and covered by tests.

## Notes for 93-17 and the orchestrator

- `buildCheckoutMeta` is unchanged: it does not yet put tour fields (slug, extraHours) into the booking meta. 93-17 (booking row + policy snapshot) should read `priced.tour` / `bookingData.tourSlug` for that.
- `/api/card-checkout/init` and `/intent` accept a tour body through the shared core with no route change; `lib/payments/checkout.ts` still types its own use of tripType as before (tsc clean).
- Worktree note: `node_modules` symlinked (ignored, not committed); all tests ran fine here, nothing needed a re-run for next-intl mocks.

## Self-Check: PASSED

- FOUND: lib/checkout/compute.ts, lib/payments/config.ts, tests/checkout-compute-tour.test.ts
- FOUND commit 882c7bc3
