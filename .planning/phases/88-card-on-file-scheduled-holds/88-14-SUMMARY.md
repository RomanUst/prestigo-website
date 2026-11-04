---
phase: 88-card-on-file-scheduled-holds
plan: 14
subsystem: payments
tags: [stripe, payment-links, recovery, operator-alerts, resend, tick, webhook, card-on-file]
status: complete

requires:
  - phase: 88-01
    provides: applyTransition (self-loops), appendPaymentEvent, fake payments DB
  - phase: 88-06
    provides: RETRY_DELAY_MS, NO_VALID_HOLD_ALERT_MS, EXPIRING_HOLD_ALERT_MS, retryAt
  - phase: 88-08
    provides: stripeKeys.link, cardMetadata('card_recovery'), fake Stripe
  - phase: 88-09
    provides: sendPaymentEmail (payment_failed, charged), dispatch ROUTES / once()
  - phase: 88-11
    provides: placeHold failure branch, claimForHold, tick, hold-events
  - phase: 88-13
    provides: settleBooking failure branches (recordFailure, recordDifferenceFailure)
provides:
  - "lib/payments/recovery.ts: handlePaymentFailure(booking, { phase, code, amountMinor, attempt }), refreshRecoveryLink(booking, amountMinor, tag)"
  - "lib/payments/alerts.ts: sendPaymentOperatorAlert(kind, booking, details) -> sent | duplicate | failed, OPERATOR_ALERT_KINDS"
  - "lib/stripe-payment-links.ts: createRecoveryPaymentLink (createBookingPaymentLink and deactivateBookingPaymentLink unchanged)"
  - "lib/payments/tick.ts: step B (the one automatic retry) and step D (24 h / expiring-hold alerts), TICK_STEPS = [A, B, C, D, E], answer gains retried and alerts"
  - "lib/stripe-webhook/recovery-events.ts: handleRecoveryPaid, handleDispute; dispatch routes recovery_paid and dispute"
  - "claimForHold(bookingId, actor, extraPatch?) and settleBooking(bookingId, actor, { claimPatch? })"
affects: [88-15, 88-16, 88-17]

plan_head_before: 11719c58db58d892b3f6e616daeab8f4d95bdcf2
plan_head_after: f633b1d8bb996df5af33998648949ad57325f385
commits: 4

actuals:
  tokens: 26000
  tasks: 3
  commits: 4

key-files:
  created:
    - lib/payments/recovery.ts
    - lib/payments/alerts.ts
    - lib/stripe-webhook/recovery-events.ts
    - tests/payments-failure.test.ts
  modified:
    - lib/stripe-payment-links.ts
    - lib/payments/hold.ts
    - lib/payments/settle.ts
    - lib/payments/tick.ts
    - lib/stripe-webhook/hold-events.ts
    - lib/stripe-webhook/dispatch.ts
    - tests/payments-tick.test.ts
    - tests/payments-settle.test.ts
    - tests/webhooks-stripe-payments.test.ts

key-decisions:
  - "Recovery link tag: the plain attempt number for a hold (key link:<id>:<n>, as the plan's tracer requires) and c<n> / d<n> for the charge and the difference, so a later charge failure can never collide with the idempotency key (or the amount) of an earlier hold failure"
  - "refreshRecoveryLink creates first (idempotent per tag) and deactivates the replaced link after; when the create fails the old link is deactivated too, so a stale amount can never stay payable. A replay of the same tag returns the same link instead of deactivating it"
  - "The one automatic retry is marked used inside the claiming transition (payment_retry_count 1, payment_retry_at null) via claimForHold extraPatch / settleBooking claimPatch, so two overlapping ticks cannot retry twice and a retry that fails again leaves no further retry (holdFailurePatch and recordFailure schedule none once payment_retry_count >= 1)"
  - "A declined difference (balance_due) gets no automatic retry: balance_due is a settled state for the engine; the client pays the recovery link or the operator acts"
  - "handlePaymentFailure runs only for the writer whose transition applied (hold, settle and the payment_failed webhook backup); its ledger keys email:payment_failed:<id>:<phase>:<attempt> and alert:<kind>:<id>:<attempt> make a second call a no-op"
  - "MANAGER_EMAIL is checked before the alert's ledger claim, so an alert is not lost for good while the variable is missing; a failed Resend send keeps its claim and appends <key>:send_failed (same contract as the client emails)"
  - "Session and PaymentIntent events of one recovery payment share the ledger key recovery_paid:<PaymentIntent>, which is distinct from the captured:<mainPi> key a declined difference already holds"
  - "Active statuses of steps B and D are derived from CALENDAR_ACTIVE_STATUSES (tests/booking-status-parity.test.ts forbids a hand-written list in lib/)"

