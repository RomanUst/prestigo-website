---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 04
subsystem: payments
tags: [checkout, pricing, security, google-routes, stops, waiting-fee]
requires:
  - phase: 91-02
    provides: lib/stops.ts, lib/route-distance.ts, isAirportTrip, waitingRate in pricing config
provides:
  - "priceCheckout as the single server price path: Google route distance through the stops, airport from coordinates, waiting fee in the extras sum"
  - "error codes 503 ROUTING_UNAVAILABLE, 422 WAITING_NOT_AVAILABLE, 400 STOPS_NOT_ALLOWED, 400 'Invalid coordinates'"
  - "PricedCheckout.distanceKm / durationMin / waitingFeeEur / stops, ValidatedCheckout.origin / destination / stops"
affects: [91-06, 91-07, 91-08]
tech-stack:
  added: []
  patterns: ["server-only price inputs (client distanceKm and isAirport demoted to ignored legacy fields)", "fail closed on routing outage (no client fallback)"]
key-files:
  created: [tests/checkout-stops.test.ts]
  modified:
    - lib/checkout/compute.ts
    - app/api/card-checkout/intent/route.ts
    - app/api/card-checkout/init/route.ts
    - tests/checkout-compute.test.ts
    - tests/card-checkout-intent.test.ts
    - tests/card-checkout-init.test.ts
    - tests/card-checkout-cash.test.ts
    - tests/create-payment-intent.test.ts
    - tests/payments-lifecycle.test.ts
    - tests/payments-policy-lifecycle.test.ts
    - tests/booking-policy-snapshot.test.ts
key-decisions:
  - "Client distanceKm and isAirport are still accepted by the schema but never read; the checkout takes the distance from Google Routes and the airport flag from coordinates (T-91-12)"
  - "Routing failure answers 503 ROUTING_UNAVAILABLE on intent and create-payment-intent; init keeps its opaque { eligible: false } (D-17)"
  - "WAITING_NOT_AVAILABLE and the schema limits are checked before the Google call so an unpriceable request never spends routing quota"
  - "Round trips: the return leg reuses the outbound route distance (now through the stops) and carries no waiting; semantics unchanged from before, quote and checkout stay in parity"
requirements-completed: [STOP-02, STOP-03]
duration: 20min
completed: 2026-11-11
status: complete
commits: 3
plan_head_before: 8d16038928b07bfc3ed103fe050970e8097fda46
plan_head_after: 4c90bc9f94d98b2bce70a1d18c0b485aa75505b5
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
---

# Phase 91 Plan 04: Server-authoritative checkout price with stops and waiting Summary

The checkout (pay-now, card, cash) now prices every transfer and round trip on the distance Google Routes returns through origin, stops and destination, detects the airport from coordinates, adds the admin waiting fee, and answers 503 when routing is down. Nothing the browser sends for distance, airport flag or amount can change the price, the stored distance_km or the cancellation window.

`commits: 3` counts the three code commits; the SUMMARY docs commit follows them (so `plan_head_after` is the head before it).

## What was built

- `lib/checkout/compute.ts`
  - `checkoutBookingSchema.bookingData.stops`: strict objects, max 5, address 1-500 chars without line breaks, lat/lng in range, wait 0-120 in 15-minute steps; declared before `.catchall`.
  - `validateCheckoutBooking`: no longer reads `distanceKm`; parses origin/destination coordinates (required and in range for transfer and round_trip, else 400 `Invalid coordinates`; best effort for hourly/daily, used only for the airport flag); stops on any trip type except transfer give 400 `STOPS_NOT_ALLOWED`. Returns `origin`, `destination`, `stops`.
  - `priceCheckout`: waiting rate check first (422 `WAITING_NOT_AVAILABLE`), then `computeRouteDistance` for transfer and round_trip (503 `ROUTING_UNAVAILABLE`, log carries only the reason code), `isAirportTrip` from coordinates, `priceStops` + `waitingFeeEur`, waiting added to `extrasEur` of `computeCombinedTotalMinor` so a promo reduces the whole sum once (D-14). Returns `distanceKm`, `durationMin`, `waitingFeeEur`, `stops`.
  - `buildCheckoutMeta`: `distanceKm` is the server distance; `outboundAmountCzk` includes waiting; no new metadata key.
