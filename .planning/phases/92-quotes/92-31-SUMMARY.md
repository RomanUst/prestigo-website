---
phase: 92-quotes
plan: 31
subsystem: payments
tags: [quotes, stripe-webhook, reconcile, tick, disputes, security]
requires: ["92-18", "92-16"]
provides:
  - "lib/stripe-webhook/quote-events.ts: handleQuoteDepositPaid, handleQuotePaymentFailed, handleQuotePaymentCanceled, handleQuoteDispute"
  - "dispatch routes quote_deposit_paid, quote_payment_failed, quote_payment_canceled; the dispute route also reaches the quote dispute handler"
  - "tick step Q (after E): reconcile a lost deposit event through applyQuoteDepositPaid"
affects: [92-21, 92-22, 92-23]
tech-stack:
  added: []
  patterns:
    - "quote kinds are answered in dispatch before the hold-failure fallback; the legacy chain never sees them"
    - "same conversion function for webhook and tick reconcile (Pattern 4)"
    - "every quote write keyed in the quote event ledger, so redelivery adds nothing"
key-files:
  created:
    - lib/stripe-webhook/quote-events.ts
    - tests/quote-webhook.test.ts
  modified:
    - lib/stripe-webhook/dispatch.ts
    - lib/payments/tick.ts
    - tests/payments-tick.test.ts
    - tests/quote-stripe-vocabulary.test.ts
key-decisions:
  - "The deposit event actor is { type: 'webhook', id: <stripe event id> }; the tick uses the existing tick_reconcile system actor"
  - "Step Q only reads and converts: an intent that is requires_payment_method, processing or canceled is left exactly as it is (no cancel, no refund in the tick); the orphan refund stays inside applyQuoteDepositPaid"
  - "A failed deposit or remainder records deposit_failed / remainder_failed once per PaymentIntent (key by intent id) and sends one quote_payment_failed alert per intent"
requirements-completed: [QUOTE-03, QUOTE-05]
status: complete
duration: ~1h
completed: 2026-11-14
estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low
actuals:
  tokens: 17000
  tasks: 3
  commits: 3
plan_head_before: c655ba8497d637243ef8f76bcdcc506e4c86b7ec
plan_head_after: 36dd7597
commits: 3
---

# Phase 92 Plan 31: Quote deposit webhook routing, failure handlers and tick reconcile Summary

A `payment_intent.succeeded` of kind `card_quote_deposit` is routed to `applyQuoteDepositPaid` through the real webhook route and never to the legacy chain; failures, cancellations and disputes of quote payments are recorded and alerted without touching the hold engine; the payment tick converts a paid deposit whose event was lost through the same function.

## What was built

