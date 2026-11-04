---
phase: 88-card-on-file-scheduled-holds
plan: 11
subsystem: payments
tags: [stripe, cron, qstash, off-session-hold, idempotency, webhook, card-on-file]
status: complete

requires:
  - phase: 88-01
    provides: applyTransition, appendPaymentEvent, claimDueHolds, fake payments DB
  - phase: 88-06
    provides: config constants (HOLD_CLAIM_LIMIT, LEASE_SECONDS, STALE_CHECKOUT_MS, CHECKOUT_RECONCILE_MAX_AGE_MS), retryAt
  - phase: 88-08
    provides: getPaymentsStripe, stripeKeys, cardMetadata, classifyStripeError, fake Stripe
  - phase: 88-09
    provides: applySetupSucceeded, applyHoldNowAuthorized, dispatch ROUTES, sendPaymentEmail
provides:
  - "GET/POST /api/cron/payment-tick (Vercel daily cron + QStash), maxDuration 300"
  - "lib/payments/tick.ts: runPaymentTick, TICK_STEPS (A place due holds, E reconcile stuck checkouts)"
  - "lib/payments/hold.ts: placeHold, claimForHold, cancelHoldIntent, releaseHold, holdFailurePatch, captureBeforeIso"
  - "lib/stripe-webhook/hold-events.ts: handleHoldAuthorized, handleHoldCanceled, handleHoldFailed (routes hold_authorized, pi_canceled, pi_failed)"
  - "vercel.json cron /api/cron/payment-tick at 0 3 * * *"
affects: [88-12, 88-13, 88-14, 88-15, 88-16, 88-17]

plan_head_before: fe9bf186de8afc0f757719a022be167c092c5cab
plan_head_after: 28ac43a4c9388917fc46c1526074f157b7be29c2
commits: 3

actuals:
  tokens: 19000
  tasks: 3
  commits: 3

key-files:
  created:
    - app/api/cron/payment-tick/route.ts
    - lib/payments/tick.ts
    - lib/payments/hold.ts
    - lib/stripe-webhook/hold-events.ts
    - tests/payments-tick.test.ts
    - tests/payments-hold.test.ts
  modified:
    - vercel.json
    - lib/stripe-webhook/dispatch.ts
    - tests/webhooks-stripe-payments.test.ts
    - tests/outbox-sweep.test.ts

key-decisions:
  - "Transient Stripe errors return placing_hold -> card_saved with the SAME hold_attempts so the next tick replays key hold:<id>:<n>; definitive failures advance hold_attempts inside the failing transition (fresh key next time)"
  - "The hold-failure ledger key is hold_failed:<piId|none>:<attempt>, shared by the synchronous path and the payment_failed webhook so exactly one writes"
  - "The tick's hold_authorized key (hold_authorized:<pi>) and hold_placed email key (email:hold_placed_scheduled:<id>:<attempt>) are also used by the amount_capturable_updated webhook: whichever reaches them first applies, the other is a duplicate"
  - "Our own release observation uses key hold_released_obs:<pi>, distinct from releaseHold's hold_released:<pi>, so the webhook observation can never roll back a release transition as a duplicate key"
  - "Step E finds the object to check from the booking row itself: hold_payment_intent_id (hold-now) first, else setup_intent_id; no Stripe search needed"
  - "Authorization that finds the booking no longer in placing_hold is voided (key pi_void:<pi>) instead of left as an orphan hold"

requirements-completed: [HOLD-02, PAYF-03]

duration: ~25 min
completed: 2026-11-04
---

# Phase 88 Plan 11: Scheduled hold tick, hold placement and hold lifecycle webhooks Summary

**One idempotent payment-tick endpoint (Vercel daily GET + QStash POST) that places the full-amount off-session manual-capture hold for every due card_hold booking exactly once, with attempt-numbered Stripe idempotency, a stuck-checkout reconcile step, release primitives, and webhook handlers that keep hold state truthful.**

## What was built

