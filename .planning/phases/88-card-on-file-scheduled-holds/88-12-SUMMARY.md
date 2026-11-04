---
phase: 88-card-on-file-scheduled-holds
plan: 12
subsystem: payments
status: complete
tags: [card-on-file, hold-now, manual-capture, stripe-elements, payment-intent, consent]

requires:
  - phase: 88-08
    provides: createCardCheckoutIntent / recordConsent, stripeKeys.holdNow / voidHoldNow, intent route (setup mode)
  - phase: 88-09
    provides: payment_intent.amount_capturable_updated handler (kind card_hold_now) that confirms the booking
  - phase: 88-10
    provides: Step6CardOnFile (SUPPORTED_MODES, consent invalidation, notice slot), CardPaymentExplainer hold_now rows
provides:
  - "createCardCheckoutIntent hold_now branch: on-session manual-capture PaymentIntent (setup_future_usage off_session) for the full server amount"
  - "POST /api/card-checkout/intent answers hold_now (the 422 MODE_UNSUPPORTED answer is gone)"
  - "Step6CardOnFile held-now variant: SUPPORTED_MODES = ['setup','hold_now'], mode-aware Elements options, confirmPayment"
affects: [88-13 capture limited to hold_amount_minor, 88-17 canary B on-session 3DS UAT]

actuals:
  tokens: 70000
  tasks: 2
  commits: 2
plan_head_before: fe9bf186de8afc0f757719a022be167c092c5cab
plan_head_after: 67289afaa2305e884281bd44514c3c4713d5cef7

tech-stack:
  added: []
  patterns:
    - "hold_now stores the authorisation ONLY as hold_payment_intent_id / hold_amount_minor; payment_intent_id (the collecting PaymentIntent) is never set at checkout"
    - "Predecessor handling before a new authorisation: requires_capture -> already_confirmed, unconfirmed -> cancel with pi_void key (best effort), unknown id (resource_missing) ignored, any other lookup error aborts"

key-files:
  created: []
  modified:
    - lib/payments/checkout.ts
    - app/api/card-checkout/intent/route.ts
    - components/booking/steps/Step6CardOnFile.tsx
    - tests/card-checkout-intent.test.ts
    - tests/Step6CardOnFile.test.tsx

key-decisions:
  - "The existing-hold check runs before the new consent row is written, so an already-held booking leaves no orphan consent; the consent still precedes the PaymentIntent create (T-88-37)"
  - "The consent row's payment_intent_id is updated right after the create and before the client secret is returned, because the 88-09 webhook confirms the consent by that column"
  - "A non-resource_missing error while retrieving the earlier hold PaymentIntent is rethrown (500, client retries) instead of risking a second live authorisation"
  - "Elements amount changes (PRICE_CHANGED) are an in-place Elements update; the key stays mode+currency so entered card data survives, and the consent tick is cleared by the existing consent invalidation key"
  - "confirmPayment success statuses are requires_capture, processing, succeeded; anything else shows the generic error and keeps the form editable"

patterns-established:
  - "Mode-aware checkout: the server decides the mode, the UI builds Elements options and the confirm call from that mode only"

requirements-completed: [HOLD-03, HOLD-01]

coverage:
  - id: D1
    description: "hold_now intent creates one manual-capture off_session PaymentIntent on the booking's Customer with card_hold_now metadata and key pi_now:<id>:<consentId>; no SetupIntent"
    requirement: HOLD-03
    verification:
      - kind: unit
        ref: "tests/card-checkout-intent.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Booking ends checkout_pending with hold_payment_intent_id and hold_amount_minor set, hold_at and payment_intent_id NULL; held-now consent stored with text, hash and payment_intent_id before the secret is returned"
    requirement: HOLD-03
    verification:
      - kind: unit
        ref: "tests/card-checkout-intent.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "No double hold: requires_capture predecessor -> alreadyConfirmed; unconfirmed predecessor cancelled with pi_void key; failed cancel and stale id do not block"
    requirement: HOLD-03
    verification:
      - kind: unit
        ref: "tests/card-checkout-intent.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Held-now UI: headline, two rows, consent text equals the server string, button 'Hold {amount} & book', Elements mode payment with amount / manual capture / off_session / card, confirmPayment (never confirmSetup), 3DS auth failure message"
    requirement: HOLD-03
    verification:
      - kind: unit
        ref: "tests/Step6CardOnFile.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "MODE_CHANGED between setup and hold_now in both directions remounts in the server mode with the matching consent text, cleared tick and focused notice; no fallback to the legacy step"
    requirement: HOLD-03
    verification:
      - kind: unit
        ref: "tests/Step6CardOnFile.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real on-session 3DS challenge on a 360px phone and issuer release of an abandoned authorisation"
    requirement: HOLD-03
    verification: []
    human_judgment: true
