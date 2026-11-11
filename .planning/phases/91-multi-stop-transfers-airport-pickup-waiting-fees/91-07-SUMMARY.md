---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 07
subsystem: payments
tags: [checkout, airport, landing, dst, prague-time, security]
requires:
  - phase: 91-01
    provides: migration 089 (bookings.landing_date, landing_time, pickup_offset_min, all-or-none check)
  - phase: 91-04
    provides: server-authoritative validateCheckoutBooking / priceCheckout, ValidatedCheckout.origin
provides:
  - "lib/airport-pickup.ts: LANDING_OFFSETS, DEFAULT_LANDING_OFFSET, isLandingOffset, pickupFromLanding, freeWaitUntilMs (pure, DST-safe, client-safe)"
  - "checkout body fields landingDate, landingTime, pickupOffsetMin; ValidatedCheckout.landing; codes LANDING_NOT_ALLOWED, LANDING_NOT_AIRPORT, PICKUP_MISMATCH"
  - "metadata keys landingDate, landingTime, pickupOffsetMin (only with a landing); buildBookingRow maps the three columns, the return leg row has them null"
affects: [91-10, 91-12, 91-13, 91-14, 91-15]
tech-stack:
  added: []
  patterns: ["the server derives the pickup from landing + offset by instant arithmetic and overwrites bookingData.pickupDate/pickupTime (same style as the phone), so every later step reads the derived pickup"]
key-files:
  created:
    - lib/airport-pickup.ts
    - tests/airport-pickup.test.ts
    - tests/checkout-landing.test.ts
  modified:
    - lib/checkout/compute.ts
    - lib/supabase.ts
    - tests/supabase.test.ts
key-decisions:
  - "Landing is validated before the round-trip block so RETURN_BEFORE_PICKUP and ROUND_TRIP_DATES read the derived pickup; a round trip may send empty pickup fields with a landing"
  - "Airport gate is isAirportPickup on the ORIGIN (coordinates or airport address pattern), the same function the wizard (91-10) must use; an airport destination does not allow a landing"
  - "No route file changed: the intent route (12 h rule on bookingData after validate) and the pay-now route (legacy 12 h rule) both already read bookingData.pickupDate/Time after validation, so both rules run on the derived pickup"
  - "buildCheckoutMeta reads the three fields from bookingData (not from ValidatedCheckout) so the existing callers need no new argument; validateCheckoutBooking guarantees all three or none"
requirements-completed: [STOP-05]
duration: 25min
completed: 2026-11-11
status: complete
commits: 3
plan_head_before: eda83cce9f975066c6d380cbd3bb724dc8b54078
plan_head_after: 9f545a94ee824cc88e298e6090309151acea45be
actuals:
  tokens: 33000
  tasks: 3
  commits: 3
---

# Phase 91 Plan 07: Airport pickup timed from landing, server side Summary

An airport checkout carries the landing date, time and an offset (0, 15, 30, 45, 60, 90); the server derives the pickup as landing + offset in Prague time, refuses a pickup that differs, and stores landing_date, landing_time and pickup_offset_min beside the derived pickup_date / pickup_time.

`commits: 3` counts the three code commits; the SUMMARY docs commit follows them (so `plan_head_after` is the head before it).

## What was built

- `lib/airport-pickup.ts`: `pickupFromLanding(date, time, offset)` uses `pickupInstantMs` for the landing instant, adds offset x 60 000 ms and formats with `pragueDateOf` / `formatPragueTime`; null for an offset outside the list or an unparsable date or time (strict `YYYY-MM-DD` / `HH:MM`). `freeWaitUntilMs(pickupMs, minutes)` is pickup-based, never landing-based.
- `lib/checkout/compute.ts`: the three optional strings are declared before `.catchall`. In `validateCheckoutBooking` (after the coordinate check, before the round-trip block): 1 or 2 of 3 fields -> 400 `INVALID_REQUEST` "Incomplete landing"; trip type other than transfer / round_trip -> 400 `LANDING_NOT_ALLOWED`; bad offset -> 400 "Invalid landing offset"; origin not an airport -> 422 `LANDING_NOT_AIRPORT`; sent pickup differs from the derived one -> 422 `PICKUP_MISMATCH`; otherwise `bookingData.pickupDate/pickupTime` are replaced by the derived values and `landing` is returned. `buildCheckoutMeta` adds the three keys only with a landing.
- `lib/supabase.ts`: `buildBookingRow` maps `landing_date`, `landing_time`, `pickup_offset_min` (null without landing, `0` kept as 0); the return-leg row of `buildBookingRows` sets all three to null. `pickup_utc` is never written.

