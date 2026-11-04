---
phase: 88-card-on-file-scheduled-holds
plan: 09
subsystem: payments
tags: [stripe, webhook, setup-intent, card-on-file, idempotency, resend, i18n-email]
status: complete

requires:
  - phase: 88-01
    provides: applyTransition, appendPaymentEvent, fake payments DB
  - phase: 88-03
    provides: renderPaymentEmail (card_saved, hold_placed)
  - phase: 88-04
    provides: REQUIRED_EVENTS / KEPT_EVENTS
  - phase: 88-08
    provides: card checkout intent (cofBookingId metadata), getPaymentsStripe
provides:
  - "dispatchPaymentEvent gate in the Stripe webhook route (card events never reach the legacy chain)"
  - "lib/stripe-webhook/dispatch.ts: dispatchPaymentEvent, classifyPaymentEvent, once, CARD_EVENT_TYPES, ROUTES"
  - "lib/stripe-webhook/card-confirm.ts: confirmCardBooking, applySetupSucceeded, applyHoldNowAuthorized, handleSetupSucceeded, handleSetupFailed, handleHoldNowAuthorized"
  - "lib/payments/emails/send.ts: sendPaymentEmail (ledger-keyed exactly once), bookingEmailDataFromRow"
  - "status-service profile 'payment-engine'"
affects: [88-10, 88-11, 88-12, 88-13, 88-14]

plan_head_before: affd571619d2c4950c216d42c59ce41ab7f5f6b0
plan_head_after: 9aa9be00
commits: 3

actuals:
  tokens: 16000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Route by metadata.kind before the legacy chain; unknown card_ kinds acknowledged, never routed to booking creation"
    - "Effects split into first-time (gated on the transition applying) and ledger-guarded (event_key claimed before the send)"
    - "Refund observer: observation only, errors swallowed, legacy handler always runs"

key-files:
  created:
    - lib/stripe-webhook/dispatch.ts
    - lib/stripe-webhook/card-confirm.ts
    - lib/payments/emails/send.ts
    - tests/webhooks-stripe-payments.test.ts
  modified:
    - app/api/webhooks/stripe/route.ts
    - lib/booking-status-service.ts
    - tests/booking-status-service.test.ts

key-decisions:
  - "Card PI/SI events without a card_ kind return null from classifyPaymentEvent (legacy chain, which acknowledges them) so pay-now PaymentIntent failures behave exactly as before"
  - "A handler error answers 500 without claiming the event so Stripe retries; handlers are idempotent through the ledger event_key"
  - "Hold-at-checkout for a booking cancelled meanwhile moves checkout_pending -> released; voiding the uncaptured authorization is left to the cancel / pi_canceled plans (88-12/88-14), it expires on its own"
  - "setup_failed is keyed by the Stripe event id (one SetupIntent can fail repeatedly); hold_scheduled is keyed by the SetupIntent id"

requirements-completed: [PAYF-03, HOLD-01, HOLD-03, MAIL-01]

duration: n/a
completed: 2026-11-04
---

# Phase 88 Plan 09: Webhook routing by purpose, setup and hold-at-checkout confirmation Summary

Stripe card-flow events are routed by `metadata.kind` right after signature verification and confirm the checkout's own booking in place exactly once, with a localized `card_saved` / `hold_placed` email, one English operator alert and once-only promo, GA4 and reminder effects. The legacy pay-now chain below the gate is byte-identical (route.ts gained 7 lines, deleted 0) and its suites pass unmodified.

## Accomplishments

- **Tracer (Task 1):** `setup_intent.succeeded` (card_setup) -> `dispatchPaymentEvent` -> `handleSetupSucceeded` -> booking `unpaid -> confirmed` through `advanceBookingStatus` (profile `payment-engine`, actor system) and payment `checkout_pending -> card_saved`, answer 200; `saveBooking`, the payment-link reconcile and `sendClientConfirmation` are never called. Same event id twice answers `{ received: true, duplicate: true }`. Tracer gate: the automated verify (legacy webhook suites, isolation and writers gates, tsc grep) was re-run end to end and passed before expansion.
- **Side effects (Task 2):** `sendPaymentEmail` claims `email:<kind>:<bookingId>` in the ledger before sending (`duplicate` / `sent` / `failed`, a `:send_failed` row on error, ids only in logs, no email-log helper). `card_saved` goes out in the booking locale (English fallback), the operator alert is claimed by `alert:new_booking:<bookingId>`, the consent row gets `confirmed_at`. Promo claim, GA4 purchase, the 2 h reminder and the `hold_scheduled` row run only when the transition applied for the first time; a retry after a mid-handler crash finishes the ledger-guarded parts without repeating them.
- **Hold-at-checkout and observers (Task 3):** `payment_intent.amount_capturable_updated` (card_hold_now) confirms once, moves `checkout_pending -> authorized` with `hold_payment_intent_id`, `hold_amount_minor`, `hold_placed_at` and `capture_before` (card `capture_before` x 1000, PI retrieved with expand `latest_charge` when the event lacks it, failure tolerated), sends `hold_placed` at_checkout once; the collected-payment column stays NULL. `setup_intent.setup_failed` appends one `setup_failed` row. `charge.refunded` on a card_hold booking appends one `refund_observed` row (`refund_observed:<charge>:<amount>`) and the shipped handler still runs. A test asserts every event type the dispatcher routes is in `REQUIRED_EVENTS` or `KEPT_EVENTS`.