---

# Phase 88 Plan 12: On-session hold at checkout Summary

**Bookings whose pickup is inside the hold lead are authorised right at checkout: a manual-capture PaymentIntent with `setup_future_usage: off_session`, confirmed in the browser with `stripe.confirmPayment` (3DS on-session), stored only as `hold_payment_intent_id`.**

## Accomplishments

- `createCardCheckoutIntent` takes the server-decided `mode`. The `hold_now` branch records the held-now consent, handles an existing hold PaymentIntent (requires_capture -> `already_confirmed`; unconfirmed -> cancelled with `pi_void:<piId>`), creates the PaymentIntent with `pi_now:<bookingId>:<consentId>`, links the consent row to the PaymentIntent id, then moves `none|checkout_pending -> checkout_pending` with `hold_payment_intent_id`, `hold_amount_minor`, `hold_at: null`. `payment_intent_id` is never set.
- The intent route lost its `MODE_UNSUPPORTED` branch and passes `mode: serverMode`.
- `Step6CardOnFile`: `SUPPORTED_MODES = ['setup','hold_now']`; Elements options are built per mode (setup, or payment with amount, currency, `captureMethod: 'manual'`, `setupFutureUsage: 'off_session'`, card only); the confirm call is `confirmPayment` for hold_now and `confirmSetup` for setup. The explainer, consent key and CTA were already mode-aware (88-10). The test-only `SUPPORTED_MODES.push('hold_now')` hack in `tests/Step6CardOnFile.test.tsx` is removed; the "unsupported mode" tests now use an unknown mode.
- `Step6Payment.tsx` is untouched.

## Task Commits

1. Task 1 (tracer): `791c3087` security(88-12): on-session hold at checkout for pickups inside the hold window (HOLD-03, D-11, tracer)
2. Task 2: `67289afa` security(88-12): held-now variant of the card checkout step (HOLD-03)

Tracer gate: the Task 1 `<verify>` (intent + webhook suites, tsc scoped to the touched files) was green before Task 2 started; the whole chain (intent -> Elements -> confirmPayment -> webhook) is covered by unit tests on each side, the live 3DS path is canary B (plan 88-17).

## Deviations from Plan

None - plan executed as written. Two small judgement calls inside the plan's scope are recorded under key-decisions (existing-hold check ordered before the new consent row; non-`resource_missing` retrieve error aborts).

## Verification

- `npx vitest run tests/card-checkout-intent.test.ts tests/Step6CardOnFile.test.tsx tests/Step6Payment.test.tsx tests/webhooks-stripe-payments.test.ts` plus `card-checkout-init`, `rate-limit`, `payment-state-writers-gate`, `middleware-csrf-forms`: 8 files, 255 passed, 20 todo (pre-existing).
- `npx tsc --noEmit`: no error in the touched modules (baseline tests/ errors unchanged).
- `npx eslint --quiet` on the five touched files: clean.
- Acceptance greps: `MODE_UNSUPPORTED` 0 in the route, `setup_future_usage` 1 and `capture_method` 1 in `lib/payments/checkout.ts`, `captureMethod` 1 in the step, `Step6Payment.tsx` unchanged.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-88-35 amount from `priceCheckout` only with the `displayedAmountMinor` cross-check; T-88-36 requires_capture short-circuit, pi_void cancel, per-consent idempotency key; T-88-37 server-rendered, hashed, versioned consent stored with the PaymentIntent id before the secret is returned).

## Open Items

- Whether every issuer releases an abandoned on-session authorisation immediately, and the 3DS challenge fit on a 360px phone, are observed only in canary B (plan 88-17), as the plan states.
- The webhook-side consent confirmation relies on `booking_payment_consents.payment_intent_id`; the intent route now sets it, so 88-09's `ledgerGuardedEffects` finds the row.

## Self-Check: PASSED

- Files exist: lib/payments/checkout.ts, app/api/card-checkout/intent/route.ts, components/booking/steps/Step6CardOnFile.tsx, tests/card-checkout-intent.test.ts, tests/Step6CardOnFile.test.tsx.
- Commits present: 791c3087, 67289afa.