patterns-established:
  - "Failure side effects (link, client email, operator alert) hang off the applied transition, each with its own ledger key per phase and attempt"
  - "Operator alerts: plain-text English Resend email with a ledger claim before the send"

requirements-completed: [HOLD-05, PAYF-03, MAIL-01]

duration: ~60 min
completed: 2026-11-04
---

# Phase 88 Plan 14: Failure recovery, one automatic retry and operator alerts Summary

**A declined scheduled hold, fallback charge or price difference now gives the client a card_recovery Payment Link plus the localized payment_failed email and the operator a Resend alert (once per attempt), the tick retries a declined hold or charge exactly once about 12 h later and warns the operator 24 h before pickup and before a hold lapses, and a paid recovery link closes the booking through the webhook; nothing is ever cancelled automatically.**

## What was built

- **`createRecoveryPaymentLink`** (`lib/stripe-payment-links.ts`): card-only Payment Link in the booking currency and minor units, `restrictions.completed_sessions.limit = 1`, `cardMetadata('card_recovery', ...)` on both the link and `payment_intent_data` (no legacy booking-id key), idempotency key `stripeKeys.link(id, tag)`. Uses `getPaymentsStripe`; the two shipped functions are untouched (`tests/admin-bookings-payment-link.test.ts` passes unmodified).
- **`lib/payments/alerts.ts`**: `sendPaymentOperatorAlert` claims the ledger key (`alert_sent`) before sending a plain-text English email to `MANAGER_EMAIL`, subject `[Payment] <title> - <reference>`, body lines per UI-SPEC (reference, client name, pickup Prague, amount, state, reason code, admin URL, one next-action sentence). No MANAGER_EMAIL: `console.error` with the booking id, result `failed`, no throw.
- **`lib/payments/recovery.ts`**: `refreshRecoveryLink` (create, deactivate the stale link, persist `recovery_link_id` / `recovery_link_url` through a self-loop `applyTransition` with a `recovery_link_created` row; the pay-now `payment_link_*` are never touched) and `handlePaymentFailure` (link, then the `payment_failed` email in the booking locale with variant `auth_required` for `authentication_required`, then the alert `hold_failed | charge_failed | balance_unpaid`). A failed link still alerts the operator ("client was NOT emailed ... Send payment link").
- **Failure wiring**: `placeHold` (via `recordDefinitiveFailure`), `settleBooking` (`recordFailure`, `recordDifferenceFailure`) and the `payment_intent.payment_failed` webhook backup (`handleHoldFailed`) call `handlePaymentFailure` after their applied transition, wrapped so a recovery problem never throws out of the tick. Attempt = the counter after the failure, so the synchronous path and the webhook use the same keys.
- **Tick step B (D-13)**: failed `card_hold` rows with `payment_retry_count = 0` and a passed `payment_retry_at` are retried once: a new hold before the trip (`claimForHold` + `placeHold`), a new settle after it. The claim marks the retry used. Captured-through-the-link, no-retry-instant, cancelled and already-retried rows are never selected.
- **Tick step D (D-15)**: one `no_valid_hold_24h` alert (key `alert:no_valid_hold_24h:<id>`) for pickup within 24 h with `card_saved | failed | expired | placing_hold` or `checkout_pending` older than 30 min, and one `hold_expiring` alert (key per hold PaymentIntent) for an authorized, uncompleted trip whose `capture_before` is within 12 h. Nothing writes `bookings.status`.
- **Webhook**: `handleRecoveryPaid` (`checkout.session.completed` with `payment_status paid`, and `payment_intent.succeeded`, kind `card_recovery`): `failed | balance_due -> captured`, `captured_amount_minor` increased by the paid amount, `payment_intent_id` set only when NULL, link deactivated, `charged` email once, one shared ledger key `recovery_paid:<PaymentIntent>`. `handleDispute`: one alert per disputed card booking (found through the PaymentIntent or the hold PaymentIntent), no state change. Both registered in dispatch ROUTES before the legacy chain.

## Tests

