---
phase: 92-quotes
plan: 22
subsystem: payments
tags: [quotes, cancel, refunds, money, stripe, security]
requires: ["92-18", "92-11", "92-13", "92-29"]
provides:
  - "lib/quotes/cancel.ts: previewQuoteCancel, readQuoteCancelPreview, cancelQuote, refundQuotePayment"
  - "lib/quotes/emails/cancelled.ts: renderQuoteCancelledEmail, renderQuoteRefundedEmail"
  - "routes GET/POST /api/admin/quotes/[id]/cancel, POST /api/admin/quotes/[id]/refund"
  - "observeQuoteRefund in lib/stripe-webhook/charge-events.ts (NOT yet called from dispatch.ts, see notes)"
affects: [92-26, 92-31]
key-files:
  created:
    - lib/quotes/cancel.ts
    - lib/quotes/emails/cancelled.ts
    - "app/api/admin/quotes/[id]/cancel/route.ts"
    - "app/api/admin/quotes/[id]/refund/route.ts"
    - tests/quote-cancel.test.ts
    - tests/admin-quote-cancel-route.test.ts
    - tests/quote-refund-observed.test.ts
    - tests/helpers/quote-cancel-fixture.ts
  modified:
    - lib/stripe-webhook/charge-events.ts
key-decisions:
  - "Order: checks -> trips cancelled one by one -> quote compare-and-set on cancelled_at -> admin_action event -> refunds -> one email. A trip that cannot be cancelled answers busy and leaves the quote alone; the next click skips trips already cancelled and finishes"
  - "Stripe key purpose is deposit:<amount> while nothing was refunded, deposit:<amount>:<refunded before> after, so two real refunds of the same amount are two keys while a retry replays"
  - "Refunded totals are raised (compare-and-set, never lowered) so a charge.refunded observation and the site's own write converge on Stripe's number"
  - "Quote status stays paid after a cancel; cancelled_at drives the derived status (effectiveQuoteStatus)"
requirements-completed: [QUOTE-03, QUOTE-04]
status: complete
duration: ~1h30
completed: 2026-11-14
estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: c655ba8497d637243ef8f76bcdcc506e4c86b7ec
plan_head_after: ee79e79312f1034fac974c01b9e330c4ec2db267
commits: 3
---

# Phase 92 Plan 22: Cancelling a paid quote and refunds Summary

The operator can cancel a paid quote as a whole under its own frozen terms (free: whole deposit back; late: stored percent of the deposit kept, rest operator-confirmed), every trip is released through the cancel engine with no fee and no per-trip email, the client gets one email in the quote language, partial refunds are bounded and keyed, and Stripe-side refunds on quote payments are observed.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | 8ec6ed6a | cancel a paid quote: one decision, trips released, deposit refunded |
| 2 | 20f3132f | late cancel, remainder refunds, operator partial refunds |
| 3 | ee79e793 | observe Stripe refunds on quote payments |

## What was built

- **previewQuoteCancel** (pure): terms from the accepted version's frozen snapshot (`termsFromSnapshot`), free-until = first pickup minus free hours, outcome by `evaluateQuoteCancel` (Prestigo always free; client free up to and including the deadline); late keeps `keptDepositMinor`; proposed refund = deposit - kept - already refunded; a paid remainder is always refunded in full. Throws on a version without deposit or without a readable pickup (money is not guessed).
- **cancelQuote**: refuses not_found / already_cancelled / not_paid / trips_started (en_route, on_location, on_board, completed, no_show) / refund_out_of_range (late needs 0..deposit-refunded, null is refused) before writing anything. Trips go through `cancelBooking({ suppressClientEmail: true })`. The quote compare-and-set (`cancelled_at IS NULL`, status paid) picks the winner of two clicks. `admin_action` and `cancelled` events, then refunds via `stripeKeys.quoteRefund`, then one email (`quote-cancelled:<id>` idempotency key).
- **Failures**: a failed refund keeps the cancel, writes `refund_failed`, sends one `quote_refund_failed` operator alert, answers `refundFailed: true` and the client email promises no money. If the `admin_action` row cannot be written no refund is attempted (same alert, code `audit_write_failed`).
- **refundQuotePayment** (D-12): deposit or remainder, any time on a paid quote (also a cancelled one, which is how a failed cancel refund is retried), bounded by paid minus refunded, audit row before Stripe, refund email; Stripe refusal is `refund_failed` (route 502).
- **Routes**: GET cancel (preview, `?initiator=`, no-store), POST cancel, POST refund; guard order enforceMaxBody -> admin -> uuid -> capped JSON -> strict schema. Errors are `{ error: <code> }` with 422 (refusals), 409 busy, 502 refund_failed, 404.
- **Emails**: cancelled (client / Prestigo intro, refund sentence only if money returns, kept sentence only if part of the deposit stays, "nothing else is charged") and refunded, through the shared shell, `QuoteEmails` copy, all 8 locales, pre-formatted amounts.
- **observeQuoteRefund**: charge.refunded on a quote deposit / remainder intent -> `refund_observed:<charge>:<amount_refunded>` event and the stored total raised when larger. Counts only a payment the quote recorded as paid and skips a payment with an `orphan_refunded:<pi>` event (92-18), so own refunds are not double-counted. Bookings untouched.