- **Task 1 (tracer, 001afde2).** `dispatch.ts`: `PaymentRoute` gains `quote_deposit_paid`, `quote_payment_failed`, `quote_payment_canceled`; `payment_intent.succeeded` + `card_quote_deposit` -> `quote_deposit_paid`; the wrapper passes the Stripe event id as the ledger actor id. `handleQuoteDepositPaid` validates kind and uuid `quoteId` / `versionId` (unusable metadata is acknowledged 200, a retry cannot fix it) and calls `applyQuoteDepositPaid`; any throw is NOT caught, so `once()` / `dispatchPaymentEvent` answer 500 without claiming the event id and Stripe redelivers. `converted`, `replayed`, `orphan_refunded` and `ignored` all answer 200. `tests/quote-stripe-vocabulary.test.ts` had a test pinning the deposit as `unrouted` until this plan; it now pins `quote_deposit_paid` (the remainder stays `unrouted` for 92-23).
- **Task 2 (also 001afde2 for code, d66668ab for tests).** `payment_intent.payment_failed` / `canceled` of `card_quote_deposit` or `card_quote_remainder` route to the quote routes before the hold-failure fallback. `handleQuotePaymentFailed`: `deposit_failed` / `remainder_failed` event with the decline code, one `quote_payment_failed` alert per intent. `handleQuotePaymentCanceled`: `deposit_canceled` only (a remainder cancel is acknowledged without a write, 92-23's). `handleQuoteDispute`: finds the quote by `deposit_payment_intent_id` or `remainder_payment_intent_id` (through the charge when the dispute names only the charge), records `dispute_opened` and sends one `quote_dispute` alert; the `dispute` route now runs the booking handler and then this one.
- **Task 3 (36dd7597).** Tick step Q after step E: `status = accepted`, deposit intent set, not paid, cancelled, voided or erased, `accepted_at` between now minus 48 h and now minus 10 min, oldest first, 20 per run; each intent is retrieved and a `succeeded` one goes through `applyQuoteDepositPaid` with the `tick_reconcile` actor. `converted` / `orphan_refunded` count in `reconciled`. A throw adds `Q` to the errors; other quotes and steps continue.

## Verification

- `npx vitest run` on all 21 test files that name the stripe webhook or `stripe-webhook/` plus `quote-convert`, `quote-events`, `payments-tick`: 23 files, 810 tests passed (includes `payment-state-writers-gate`, `webhooks-stripe*`, `extra-webhook`, `payments-fee-webhook`, `infra-stripe-webhook-events`).
- `tests/quote-webhook.test.ts`: 18 tests (full route with fake payments DB, fake Stripe, Resend double). Mutation checks: quote kind routing in dispatch disabled -> 4 tests fail; `paid_at` filter removed from step Q -> the "never selects" test fails.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (i18n-translate-dnt, nav-auth, passenger-actions).
- `npx eslint --quiet` on the touched source and test files: clean.
- Nothing ran against live Stripe or Supabase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing test pinned the deposit as unrouted**
- **Found during:** Task 1
- **Issue:** `tests/quote-stripe-vocabulary.test.ts` (not in this plan's file list) asserted `payment_intent.succeeded` of `card_quote_deposit` is `unrouted`, which this plan changes by design.
- **Fix:** the deposit expectation is now `quote_deposit_paid`; the remainder stays `unrouted`.
- **Files modified:** tests/quote-stripe-vocabulary.test.ts
- **Commit:** 001afde2

**2. Task order.** The Task 2 handlers and routes were written together with Task 1 (one module, one dispatch edit) and committed in 001afde2; the Task 2 tests came second (d66668ab) and were verified by a mutation check instead of a red run. Behaviour per task is unchanged.

Choices beyond the plan text:

- The tick never cancels an abandoned deposit intent. The plan text only says an open intent is left untouched, and 92-16 already voids replaced intents; cancelling here would risk a card entry in progress. Not done.
- The failure alert is sent for both deposit and remainder failures (once per intent, keyed by the intent id).
- Step Q also filters `voided_at` and `anonymised_at` null (erased people are never worked by the tick, matching the other steps).
- The per-plan commit ledger file could not be written (compound git-dir commands are refused in this sandbox); `plan_head_before` is the worktree HEAD at start, `commits: 3` measured with `git log`.

## Hand-offs

- `charge.refunded` handling for refunds the site made (the orphan refund created by 92-18 leaves an `orphan_refunded:<pi>` quote event) is assigned to 92-22 and is NOT done here; `lib/stripe-webhook/charge-events.ts` is untouched. Until then the legacy refund observer sees the orphan refund and finds no booking (harmless).
- The remainder succeeded route (`card_quote_remainder`) is still `unrouted`: plan 92-23 adds it to `dispatch.ts` and `quote-events.ts`.
- After-commit emails and reminders of a converted quote are 92-21; `handleQuoteDepositPaid` only logs the outcome.
- Migration 091 is not applied live (92-12): no live proof of the conversion yet.

## Known Stubs

None.

## Threat Flags

None beyond the register: T-92-57 (explicit quote routes, legacy spies asserted not called), T-92-59 (tick step Q, same function as the webhook), T-92-60 (quote routes before the fallback, hold handler spy), T-92-99 (full-route W2 test: new event id after a late cancel with the deposit kept answers 200, creates nothing, no Stripe call), T-92-SC accepted (no package installed).

## Self-Check: PASSED

- Files exist: lib/stripe-webhook/quote-events.ts, lib/stripe-webhook/dispatch.ts, lib/payments/tick.ts, tests/quote-webhook.test.ts, tests/payments-tick.test.ts, tests/quote-stripe-vocabulary.test.ts.
- Commits exist: 001afde2, d66668ab, 36dd7597.