- `tests/payments-failure.test.ts` (new, 16 tests): tracer (ru booking, link params, metadata, idempotency key, ledger, one filled button, operator subject and retry sentence), replay sends nothing twice, auth_required variant, link failure still alerts, MANAGER_EMAIL unset, failed Resend send keeps the claim, stale link deactivated, settle charge and difference failures, the retry that declines again ("No automatic retries are left. Use Retry or Send payment link."), no status writes in the source.
- `tests/payments-tick.test.ts`: step B (retry once with fresh key, decline-again leaves no retry, count 1 / captured / null instant / cancelled never retried, completed trips settled, overlapping ticks once) and step D (24 h alert once, state and age filters, expiring alert, MANAGER_EMAIL missing); the empty-tick answer and TICK_STEPS assertions updated.
- `tests/payments-settle.test.ts`: the three failure tests now pin the `handlePaymentFailure` call (phase, amount, attempt), the 12 h retry instant, the no-further-retry case and a throwing recovery step.
- `tests/webhooks-stripe-payments.test.ts`: recovery paid (failed and balance_due, session then PaymentIntent, PaymentIntent alone, unpaid, parked money, busy booking -> 500, unknown / partner), the payment_failed backup path with recovery and no double sends, dispute alerts.
- Full run: `npx vitest run tests/payments-failure.test.ts tests/payments-tick.test.ts tests/payments-settle.test.ts tests/payments-hold.test.ts tests/webhooks-stripe-payments.test.ts tests/webhooks-stripe.test.ts tests/webhooks-stripe-checkout-session.test.ts tests/admin-bookings-payment-link.test.ts` plus the gate and parity suites: all green. Whole suite: only the five known next-intl environment suites fail (account-trips, auth-customer, login-actions, passenger-actions, profile-actions; symlinked node_modules). eslint clean on all touched files; no new tsc error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inline status list in tick.ts failed the status-parity guard**
- **Found during:** full-suite run after Task 3
- **Issue:** `ACTIVE_STATUSES = ['confirmed', 'assigned', 'en_route', 'on_location']` is flagged by `tests/booking-status-parity.test.ts` (no hand-written status list in lib/)
- **Fix:** derived from `CALENDAR_ACTIVE_STATUSES` minus `on_board`, `completed`, `no_show`
- **Files modified:** `lib/payments/tick.ts`
- **Commit:** f633b1d8

**2. [Rule 2 - Missing critical functionality] The retry had to be marked used in the claiming transition and no further retry scheduled**
- **Found during:** Task 2 design
- **Issue:** the plan names `claimForHold (patch payment_retry_count 1)` but `claimForHold` and `settleBooking` took no patch, and `holdFailurePatch` / `recordFailure` would have scheduled a new `payment_retry_at` after the retry, contradicting "exactly one retry" and "payment_retry_at null" after a second decline
- **Fix:** optional `extraPatch` on `claimForHold`, optional `claimPatch` on `settleBooking`, retry instant only while `payment_retry_count < 1`
- **Files modified:** `lib/payments/hold.ts`, `lib/payments/settle.ts`
- **Commits:** 094065d3, 057e6f08

**3. [Rule 3 - Blocking] Existing tests asserted behaviour the plan intentionally changes**
- `tests/payments-settle.test.ts` (not in the plan's file list) asserted "no email / no Stripe call" on declined charges, and `tests/payments-tick.test.ts` asserted the old tick answer and `TICK_STEPS`. Both were updated; settle tests mock `@/lib/payments/recovery` and pin the call instead. `tests/webhooks-stripe.test.ts` and `tests/webhooks-stripe-checkout-session.test.ts` are unmodified.

### Known limitations (flagged, not fixed)

- **A recovery payment that lands on a booking that is no longer payable** (already `captured`, `released`, ...) is parked as a `recovery_paid` ledger row and logged with ids; no operator alert exists for it because the contract fixes the alert kinds. A double payment would need a manual refund; a follow-up could add a kind.
- **Unrunnable here:** 3-D Secure completion on the Stripe-hosted page and real Resend delivery are not reproducible with the dead local key; covered by the owner smoke script and the 88-17 canary (plan assumption HOLD-05).
- `step D` follows the plan literally: a `card_saved` booking inside 24 h alerts even if its `hold_at` is still ahead (only possible with a hold lead below 24 h).

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-88-42 amount from the row and one completed session, T-88-43 `card_recovery` kind with no legacy key and dispatch before the legacy chain, T-88-44 ledger keys per phase and attempt).

## Self-Check: PASSED

- Created files present: lib/payments/recovery.ts, lib/payments/alerts.ts, lib/stripe-webhook/recovery-events.ts, tests/payments-failure.test.ts.
- Commits present: 094065d3, 057e6f08, 7e4cf2ea, f633b1d8.