- **Route** `app/api/cron/payment-tick/route.ts`: GET with Bearer `CRON_SECRET` (timing-safe, fail-closed when unset), POST with QStash `Receiver.verify` over the raw body (1 KB body cap, 413 before verification), both answer 200 `{ ok, placed, failed, reconciled, errors }` once authenticated and 401 otherwise.
- **Tick** `lib/payments/tick.ts`: `TICK_STEPS = [A, E]`, each isolated (a throwing step adds its code to `errors`, the next step still runs). Step A: `claimDueHolds(20, 300)` then `placeHold` sequentially. Step E: `checkout_pending` rows between 10 minutes and 48 hours old; the hold-now PaymentIntent (`requires_capture`) or the SetupIntent (`succeeded`) is confirmed through the webhook's own `applyHoldNowAuthorized` / `applySetupSucceeded` with actor `tick_reconcile`.
- **Hold** `lib/payments/hold.ts`: `placeHold` (partner guard, pickup-passed / unknown guard, off-session manual-capture PaymentIntent for the row's current amount and currency, `authorized` + `capture_before` + `hold_placed` scheduled email), `claimForHold` (admin path), `cancelHoldIntent`, `releaseHold` (authorized cancels with `requested_by_customer`; card_saved / failed / expired / checkout_pending release without Stripe; balance_due only with waive; placing_hold / capturing busy; captured / released no-op; recovery link deactivated).
- **Webhook** `lib/stripe-webhook/hold-events.ts` registered in dispatch: capturable reconcile, expiry via `payment_intent.canceled` (`expired` / `automatic`), release observation (`requested_by_customer`), `payment_failed` backup.
- **vercel.json**: only the `payment-tick` cron (`0 3 * * *`) added; existing four untouched.

## Verification

- `npx vitest run` on payments-tick, payments-hold, webhooks-stripe-payments, webhooks-stripe, outbox-sweep, cron-reminder-2h, payment-state-writers-gate, payments-state, payments-migration-085, webhook-isolation-guard, middleware-csrf-forms: 11 files, 330 tests, all green.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`; none in the new files.
- `npx eslint --quiet` on the route, tick, hold, hold-events, dispatch and test files: clean.
- Acceptance greps: no `card_flow_mode` / `card_flow_canary_emails` / `payment_hold_lead_hours` / `getPaymentSettings` in tick.ts, hold.ts (0) or hold-events.ts; `timingSafeEqual` in the route; `assertMoneyEligible(` x2 and `requested_by_customer` x1 in hold.ts; `'expired'|'automatic'` matched on 3 lines in hold-events.ts; vercel.json has 5 crons including the tick.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] outbox-sweep wiring test asserted the exact cron list**
- **Found during:** Task 1 (verify run of `tests/outbox-sweep.test.ts`)
- **Issue:** `vercel.json keeps the three existing crons...` used `toEqual` on the full list, so adding the required payment-tick cron failed it.
- **Fix:** the expected list now includes `{ path: '/api/cron/payment-tick', schedule: '0 3 * * *' }`; the existing four entries are asserted unchanged.
- **Files modified:** tests/outbox-sweep.test.ts
- **Commit:** 098961a3

**2. [Process] Task 1 commit carries the Task 2 implementation**
- The tracer and Task 2 share `hold.ts`, `tick.ts` and the route, and the failure branches, the partner guard, `claimForHold` / `releaseHold` / `cancelHoldIntent`, the QStash POST and step E were written together with the tracer. Commit 098961a3 therefore contains that code and its tick-level tests; commit daa9fe43 adds the dedicated `tests/payments-hold.test.ts` (failures, attempts, partner guard, claim, release). No behavior is missing from either task.

**3. [Rule 2 - Correctness] Orphan authorization is voided**
- If the booking has left `placing_hold` (released / cancelled) by the time the authorization lands and the transition does not apply, `placeHold` cancels the new PaymentIntent (key `pi_void:<pi>`) and returns `skipped / state_moved`, instead of leaving an unowned hold on the client's card.

**4. [Design choice] `releaseHold` on balance_due without a waiver is a no-op**
- The plan only specifies balance_due + waive; releasing owed money for any other reason would silently forgive it, so other reasons return `noop`.

## Authentication gates

None.

## Known Stubs

None. One documented extension point: the failure branch in `recordDefinitiveFailure` (hold.ts) carries a comment where plan 88-14 adds the client recovery link and operator alert (D-13), as the plan states.

## Threat Flags

None beyond the plan's register: the new endpoint (T-88-31) is authenticated on both methods; no new trust boundary outside T-88-31..34.

## Notes for later plans

- `holdFailurePatch` and `captureBeforeIso` are exported from `lib/payments/hold.ts` for reuse (88-13 settle can share the capture_before lookup).
- ROUTES `pi_failed` currently handles `card_hold` only; 88-13 / 88-14 must extend or chain it for `card_charge` / `card_difference` failures.
- The QStash 15-minute schedule is not created by this plan (owner script); until it exists the daily Vercel cron alone runs the tick (a hold lands up to about 24 h after hold_at, well inside the 72 h default lead).

## Self-Check: PASSED

- FOUND: app/api/cron/payment-tick/route.ts, lib/payments/tick.ts, lib/payments/hold.ts, lib/stripe-webhook/hold-events.ts, tests/payments-tick.test.ts, tests/payments-hold.test.ts
- FOUND commits: 098961a3, daa9fe43, 28ac43a4
