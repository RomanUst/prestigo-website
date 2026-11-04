---
phase: 88-card-on-file-scheduled-holds
plan: 08
subsystem: payments
tags: [stripe, setup-intent, consent, idempotency, card-on-file, checkout]
status: complete

requires:
  - phase: 88-01
    provides: applyTransition, payment tables (booking_payment_consents, ledger), fake payments DB
  - phase: 88-02
    provides: validateCheckoutBooking, priceCheckout, buildCheckoutMeta
  - phase: 88-03
    provides: buildConsentText, consentSha256, CARD_CONSENT_VERSION
  - phase: 88-06
    provides: getPaymentSettings, isCardFlowEligible, computeHoldAt, decideHoldMode, meetsBookingLeadTime
provides:
  - "POST /api/card-checkout/intent (setup mode): one unpaid card_hold booking, Customer, consent record, SetupIntent, checkout_pending, client secret"
  - "lib/payments/stripe.ts: getPaymentsStripe, stripeKeys, CardKind, cardMetadata, classifyStripeError, stripeErrorCode"
  - "lib/payments/customer.ts: ensureStripeCustomer"
  - "lib/payments/checkout.ts: recordConsent, createCardCheckoutIntent"
  - "tests/helpers/fake-stripe.ts: createFakeStripe, the in-memory Stripe for the whole phase"
affects: [88-09, 88-10, 88-11, 88-12, 88-13, 88-14, 88-15, 88-16, 88-17]

plan_head_before: 4eba5ce2da86a9d56ccbda92b52b0f3d7f0efa77
plan_head_after: 9a3f3570753d5462aaed1707c9fc9152a48b27b3
commits: 2

actuals:
  tokens: 18100
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Duck-typed Stripe error classification on error.type, so it works with the real SDK, a mocked SDK and the fake"
    - "Booking row and consent written before Stripe talks to the browser; webhook confirms by metadata.cofBookingId"
    - "Rejection ladder with no writes before the last cross-check (consent, validation, lead, price, mode)"

key-files:
  created:
    - app/api/card-checkout/intent/route.ts
    - lib/payments/checkout.ts
    - lib/payments/stripe.ts
    - lib/payments/customer.ts
    - tests/helpers/fake-stripe.ts
    - tests/card-checkout-intent.test.ts
  modified: []

key-decisions:
  - "classifyStripeError reads error.type (class name) instead of using instanceof, so it needs no import of the stripe package and works against the fake"
  - "A retry of the same attemptId keeps its booking reference (looked up before the capture), so Stripe metadata from an older SetupIntent still matches the row"
  - "The consent row is written before the SetupIntent is created; a SetupIntent failure leaves a consent row for a SetupIntent that never existed, which is harmless audit data"
  - "Customer create recovers from a StripeIdempotencyError (same key, changed details) with a random-suffixed key; every normal path keeps cus:<bookingId>"
  - "attemptId is required for the card flow (400 INVALID_REQUEST when missing); the pay-now flow keeps it optional"

requirements-completed: [HOLD-01]

duration: n/a
completed: 2026-11-04
---

# Phase 88 Plan 08: Card checkout intent (setup mode) Summary

POST /api/card-checkout/intent now saves a card without charging it: it recomputes the price, captures one unpaid `card_hold` booking per attemptId, creates one Stripe Customer, stores the server-rendered consent record and creates a SetupIntent, then moves the booking to `checkout_pending` before returning the client secret.

## Accomplishments

- **Tracer (Task 1):** intent route, `recordConsent` / `createCardCheckoutIntent`, `lib/payments/stripe.ts` and the complete fake Stripe. Tracer gate: the automated verify (route test, create-payment-intent suite, tsc grep) was re-run end to end and passed, then expansion proceeded. Commit 8f9342d7.
- **Rejection paths and Customer handling (Task 2):** `lib/payments/customer.ts`, the full rejection ladder tests, retry and replay safety, stripe conventions and fake Stripe self-checks. Commit 9a3f3570.
- Ladder order in the route: rate limit, body size, JSON, shape (400), eligibility (422 NOT_ELIGIBLE), consent (422 CONSENT_REQUIRED, only a JSON boolean `true`), compute validation, lead time (422 LEAD_TIME), pricing, price cross-check (409 PRICE_CHANGED with the server amount), mode cross-check (409 MODE_CHANGED), mode supported (422 MODE_UNSUPPORTED for hold_now until 88-12), then `createCardCheckoutIntent`.
- Stripe objects carry `{ kind, cofBookingId, attempt, bookingReference }` plus `promoCode` only when a promo applied. No legacy booking-id key, so the legacy webhook branches can not pick them up. Contact details live in the Customer's dedicated fields only (the Customer metadata is the booking id).
- Idempotency keys: `cus:<bookingId>`, `si:<bookingId>:<consentId>` (full set of formats exported from `stripeKeys` for later plans); none contain personal data.
- Acceptance greps: `paymentIntents.create` in checkout.ts = 0, `request_three_d_secure` = 1, PII words in stripe.ts = 0, `ensureStripeCustomer(` in checkout.ts = 1, `consent === true` in the route = 1.

