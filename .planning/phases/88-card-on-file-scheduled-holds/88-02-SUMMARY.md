---
phase: 88-card-on-file-scheduled-holds
plan: 02
subsystem: payments
tags: [checkout, pricing, validation, stripe, zod, refactor]

requires:
  - phase: 62-abandoned-checkout-capture
    provides: create-payment-intent route, unpaid capture, buildBookingRow meta contract
provides:
  - "lib/checkout/compute.ts: checkoutBookingSchema, CheckoutBookingData, CheckoutError, validateCheckoutBooking, priceCheckout, buildCheckoutMeta"
  - "Server-authoritative price/validation path shared by pay-now and the (future) card-on-file endpoints"
  - "tests/checkout-compute.test.ts unit coverage of the shared module"
affects: [88-06 card-checkout init, 88-08 card-checkout intent]

actuals:
  tokens: 8850
  tasks: 2
  commits: 2
plan_head_before: d7f9f6c1b9baac52e28c8333893ae4fbfb362c5d
plan_head_after: ea1d4975184896945dbb4f4fa1eaf0bbf5ad0cf8
commits: 2

tech-stack:
  added: []
  patterns:
    - "Result-union validators ({ ok:true, ... } | CheckoutError) shared between routes; routes map CheckoutError to NextResponse.json({ error, code }, { status })"
    - "Legacy business rules (12h lead time) stay in the route, not in the shared module"

key-files:
  created:
    - lib/checkout/compute.ts
    - tests/checkout-compute.test.ts
  modified:
    - app/api/create-payment-intent/route.ts

key-decisions:
  - "The legacy 12-hour month-based lead-time check stays in create-payment-intent/route.ts and is not exported, so the card flow cannot inherit it"
  - "validateCheckoutBooking keeps the legacy side effect of writing the normalised E.164 phone back onto bookingData (buildCheckoutMeta reads it)"
  - "Currency selection (czk vs eur) stays in the route and is passed into priceCheckout"

requirements-completed: [HOLD-01]

duration: 14min
completed: 2026-11-04
status: complete
---

# Phase 88 Plan 02: Shared Checkout Compute Summary

**Behaviour-preserving extraction of the pay-now schema, validation, server pricing, promo lookup and booking meta builder into `lib/checkout/compute.ts`, proven by the existing create-payment-intent suite passing unmodified.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 2 of 2 (1 tracer, 1 auto/tdd)
- **Files:** 3 (2 created, 1 modified)

## Accomplishments

- `lib/checkout/compute.ts` now owns `checkoutBookingSchema`, `validateCheckoutBooking` (phone, trip type, vehicle, seat limit, distance, round-trip dates/ordering/custom-quote), `priceCheckout` (pricing config, extras, outbound/return legs, promo lookup, `computeCombinedTotalMinor`) and `buildCheckoutMeta` (allow-listed key set, 500-char clamps, `normalizeSiteLocale`). No client amount is an input; no Stripe, no writes.
- `app/api/create-payment-intent/route.ts` shrank to rate limit, body guard, parse, auth lookup, legacy LEAD_TIME check, reference generation, Stripe PaymentIntent create and unpaid capture. Same status codes, error codes and strings.
- `tests/create-payment-intent.test.ts` is untouched and passes (58 passed, 5 todo).
- `tests/checkout-compute.test.ts` (18 tests) covers INVALID_PHONE, INVALID_REQUEST, TOO_MANY_PASSENGERS, RETURN_BEFORE_PICKUP, PRICING_UNAVAILABLE, PROMO_INVALID (unknown + exhausted), eur and czk minor amounts, client-amount tampering ignored, promo applied once, round-trip return leg, exact meta key set, 500-char clamp and locale `xx` -> `en`.

## Task Commits

1. **Task 1 (tracer): extract validation and pricing** - `ccf84f12` (security)
2. **Task 2: unit tests for the compute module** - `ea1d4975` (test)

Tracer gate: automated verify (route suite + tsc grep) re-run end-to-end after Task 1 and passed; expansion proceeded.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations, behaviour is equivalent on every tested path):
- The auth lookup (`createClient().auth.getUser()`) now runs after `validateCheckoutBooking` instead of between the phone check and the trip-type checks, because the validator is a single call. The only observable difference is that a request that fails validation no longer triggers a needless auth lookup; the existing suite mocks the lookup and is unaffected.
- Task 2 tests were written after the extraction (characterisation tests of unchanged behaviour), so there is no separate RED commit; no compute.ts change was needed.

## Verification

- `npx vitest run tests/checkout-compute.test.ts tests/create-payment-intent.test.ts`: 76 passed, 5 todo.
- `npx tsc --noEmit`: no errors in `lib/checkout`, the route or the new test.
- `npx eslint --quiet` on the three files: exit 0.
- Acceptance: test file diff-clean vs HEAD; `priceCheckout(` count 1 and `computeCombinedTotalMinor(` count 0 in the route; `month >= 4` count 1 in the route, 0 in compute.ts.

## Threat Model

- T-88-05 (tampering with the price): mitigated; amount recomputed from pricing config + promo table only, covered by the "ignores any client-supplied amount" test and the unmodified route suite.
- T-88-06 (meta disclosure): accepted as planned; same allow-listed keys, clamped to 500 chars.

## Known Stubs

None.

## Next

Ready for the next Wave 1 plans; 88-06 and 88-08 consume `validateCheckoutBooking` / `priceCheckout` / `buildCheckoutMeta` (meta is a `buildBookingRow` input only, never Stripe metadata, on the card flow).

## Self-Check: PASSED

- lib/checkout/compute.ts, tests/checkout-compute.test.ts, SUMMARY: present
- Commits ccf84f12 and ea1d4975 exist on the branch