## Verification

- `npx vitest run` on webhooks-stripe-payments (35 tests), webhooks-stripe, webhooks-stripe-checkout-session, webhooks-stripe-group-payment, booking-status-service, webhook-isolation-guard, status-writers-gate, payment-state-writers-gate, payments-emails: all green.
- Full suite: 337 files passed; 5 failed (account-trips, auth-customer, login-actions, passenger-actions, profile-actions), the known next-intl resolution artefact of the symlinked worktree node_modules.
- `tsc --noEmit`: no error in any touched file (baseline errors only in tests/ elsewhere). `eslint --quiet` clean on all touched files.
- Acceptance greps: `dispatchPaymentEvent(event)` in route.ts = 1; `'payment-engine'` in the status service >= 1; `logEmail` in send.ts = 0; `appendPaymentEvent(` in send.ts = 2; `sendClientConfirmation` in card-confirm.ts = 0; `payment_intent_id:` pattern in card-confirm.ts = 0; `REQUIRED_EVENTS` in the test = 3; the three legacy test files unchanged.

## Deviations from Plan

**1. [Rule 3 - Blocking] hold_payment_intent_id written as a shorthand property**
- **Issue:** the acceptance grep `payment_intent_id['"]?\s*:` is meant to prove the hold never sets `payment_intent_id`, but it also matches the required key `hold_payment_intent_id:`.
- **Fix:** `const hold_payment_intent_id = pi.id` and the shorthand in the patch, so both the intent (collected-payment column untouched) and the grep hold.
- **Files:** lib/stripe-webhook/card-confirm.ts. **Commit:** 9aa9be00.

**2. [Rule 2 - Missing critical functionality] Partner and unknown-booking guards**
- **Issue:** the plan names `assertMoneyEligible` only for setup; a card event for a partner (gnet) booking or a missing booking must not throw (Stripe would retry forever).
- **Fix:** `resolveBooking` logs ids only and acknowledges without a write for a missing cofBookingId, a missing booking and a partner booking; used by all three handlers.
- **Commit:** 074d8133.

**3. [Rule 2] Handler failure path**
- A throwing handler answers 500 (Stripe retries) and does not claim the event; the retry finds the transition already applied and finishes the ledger-guarded effects (tested with a simulated crash).
- **Commit:** 074d8133 / ef65a7b3.

**4. Test-only: fake query builder lacks `not('in')`**
- The shipped refund handler uses `.not('status','in',...)`; the test wraps the fake `bookings` query to translate it into `neq` calls. `tests/helpers/fake-payments-db.ts` was not modified.

## Known Stubs

None. Routes without a registered handler (`hold_authorized`, `pi_failed`, `pi_canceled`, `charge_succeeded`, `recovery_paid`, `dispute`) are acknowledged and logged by design until plans 88-11, 88-13 and 88-14 register them.

## Deferred / hand-off notes

- A hold-at-checkout authorization for a booking cancelled before the event arrives is released in our ledger but the uncaptured Stripe authorization is not voided here (it lapses by itself); the cancel / `pi_canceled` plans own the void.
- Plan 88-11's tick reconcile can call `applySetupSucceeded` / `applyHoldNowAuthorized` with actor `{ type: 'system', id: null }`; both are replay-safe.

## Threat Flags

None: no new endpoint or trust boundary; dispatch runs only after the unchanged `constructEvent` signature check.

## Self-Check: PASSED

- Files present: dispatch.ts, card-confirm.ts, send.ts, webhooks-stripe-payments.test.ts, this SUMMARY.
- Commits present: 074d8133, ef65a7b3, 9aa9be00.
