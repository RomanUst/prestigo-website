---
phase: 88-card-on-file-scheduled-holds
plan: 13
subsystem: payments
tags: [stripe, capture, off-session-charge, idempotency, tick, webhook, card-on-file]
status: complete

requires:
  - phase: 88-01
    provides: applyTransition, appendPaymentEvent, fake payments DB
  - phase: 88-08
    provides: stripeKeys.capture / charge / difference, cardMetadata, classifyStripeError, stripeErrorCode, fake Stripe
  - phase: 88-09
    provides: sendPaymentEmail (charged), dispatch ROUTES
  - phase: 88-11
    provides: tick TICK_STEPS, hold primitives, hold-events handlers
provides:
  - "lib/payments/settle.ts: settleBooking(bookingId, actor) -> { outcome: captured | balance_due | failed | transient | busy | noop | skipped, code?, capturedMinor?, diffMinor? }"
  - "lib/booking-events.ts: async emitBookingCompleted awaiting settleBooking (the single completion consumer)"
  - "lib/payments/tick.ts: step C (completion sweep), TICK_STEPS = [A, C, E], tick answer gains `captured`"
  - "lib/stripe-webhook/charge-events.ts: handleCardChargeSucceeded, handleCardChargeFailed (observation rows)"
  - "dispatch ROUTES: charge_succeeded registered; pi_failed chains card_hold vs card_charge / card_difference"
affects: [88-14, 88-15, 88-16, 88-17]

plan_head_before: a8b8a8ba5f6f1de9ee173b3ad3a438208f5677bb
plan_head_after: f0933ca146767185a458daa8d6b194f5053cf453
commits: 3

actuals:
  tokens: 18400
  tasks: 3
  commits: 3

key-files:
  created:
    - lib/payments/settle.ts
    - lib/stripe-webhook/charge-events.ts
    - tests/payments-settle.test.ts
  modified:
    - lib/booking-events.ts
    - lib/payments/tick.ts
    - lib/stripe-webhook/dispatch.ts
    - tests/booking-status-service.test.ts
    - tests/payments-tick.test.ts
    - tests/webhooks-stripe-payments.test.ts

key-decisions:
  - "capture_started ledger key is capture_started:<attempt>:<epoch ms>, unique per claim (a re-claim after a lease expiry is a new row); the attempt number is parsed from the key prefix to find the first claim of an attempt for the >20 h search rule"
  - "A transient error (connection / 5xx / rate limit, a PaymentIntent still processing, a failed search) returns outcome transient and leaves the row in capturing with its lease and an unchanged charge_attempts; every definitive failure advances charge_attempts inside the transition that records it"
  - "Difference declined after a successful main capture: a captured:<pi> ledger row is appended first (the money did move), then capturing -> balance_due with payment_intent_id = main PI and captured_amount_minor = held part"
  - "A settled/terminal state (captured, released, balance_due) is a noop for every entry point; balance_due is owned by the recovery plan (88-14)"
  - "The tick answer gains a `captured` count next to placed / failed / reconciled"

patterns-established:
  - "One settle function, three entry points (completion event, tick step C, admin action); the CAS claim into capturing is the only gate to Stripe"
  - "Webhook handlers for settled money are observation-only, with keys distinct from the settle transition keys"

requirements-completed: [HOLD-04, PAYF-03, MAIL-01]

duration: ~45 min
completed: 2026-11-04
---

# Phase 88 Plan 13: Capture on completion, fallback and difference charges Summary

**settleBooking captures the held amount when a trip is completed (single Phase 87 completion event, durable tick sweep behind it), charges the saved card off-session when the hold is gone, charges a raised price as a separate difference, and never collects twice: CAS claim into capturing, attempt-numbered cap:/chg:/diff: keys, ledger event keys, search-before-create after 20 h.**

## What was built

- **`lib/payments/settle.ts`** (`settleBooking`):
  1. loads the row; `assertMoneyEligible` (partner -> skipped), `payment_mode === 'card_hold'`, completed (status `completed`, or `completed_at` set on a non-cancelled / non-no-show row) else `skipped`;
  2. terminal states (`captured`, `released`, `balance_due`) -> `noop`; otherwise a CAS `authorized | expired | card_saved | failed | capturing -> capturing` with a 300 s lease (a live lease or a lost race -> `busy`);
  3. hold `requires_capture` -> `capture(amount_to_capture = min(due, amount_capturable))`, key `cap:<id>:<charge_attempts>`; hold already `succeeded` -> reconcile with `amount_received` (a lost response never captures twice); hold canceled, missing (`resource_missing`) or never authorized, or no hold at all -> off-session `card_charge` of the full amount, key `chg:<id>:<n>`;
  4. `due - captured > 0` -> separate off-session `card_difference` charge, key `diff:<id>:<n>`; due below the hold -> the capture is limited to due and Stripe releases the rest;
  5. success -> `capturing -> captured` with `payment_intent_id` (first write of D-05: the captured / charged PaymentIntent), `captured_amount_minor` (total), `captured_at`, lease cleared, ledger `captured:<pi>` (+ `difference_charged:<pi>`), then the `charged` email once (`email:charged:<id>`, with the difference line when one was charged); a mail error never undoes the money;
  6. failures: transient -> stays `capturing` with the lease (the sweep replays the same key); definitive decline of the main amount -> `failed` with `charge_attempts + 1`, `last_payment_error`, `payment_failed_at`, `charge_failed` row; definitive decline of the difference -> `balance_due` with the main PI, the held amount, `charge_attempts + 1`, `difference_failed` row, no email;
  7. attempts whose first `capture_started` is older than `LEASE_SEARCH_AFTER_MS` (20 h) run `paymentIntents.search` (booking id, attempt, kind) before any create and reuse a found succeeded PaymentIntent; a failed search is transient (never create blind).
