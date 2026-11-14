---
phase: 92-quotes
plan: 23
subsystem: payments
tags: [quotes, stripe, remainder, payment-link, webhook, tick, security, public-api]
requires: ["92-18", "92-31", "92-16", "92-13", "92-29", "92-24"]
provides:
  - "lib/quotes/remainder.ts: createRemainderIntent, applyQuoteRemainderPaid"
  - "lib/quotes/emails/remainder-paid.ts: renderQuoteRemainderPaidEmail"
  - "POST /api/quote/remainder"
  - "dispatch route quote_remainder_paid; handleQuoteRemainderPaid in lib/stripe-webhook/quote-events.ts"
  - "tick step Q also reconciles a lost remainder event"
affects: [92-27]
tech-stack:
  added: []
  patterns:
    - "amount computed on the server (readRemainderDue); the request only echoes the displayed amount"
    - "one live remainder intent per quote: reuse / already_paying / replace; attempt counter and intent stored by compare-and-set; a stale or losing intent is cancelled with qrem_void:<pi>"
    - "exactly-once stamp: compare-and-set on quotes.remainder_paid_at; every later step keyed, so a replay finishes an interrupted run"
key-files:
  created:
    - lib/quotes/remainder.ts
    - lib/quotes/emails/remainder-paid.ts
    - app/api/quote/remainder/route.ts
    - tests/quote-remainder.test.ts
    - tests/quote-remainder-route.test.ts
  modified:
    - lib/stripe-webhook/dispatch.ts
    - lib/stripe-webhook/quote-events.ts
    - lib/payments/tick.ts
    - tests/payments-tick.test.ts
    - tests/quote-stripe-vocabulary.test.ts
    - tests/quote-webhook.test.ts
key-decisions:
  - "Payable only for a paid quote of method payment_link (not saved_card, cash, invoice); an offer-state quote is 422 not_payable, a cancelled / voided / superseded / unknown link is the one 404 invalid_link"
  - "A due amount below Stripe's minimum charge answers not_payable instead of calling Stripe (the operator settles that rest by hand)"
  - "The intent does not save the card (no setup_future_usage): D-22, the operator never charges the saved card on these quotes"
  - "A paid amount that differs from the current due is recorded as a remainder_failed event with error code amount_mismatch (no mismatch kind exists in the quote event vocabulary), nothing is stamped or refunded, one quote_remainder_mismatch alert"
  - "The receipt never fails a recorded payment: a failed send is an email_failed row and the next delivery of the event sends it"
requirements-completed: [QUOTE-04]
status: complete
commits: 3
plan_head_before: e1703b4a7a903c72afee31bbb28aa6d6919e353d
plan_head_after: b70a7d5043711c52ab835008b5a7564e82b305af
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
estimate:
  tokens: 75000
  raw_tokens: 75000
  tasks: 3
  confidence: low
completed: 2026-11-14
---

# Phase 92 Plan 23: Payment-link remainder on the quote page Summary

A client of a paid payment-link quote pays what is still owed on the quote page: the server computes the amount from the unpaid, not cancelled quote-mode trips, creates or reuses the one live `card_quote_remainder` PaymentIntent, and the succeeded event (webhook or tick) marks the quote and its trips paid exactly once and sends one receipt.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | 0c48c469 | security: pay the payment-link remainder on the quote page and record it exactly once |
| 2 | b0c6ee09 | security: remainder amount changes, ownership refund, mismatch record and the receipt email |
| 3 | b70a7d50 | security: the payment tick reconciles a remainder paid on the quote page whose webhook was lost |

## What was built