## Verification

- `npx vitest run` of card-checkout-intent (53 tests), card-checkout-init, create-payment-intent, payment-state-writers-gate, middleware-csrf-forms, payments-state, payments-consent, checkout-compute: 249 passed, 5 todo (pre-existing).
- `tsc --noEmit`: 8 errors, the tests/ baseline; none from the new files.
- `eslint --quiet` clean on the route, checkout, customer, stripe, fake-stripe and the test.

## Deviations from Plan

### Auto-fixed / judgement calls

**1. [Rule 2 - Missing critical functionality] Signed-in account resolved server-side**
- **Issue:** the plan's ladder does not mention the account link; without it a signed-in client's card booking would have `user_id` NULL and never appear in their account (the pay-now route links it).
- **Fix:** the route resolves the account through `createClient().auth.getUser()` (best effort, a failure means guest) and passes it to `buildCheckoutMeta`. Never read from the body.
- **Files modified:** app/api/card-checkout/intent/route.ts
- **Commit:** 8f9342d7

**2. [Rule 2 - Missing critical functionality] attemptId required**
- **Issue:** "exactly one booking per attemptId" is impossible without it; pay-now treats it as optional.
- **Fix:** a missing attemptId is 400 INVALID_REQUEST. The wizard already sends one.
- **Commit:** 8f9342d7

**3. [Rule 2 - Missing critical functionality] Reuse of the booking reference and early confirmed check**
- **Issue:** a re-POST would generate a new reference while older SetupIntent metadata still carries the previous one.
- **Fix:** `createCardCheckoutIntent` looks up the attempt's row first: a row that is no longer `unpaid` answers `already_confirmed` without any write or Stripe call, an unpaid row keeps its reference. `captureUnpaidBooking` returning `[]` (race) also answers `already_confirmed`.
- **Commit:** 8f9342d7

**4. [Rule 2 - Missing critical functionality] Customer create recovery**
- **Issue:** if the Customer is created, the SetupIntent then fails (so the id is never persisted) and the client changes their email before retrying, Stripe rejects the reused key with different params, which would make the checkout fail for good.
- **Fix:** `ensureStripeCustomer` retries once with a random-suffixed key on `StripeIdempotencyError` only. Tested.
- **Commit:** 9a3f3570

**5. Task 1 customer handling**
- The plan says Customer handling is minimal inline in Task 1 and moves in Task 2. Done exactly so (inline helper in Task 1, `customer.ts` in Task 2). The Customer is created with the contact details in its own fields, so the test "no personal data in Stripe params" asserts it for metadata, the SetupIntent params and the idempotency keys, and asserts the Customer create is the only call carrying contact fields.

**6. Git-dir sentinel**
- The `gsd-plan-head-before-88-08` ledger was written; `commits:` above is measured from it (2 task commits, the SUMMARY commit follows).

## Auth gates

None.

## Known Stubs

None. `MODE_UNSUPPORTED` for hold_now is the intentional contract until plan 88-12 (documented in the route and tested).

## Threat Flags

None beyond the plan's threat model. Notes for the verifier:
- T-88-19 / T-88-20 / T-88-22 / T-88-23 mitigations are covered by tests (PRICE_CHANGED and MODE_CHANGED with no writes, boolean-only consent with server text, alreadyConfirmed with no Stripe call, no PII in Stripe params or logs).
- T-88-21 (card testing): rate limit `/api/card-checkout/intent` 10/min/IP and the strict Origin requirement were already added by 88-06 (`lib/rate-limit.ts`, `middleware.ts`); this route relies on them. Radar remains a Phase 89 go-live blocker.
- Open for 88-09 / later plans (not this plan's scope): `pay-now` re-POST of an attempt that first went through the card flow overwrites the row via `captureUnpaidBooking` without resetting `payment_mode`; plan 88-10 (client wiring) should keep one flow per attempt or reset the mode.

## Self-Check: PASSED

- FOUND: app/api/card-checkout/intent/route.ts
- FOUND: lib/payments/checkout.ts
- FOUND: lib/payments/stripe.ts
- FOUND: lib/payments/customer.ts
- FOUND: tests/helpers/fake-stripe.ts
- FOUND: tests/card-checkout-intent.test.ts
- FOUND commits: 8f9342d7, 9a3f3570