- Intent route: `evaluateCancellation` and `freeHoursFor` read `priced.distanceKm`. Init route: policy preview uses `priced.distanceKm` and adds waiting to the outbound share.
- `app/api/create-payment-intent/route.ts` needed no change (it maps `priced` failures generically, so the 503 and 422 flow through).

## Tests

- New `tests/checkout-stops.test.ts` (30 tests): tracer (130 km through one stop with 24 EUR waiting, row `distance_km` 130, 409 PRICE_CHANGED against the tampered 1 km, cancellation window follows the server distance), fail-closed 503 with no write and no coordinates in logs, 422 WAITING_NOT_AVAILABLE before routing, schema limit matrix, STOPS_NOT_ALLOWED, hourly/daily never call Google, quote/checkout parity (stops + night, no stops, airport origin with a lying browser flag), promo 292 = round((300+24) x 0.9), meta distance and key set, determinism.
- `tests/card-checkout-init.test.ts` additionally covers the 130 km vs '1' preview and the opaque answer on routing failure; `tests/create-payment-intent.test.ts` covers 503, tamper (distance, airport flag, amount) and 422 on the pay-now route. These two routes need different module mocks than the fake-DB intent route, so their cases live in their existing files rather than in `checkout-stops.test.ts`.
- The eight existing checkout test files got a hoisted `@/lib/route-distance` mock returning the distance their fixtures used to send, plus coordinates in the base booking fixtures; assertions are unchanged except two in `tests/checkout-compute.test.ts` that encoded the old behaviour (`distanceKm "0"` rejection became an `Invalid coordinates` rejection; `result.distanceKm` became `result.origin` / `result.stops`).

Verification: the ten test files of the plan verification pass (321 passed, 5 todo); `npx tsc --noEmit` shows the 8 baseline errors in `tests/` only; eslint clean on all touched source and the new test files. A full-suite run showed 398 files passing and 7 failing; all 7 (`account-trips`, `auth-customer`, `login-actions`, `manage-actions`, `manage-page`, `passenger-actions`, `profile-actions`) fail only with `ERR_MODULE_NOT_FOUND` for `next-intl/dist/esm/development/server.react-server.js` through the worktree `node_modules` symlink (environmental, not caused by this plan, code not changed for it).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixtures needed coordinates**
- **Found during:** Task 1
- **Issue:** coordinates are now required for transfer and round_trip (STOP-02), and the existing fixtures sent only `distanceKm`, so every checkout test would have answered 400.
- **Fix:** added origin/destination coordinates (Prague centre to Brno, not near the airport) to the base booking fixtures of the eight files, next to the route-distance mock.
- **Files modified:** the eight existing test files
- **Commit:** first code commit (security(91-04): price checkout on the server route distance through the stops)

**2. [Rule 3 - Scope] Init and pay-now cases placed in their existing test files**
- **Issue:** the plan says the failure matrix runs "across the three routes" in `tests/checkout-stops.test.ts`; init and create-payment-intent need different module mocks than the fake-DB intent route.
- **Fix:** intent + direct `priceCheckout` + parity in `checkout-stops.test.ts`; init and pay-now cases in `card-checkout-init.test.ts` and `create-payment-intent.test.ts` (both are in the plan's `files_modified`).

Otherwise the plan executed as written; no `compute.ts` change was needed in Tasks 2 and 3 (the matrix and parity passed on the Task 1 implementation).

## Behaviour notes

- Round trips: the return-leg price reuses the outbound distance (now routed through the stops, which only a transfer can have, so in practice origin to destination) and carries no waiting. Semantics unchanged from before.
- STOP-02 residual (accepted, T-91-16): a client can send coordinates that do not match the address text; the price follows the coordinates and the operator sees both. Covered by the backstop truth, not a test.
- Hourly/daily checkouts read coordinates only for the airport flag (best effort); an absent or invalid pair means no airport fee, and Google is never called.

## Threat Flags

None: no new endpoint, auth path or schema change; the input surface (`stops`) is bounded by the strict schema (T-91-14).

## Known Stubs

None.

## Self-Check: PASSED

- `lib/checkout/compute.ts`, `tests/checkout-stops.test.ts` exist; commits `e11dcaee`, `77a0b709`, `4c90bc9f` present on the branch.
- `grep -c "bookingData.distanceKm\|bookingData.isAirport" lib/checkout/compute.ts` prints 0; no `validated.distanceKm` left in the two routes; `@/lib/route-distance` mocked in all 8 listed test files; `waitingFeeEur` appears 5 times in compute.ts.