- **`createRemainderIntent`**: resolves the link (one null for every dead link), requires state `paid`, method `payment_link`, not cancelled; reads the due amount with `readRemainderDue` (92-24); `nothing_due` at 0, `not_payable` below the Stripe floor, `amount_changed` when the displayed amount differs. Then the stored intent is inspected: live with the same amount / currency / version is reused, `processing` / `succeeded` / `requires_capture` is `already_paying`, canceled or missing is replaced, a live intent of another amount is cancelled with `qrem_void:<pi>` and replaced, a failed cancel or an unknown status is `busy`. A new intent takes `attempt = remainder_attempt + 1` by compare-and-set (the loser answers `busy`), key `qrem:<id>:<attempt>`, customer = the quote customer (created if missing), `payment_method_types ['card']`, metadata from `quoteMetadata('card_quote_remainder', ...)` only; it is stored by compare-and-set against the replaced id (a losing intent is cancelled with the void key) with `remainder_amount_minor`, and a `remainder_started` event is written. Never written to a booking.
- **`POST /api/quote/remainder`**: 2 000-byte cap (declared, then bytes read), rate limit `/api/quote/remainder`, strict schema `{ token, displayedAmountMinor }` (any other key is 400), 200 `{ clientSecret, amountMinor, currency }`, 404 `invalid_link`, 409 `amount_changed | already_paying | busy`, 422 `not_payable | nothing_due`, 502 `payment_unavailable` for `stripe_error` and any throw, `no-store` everywhere, fixed log line only.
- **`applyQuoteRemainderPaid`**: ignores anything that is not a succeeded remainder with uuid metadata or an unknown quote. A recorded intent (`remainder_paid_at` set) is `replayed` and only completes an interrupted run. Not owned (another or replaced intent, a second payment after the remainder was recorded, cancelled / voided quote, wrong version) is refunded in full under `refund:quote:<id>:orphan:<pi>`, recorded as `orphan_refunded`, alerted once; a failing refund records `refund_failed`, alerts, throws (500, Stripe redelivers). Owned but the amount or currency differs from the current due is `mismatch`: `remainder_failed` event (`amount_mismatch`), alert `quote_remainder_mismatch`, nothing stamped, nothing refunded; the intent stays `succeeded` on the quote so the page answers `already_paying`. Otherwise the compare-and-set on `remainder_paid_at` (id, intent, status `paid`, not paid, not cancelled) decides; the winner stamps `paid_at` on the unpaid quote-mode trips, writes one `quote_remainder` ledger row per trip (its line remainder, key `quote_remainder:<pi>`), a `remainder_paid` event and the receipt. A loser of the compare-and-set that finds the intent recorded is `replayed`; one that finds the quote cancelled meanwhile refunds.
- **Webhook**: `card_quote_remainder` succeeded is route `quote_remainder_paid`, handled by `handleQuoteRemainderPaid` (event id as ledger actor, unusable metadata acknowledged, any throw answers 500). The legacy chain never sees it.
- **Tick**: step Q now runs a deposit half (unchanged) and a remainder half; both always run, a failed selection is thrown after both. Remainder half: status `paid`, remainder intent set, not recorded, not cancelled / voided / erased, `updated_at` between 48 h and 10 min ago, oldest first, 20 per run; a `succeeded` intent goes through `applyQuoteRemainderPaid` with the `tick_reconcile` actor, `paid` and `orphan_refunded` count in `reconciled`.
- **Receipt**: `renderQuoteRemainderPaidEmail` (shell from 92-13, `QuoteEmails.remainderPaid` from 92-29, amount through `formatMinor`), sent once per payment (`email:remainder_paid:<pi>`), idempotency key `quote-remainder-paid:<quote>:<pi>`.

## Verification

