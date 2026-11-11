---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 06
subsystem: payments
tags: [checkout, stops, persistence, security, stripe, fail-closed]
requires:
  - phase: 91-01
    provides: booking_stops table (migration 089, live) and its fake-DB emulation
  - phase: 91-04
    provides: PricedCheckout.stops from priceCheckout
provides:
  - "lib/booking-stops.ts: BookingStop, saveBookingStops (replace-all), loadStopsByBookingIds, attachStops, loadStopsSafe"
  - "stops stored on the captured unpaid booking in the card, cash and pay-now flows"
  - "POST /api/create-payment-intent error code STOPS_NOT_SAVED (503) and 400 INVALID_REQUEST for stops without attemptId"
affects: [91-12, 91-13, 91-14]
tech-stack:
  added: []
  patterns: ["service client created inside each function", "delete-then-insert replace-all keyed by booking id", "fail closed: cancel the PaymentIntent then 503"]
key-files:
  created:
    - lib/booking-stops.ts
    - tests/booking-stops.test.ts
    - tests/checkout-stops-persist.test.ts
  modified:
    - lib/payments/checkout.ts
    - app/api/create-payment-intent/route.ts
key-decisions:
  - "A stop without a typed address is stored with address NULL (the 089 CHECK forbids an empty string)"
  - "Card and cash let a save error propagate (route 500, client retries the same attempt); pay-now with stops cancels the PaymentIntent and answers 503 STOPS_NOT_SAVED"
  - "Task 3 committed with the bare prefix `security:` (not `security(91-06):`) so the plan acceptance check on the commit subject holds"
requirements-completed: [STOP-04]
status: complete
commits: 3
plan_head_before: eda83cce9f975066c6d380cbd3bb724dc8b54078
plan_head_after: dc71e1799a27a1d2c0de2f8a3d3f048cbd04647e
actuals:
  tokens: 30000
  tasks: 3
  commits: 3
---

# Phase 91 Plan 06: Stops saved with every booking Summary

Every checkout flow now writes the priced stops (position, address, coordinates, wait, free minutes, blocks, fee per block, fee) to `booking_stops` right after the unpaid booking is captured, retries replace them, and one loader module serves every later display. Pay-now fails closed: no payment can be taken for a trip whose stops were not stored.

`commits: 3` counts the three code commits; the SUMMARY commit follows them (so `plan_head_after` is the head before it).

## What was built

- `lib/booking-stops.ts` (server only, service client created inside each function)
  - `saveBookingStops(bookingId, stops)`: delete by booking id, insert when non-empty, throws `Error('booking stops save failed')` (no address in the message).
  - `loadStopsByBookingIds(ids)`: Map ordered by position, `Number()` casts, no query for an empty list, chunks of 200 ids, throws on a read error.
  - `attachStops(rows)`: adds `stops` (or `[]`); `loadStopsSafe(bookingId)`: `[]` on any error, logs the booking id only.
- `lib/payments/checkout.ts`: `createCardCheckoutIntent` (card and cash) calls `saveBookingStops(affected[0].id, priced.stops)` right after `captureUnpaidBooking` returned a non-empty array, always (an empty list clears an earlier attempt's stops). When the row left unpaid (`affected` empty) nothing is touched.
- `app/api/create-payment-intent/route.ts`: stops without `attemptId` answer 400 INVALID_REQUEST before any PaymentIntent; in the one-way capture branch the stops are saved from the capture result; a capture or save error for a request with stops cancels the new PaymentIntent (best effort, code only logged) and answers 503 `STOPS_NOT_SAVED`. No-stops and round-trip paths are unchanged.

## Tests

- `tests/booking-stops.test.ts` (16): replace-all, empty list, NULL address, DB refusal message, ordering, string-numeric casts, no query for `[]`, 200-id chunks, read error, `attachStops`, `loadStopsSafe` (log has the booking id and no address).
- `tests/checkout-stops-persist.test.ts` (17): card tracer (position 1, wait 45, free 15, blocks 2, 12 EUR per block, 24 EUR), driving order, retry replaces, empty retry clears, confirmed booking keeps its stops (lookup path and lost-race path), save error gives 500 with no secret and no address in logs, cash flow, and for pay-now: stored stop, 400 without attemptId, save failure and capture failure both cancel and answer 503, a failing cancel still answers 503, no-stops capture failure keeps the legacy 200, confirmed row with stops untouched, retry replaces.

Verification: the six plan test files plus the checkout-stops, lifecycle, writers-gate, policy snapshot suites all pass (224 + 122 tests); `npx tsc --noEmit` shows only the 8 baseline errors in `tests/`; ESLint clean on the five touched files.

## Deviations from Plan

None - plan executed as written. The three code commits map one to one to the three tasks (Task 2 changed tests only: the implementation already satisfied every case).

Note: the per-plan commit ledger step (protocol 0c) could not run as a compound shell command in this sandbox, so `plan_head_before` is the known worktree base SHA given in the spawn brief; `rev-list --count` over that base gave 3.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-91-19 (stops written only when the capture affected an unpaid row, tested with confirmed and lost-race cases), T-91-20 (pay-now cancel + 503, card and cash propagate the error before any Stripe object), T-91-21 (logs carry ids and codes only, tested). STOP-04 backstop truth (a pay-now booking created only by the webhook fallback insert carries no stops) is unchanged and accepted.

## Self-Check: PASSED

- `lib/booking-stops.ts`, `tests/booking-stops.test.ts`, `tests/checkout-stops-persist.test.ts` exist; commits cdeafa45, 387ed0e2, dc71e179 are on the branch.
- `grep -c STOPS_NOT_SAVED` and `paymentIntents.cancel` in the route are above 0; `git log -1 --format=%s -- app/api/create-payment-intent/route.ts` starts with `security:`.