- **`lib/booking-events.ts`**: `emitBookingCompleted` is now `async`; keeps the ids-only log, returns early for partner, awaits `settleBooking(id, { system, completion_event })` in try/catch (error log carries the booking id only), resolves with the event. `lib/booking-status-service.ts` is unchanged (`after()` accepts the promise).
- **`lib/payments/tick.ts`**: step C between A and E. Selects `payment_mode = card_hold`, `completed_at IS NOT NULL`, status not cancelled / no_show, state in authorized / expired / card_saved, plus `capturing` rows with an expired lease; oldest completion first, at most `HOLD_CLAIM_LIMIT` per run, actor `tick_sweep`; failed rows are not selected; a per-row problem adds `C` and the loop continues. Answer gains `captured`.
- **`lib/stripe-webhook/charge-events.ts`** + dispatch: `payment_intent.succeeded` for `card_hold | card_hold_now | card_charge | card_difference` appends one `charge_succeeded:<pi>` row (amount received), no state change, never the legacy chain; `payment_intent.payment_failed` for `card_charge | card_difference` appends one observation row (`charge_failed_obs:<pi>` / `difference_failed_obs:<pi>`); `pi_failed` now chains hold vs charge failures (hold behaviour unchanged).

## Verification

- `npx vitest run` on payments-settle, booking-status-service, admin-bookings, payments-tick, webhooks-stripe-payments, webhooks-stripe, payment-state-writers-gate, payments-state, outbox-sweep, payments-hold, webhook-isolation-guard: 11 files, 448 tests, all green.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`; none in the files of this plan.
- `npx eslint --quiet` on settle, booking-events, tick, charge-events, dispatch and the extended tests: clean.
- Acceptance greps: `export async function emitBookingCompleted` 1, `settleBooking(` in booking-events 1; `settleBooking(` in app/lib only in booking-events.ts, settle.ts (and tick.ts from Task 3, as the plan's step C requires); `stripeKeys.difference(` 1, `stripeKeys.charge(` 1, `eurToCzk|czkToEur` 0 in settle.ts; `completed_at` in tick.ts present.
- Every behavior line of the three tasks has a passing test; the over-collection invariant (`collectedTotal() <= payment_amount_minor`) is asserted in the Stripe-facing scenarios.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] pi_failed chains charge / difference failures**
- **Found during:** orchestrator hand-off note from 88-11 (`pi_failed` handled `card_hold` only).
- **Fix:** `handleCardChargeFailed` (observation only, keys distinct from settle's) and a small `handlePaymentFailed` router in dispatch; the card_hold backup is untouched. State stays owned by settleBooking; the recovery link, client email and operator alert for these failures are plan 88-14.
- **Files modified:** lib/stripe-webhook/charge-events.ts, lib/stripe-webhook/dispatch.ts, tests/webhooks-stripe-payments.test.ts

**2. [Design choice] Tick answer gains `captured`**
- Step C reports `captured` and `failed`; the response shape of the cron endpoint is `{ ok, placed, captured, failed, reconciled, errors }`. The one test that pinned the exact shape (`tests/payments-tick.test.ts` "with nothing due") was updated.

**3. [Design choice] Terminal states are `noop`, not `busy`**
- The plan says "captured -> noop; otherwise busy". `released` and `balance_due` are also terminal for settle (nothing to collect / owned by recovery), so they return `noop` rather than `busy`, which keeps the admin mapping (busy -> 409) meaningful.

**4. [Test environment] Distinct capture_started key per claim**
- The ledger key includes the epoch millisecond of the claim. In unit tests the virtual DB clock jumps while the real clock does not, so a re-claim in the same millisecond collided; the lease-crossing helper in the tests waits a few real milliseconds. Production re-claims are at least one lease (300 s) apart.

No auth gates. No new dependencies.

## Known Stubs

None. Documented extension points (plan 88-14): the failure branches in settle.ts (`recordFailure`, `recordDifferenceFailure`) carry a comment where the recovery payment link, client email and operator alert attach.

## Threat Flags

None beyond the plan's register (T-88-38 double capture / charge, T-88-39 over-collection, T-88-40 premature or partner charge, T-88-41 repudiation all mitigated as planned). No new endpoint or trust boundary: the completion consumer, the existing cron route and the existing webhook route are the only entry points.

## Notes for later plans

- 88-14: attach the recovery link / client email / operator alert to the `failed` (declined fallback) and `balance_due` (declined difference) branches of settle.ts; step B's single retry for failed completed bookings calls `settleBooking`; `balance_due -> captured` by the recovery payment needs its own ledger key (settle already owns `captured:<mainPi>` for the main capture of a difference failure).
- 88-15: admin capture calls `settleBooking(id, { type: 'admin', id })`; outcomes map captured -> ok, failed / balance_due -> declined, busy / transient -> 409; settle refuses a booking that is not completed (`skipped / not_completed`).
- Production behaviour: `emitBookingCompleted` now does one bookings read for every non-partner completion (pay-now bookings return `skipped / not_card_hold` right after it); no money moves for them.

## Self-Check: PASSED

- Files present: lib/payments/settle.ts, lib/stripe-webhook/charge-events.ts, tests/payments-settle.test.ts.
- Commits present: 9dd58388, 512d06fe, f0933ca1.