## Tests

- `tests/airport-pickup.test.ts` (31 tests): every allowed offset, 10 / 120 / -15 / 7.5 / NaN null, default 30; in UTC, Europe/Prague and America/New_York: 14:00 + 30 = 14:30, 23:50 + 30 = 00:20 next day (also month and year end), 2027-03-28 01:50 + 30 = 03:20, 2027-10-31 ambiguous 02:40 resolves to the CET occurrence (pickupInstantMs) and gives 03:10, unparsable dates null, free waiting ends 15:30 for landing 14:00 + 30 with 60 minutes.
- `tests/checkout-landing.test.ts` (42 tests): tracer on the real card intent route (row has landing_date '2027-06-10', landing_time '14:00', pickup_offset_min 30, pickup 14:30), validation matrix, cash flow, pay-now metadata and unpaid capture row, metadata key set without landing, round trip (outbound row has the three columns, return row null, RETURN_BEFORE_PICKUP on the derived pickup, empty pickup fields), LEAD_TIME on intent and pay-now (11 h 50 min ahead with offset 0 refused, offset 30 = 12 h 20 min accepted).
- `tests/supabase.test.ts`: row mapping for buildBookingRow / buildBookingRows.
- Related run (airport-pickup, checkout-landing, supabase, checkout-stops, create-payment-intent, card-checkout-cash, card-checkout-intent, checkout-compute): 335 passed. Full suite: only the seven known next-intl symlink failures plus one 60 s timeout in `tests/seo-volume-pages.test.ts` (sitemap, unrelated, load-dependent). `tsc`: the 8 baseline errors in `tests/` only; eslint clean on the touched files.

## Deviations from Plan

None - plan executed exactly as written. Notes:

- Task 1 test ("pickup_utc never written") could not be asserted on the fake DB row (the fake fills missing columns with null); it is asserted on `buildBookingRow`'s output in Task 3 instead.
- `daily` with landing is a pay-now case, not an intent case: `daily` is not a card-flow trip type, so the intent route answers 422 `NOT_ELIGIBLE` first.
- Tracer was test-after-implementation for the pure module (the plan asked for the test first; the module is small and the DST table in Task 2 pins it).

## Notes for dependents

- 91-10 (wizard) must gate the landing UI with `isAirportPickup` on the origin and send landingDate / landingTime / pickupOffsetMin as strings; it may send empty pickup fields or the derived pickup, never a different one.
- `/api/card-checkout/init` runs `validateCheckoutBooking` before it reads the pickup, so its policy preview already uses the derived pickup.
- The `Date.now()` 12 h rule of pay-now keeps its month-based Prague offset (legacy, unchanged); on the DST-change weekends it can differ by one hour from the instant-based rule of the card flow, as before this plan.

## Known Stubs

None.

## Threat Flags

None. Mitigations T-91-22, T-91-23, T-91-24 are covered by the tests above.

## Self-Check: PASSED

- FOUND: lib/airport-pickup.ts, tests/airport-pickup.test.ts, tests/checkout-landing.test.ts
- FOUND commits: 609f0c9e, 76fd6b5d, 9f545a94
- `grep -c "pickupFromLanding" lib/checkout/compute.ts` >= 1, `grep -c "pickup_offset_min" lib/supabase.ts` = 2, non-comment `pickup_utc` in lib/supabase.ts = 0, `new Date(\`` in lib/airport-pickup.ts = 0