## Tests

- `tests/quote-cancel.test.ts` (35): tracer (Russian email, key, event order, one Resend call, no per-trip email), Prestigo after deadline, boundary of the free window, all refusals, D-11 (fee 100 / 50, operator confirms, out of range, partial refund already stored, remainder refunded in full free and late), D-12 (one trip does not move the deposit, partial refunds, same-amount second refund is a new key, replay of one click moves no money twice, bounds, remainder, not_paid), busy trip then retry, two concurrent clicks, refund failure + alert + manual retry.
- `tests/admin-quote-cancel-route.test.ts` (24): guards 401/403/400/413/404/422, strict bodies, GET preview, late cancel, trips_started, refund route 200/422/502.
- `tests/quote-refund-observed.test.ts` (10).
- Mutation check: `suppressClientEmail: false` fails the tracer.
- Green with them: payments-cancel, admin-bookings-cancel, quote-convert, admin-quotes-lifecycle, quote-emails, quote-copy-i18n, payments-fee, webhooks-stripe, webhooks-stripe-payments, payments-fee-webhook, extra-webhook, quote-stripe-vocabulary, payment-state-writers-gate (13 + 4 files, 767 tests).
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`. `npx eslint --quiet` on all touched files: clean.

## Deviations from Plan

**1. [Rule 1 - Bug] Idempotency key collision on same-amount partial refunds.** The plan keys a refund `deposit:<amount>`; two legitimate partial refunds of the same amount within Stripe's key lifetime would be the second one silently replayed (no money moved, but recorded as refunded). The purpose is `deposit:<amount>` while nothing was refunded (exactly the plan's key) and `deposit:<amount>:<refunded before>` afterwards. A retry of one refund (same total before) still replays.

**2. observeQuoteRefund is exported from `charge-events.ts` but not called.** The plan describes "in observeRefund add a lookup", but `observeRefund` lives in `lib/stripe-webhook/dispatch.ts`, which this plan must not edit (92-31 owns it). Orchestrator action below.

**3. Extra test fixture** `tests/helpers/quote-cancel-fixture.ts` (not in the plan's file list), shared by the three test files.

**4. Task split.** `cancel.ts` was written in one pass, so Task 1's commit already contains `refundQuotePayment` and the late path; Task 2's commit adds the refund route and the extended tests. Tests were written alongside the code (no separate RED run); the mutation check stands in.

**5. Responses use `{ error: <code> }`** (not `action_not_allowed` + reason as in the 92-13 void route): 422 not_paid / already_cancelled / trips_started / refund_out_of_range / out_of_range, 409 busy, 502 refund_failed. 92-26 reads these codes.

## Notes and limits

- A quote cancel with trips whose cancel engine result was busy/conflict answers 409 busy with some trips already cancelled; a second click finishes (already-cancelled trips are skipped).
- Only Stripe-collected money is refunded. A remainder paid by cash or marked paid on an invoice has no PaymentIntent and is not refunded here.
- The email's refund amount is the sum actually refunded in this cancel; it is not shown when the refund failed.
- The Stripe refund call carries no metadata (as the orphan refund of 92-18).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-92-69 (bounds, admin guard, admin_action before Stripe, amount in key), T-92-70 (trips through the forced-free engine path, only the deposit at stake; no PaymentIntent is created on a cancel, tested), T-92-71 (cancel stands, refund_failed + one alert), T-92-72 (one Resend call to the client, tested).

## Self-Check: PASSED

Files exist: lib/quotes/cancel.ts, lib/quotes/emails/cancelled.ts, both routes, three tests, the fixture. Commits 8ec6ed6a, 20f3132f, ee79e793 on the branch. `grep -c "suppressClientEmail: true" lib/quotes/cancel.ts` = 1; `grep -c "quoteRefund(" lib/quotes/cancel.ts` = 1; `deposit_payment_intent_id` in charge-events.ts >= 1 (via the column loop: `intentColumn` names are listed); out_of_range in the refund route = 1.