- `npx vitest run tests/quote-remainder.test.ts tests/quote-remainder-route.test.ts tests/quote-webhook.test.ts tests/payments-tick.test.ts tests/payment-state-writers-gate.test.ts`: all pass (27 tests in quote-remainder, 19 in the route test, 98 in payments-tick including 7 new step Q remainder tests).
- Wider run: every `tests/` file whose name starts with webhook, webhooks, quote, quotes, payments, payment, card-, admin-quote, plus extra-webhook, infra-stripe-webhook-events, booking-status-parity, middleware-csrf-forms: 76 files passed, 1 skipped, 1 failed to load (`tests/quote-page.test.tsx`, the known worktree artefact below). 2 914 tests passed.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (none in touched files).
- `npx eslint --quiet` on all touched source and test files: clean.
- Mutation check: removing `remainder_paid_at IS NULL` from the compare-and-set makes the "webhook and tick at the same moment" test fail; restored.
- Acceptance greps: `quoteMetadata('card_quote_remainder'` 1; `quote_remainder_paid` in dispatch.ts 3; `quoteRemainderVoid` in remainder.ts 2; `applyQuoteRemainderPaid` in tick.ts 3.
- Proofs on the doubles (no live Stripe or database): one intent for 21 000 = 8 400 + 12 600; reuse; canceled replaced with attempt 2; amount change cancels `qrem_void:<pi>` and creates 12 600; concurrent pair gives one intent; succeeded event stamps both trips, two ledger rows, `bookings.payment_intent_id` / `hold_payment_intent_id` stay null; replay and a new event id change nothing; a ledger failure answers 500 and the redelivery finishes once; webhook plus tick at once gives one paid, one replayed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two existing tests pinned the remainder as `unrouted`**
- **Found during:** Task 1
- **Issue:** `tests/quote-stripe-vocabulary.test.ts` and `tests/quote-webhook.test.ts` (neither in the plan's file list) asserted `payment_intent.succeeded` of `card_quote_remainder` is `unrouted`, which this plan changes by design (the vocabulary one was named in the task brief).
- **Fix:** both now expect `quote_remainder_paid`.
- **Commit:** 0c48c469

**2. [Rule 2] Below the Stripe minimum is `not_payable`, not a Stripe call**
- **Issue:** after a trip is cancelled the due can fall below the minimum charge; Stripe would refuse and the client would see a generic 502.
- **Fix:** `QUOTE_MIN_CHARGE_MINOR` check before any Stripe call, answered `not_payable` (the operator settles it by hand). Tested (line remainders 20 + 10, no Stripe call); the test was added after the Task 2 commit and is committed with this summary.

**3. [Rule 2] Mismatch recorded as `remainder_failed` with `amount_mismatch`**
- The quote event vocabulary (a database CHECK, migration 091) has no mismatch kind; adding one is a migration. The closest existing kind carries the code.

### Plan choices worth knowing

- Task 1 shipped without the amount-change cancel, the orphan refund, the mismatch path and the receipt (a stale live intent answered `busy`, a non-owned or mismatching payment returned `ignored`); Task 2 added them as the plan orders. Nothing was deployed in between.
- Plan text says the 409 `amount_changed` ends the request; the old intent is cancelled by the NEXT request whose displayed amount equals the new due (as Task 2's behaviour reads), never by the refused one.
- Step Q's remainder half measures its window with `quotes.updated_at`, which `createRemainderIntent` writes when it stores the intent (the quote has no "remainder started" column). A reused intent does not refresh it, so an intent first made more than 48 hours before it is paid is not reconciled by the tick (the webhook still handles it). The deposit half has the same shape with `accepted_at`.
- The orphan refund copies 92-18's `refundOrphan` into `remainder.ts` instead of exporting it from `convert.ts` (92-21 edits that file in parallel); the alert wording of `quote_orphan_refunded` in `lib/quotes/alerts.ts` speaks of "a deposit" and was not touched (not in this plan's files).
- The tick can refund inside `applyQuoteRemainderPaid` only for a payment the quote never recorded (same as the deposit half); the tick itself never cancels an intent.
- A half-finished `settle` (quote stamped, crash before the trips) is finished by Stripe's redelivery (replay path), not by the tick, because the tick selects only quotes with `remainder_paid_at` null.
- The per-plan commit ledger file was not written (compound git-dir commands are refused in this sandbox); `plan_head_before` is the worktree HEAD at start and `commits` was measured with `git rev-list --count`.

## Hand-offs

- **92-27** (page island): call `POST /api/quote/remainder` with the displayed `amountMinor`; handle 409 `amount_changed` by reloading the page state, `already_paying` / `busy` by retrying or polling `/api/quote/state`, 422 `nothing_due` / `not_payable` as "nothing to pay".
- Operator alert text for an orphan refund of a remainder says "deposit"; copy fix belongs to the owner of `lib/quotes/alerts.ts`.
- Migration 091 is not applied live (92-12): no live proof of the remainder flow yet.

## Known Stubs

None.

## Threat Flags

None beyond the register: T-92-73 (server-side amount, strict schema, 409 `amount_changed`, tested), T-92-74 (one live intent, attempt-keyed replacement, ownership refund, concurrent test), T-92-75 (mismatch stamps nothing and alerts once, tested), T-92-SC accepted (no package installed).

## Worktree artefacts

`tests/quote-page.test.tsx` fails to LOAD in this worktree (`Cannot find module .../next-intl/dist/esm/development/server.react-server.js` through the symlinked `node_modules`); it does not touch this plan's files.

## Self-Check: PASSED

- Files exist: lib/quotes/remainder.ts, lib/quotes/emails/remainder-paid.ts, app/api/quote/remainder/route.ts, tests/quote-remainder.test.ts, tests/quote-remainder-route.test.ts, lib/stripe-webhook/dispatch.ts, lib/stripe-webhook/quote-events.ts, lib/payments/tick.ts, tests/payments-tick.test.ts.
- Commits exist on the branch: 0c48c469, b0c6ee09, b70a7d50.
