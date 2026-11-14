---
phase: 92-quotes
plan: 10
subsystem: payments
tags: [quotes, money-safety, edit-hook, payment-link, pay-now, group-payment, security]
requires: ["92-01"]
provides:
  - "deposit-aware amount to charge on a price edit of a quote booking (D-20)"
  - "422 quote_amount_below_deposit from assertQuoteEditAmount (lib/payments/edit-hook.ts), called by PATCH /api/admin/bookings before the update"
  - "409 for every quote booking on POST /api/admin/bookings/[id]/payment-link"
  - "loadPayNowFacts throws quote_booking for a row with quote_id"
  - "group payment webhook leaves quote bookings out and raises ops_attention note group_payment_quote_booking"
affects: [92-11, 92-22, 92-30]
key-files:
  modified:
    - lib/payments/edit-hook.ts
    - app/api/admin/bookings/route.ts
    - "app/api/admin/bookings/[id]/payment-link/route.ts"
    - lib/payments/pay-now.ts
    - app/api/webhooks/stripe/route.ts
    - lib/payments/alerts.ts
    - tests/admin-bookings-edit-payment.test.ts
    - tests/admin-bookings-payment-link.test.ts
    - tests/payments-paynow-money.test.ts
    - tests/webhooks-stripe-group-payment.test.ts
    - tests/payments-alerts.test.ts
key-decisions:
  - "The below-deposit refusal runs in the PATCH route BEFORE the update (a helper exported from edit-hook.ts), because the hook itself only runs after the row is saved and 'nothing changes' needs a pre-write refusal"
  - "The refusal applies only to card_hold and cash_guarantee quote bookings (the modes whose amount the engine derives from the line amount); payment_mode quote bookings have no derived amount"
  - "The quote 409 in the payment-link route sits BEFORE the card_hold refusal so a card_hold quote booking gets the quote message"
  - "Group webhook reads the group rows first, partitions in code, alerts, and flips only the non-quote ids (plus an .is('quote_id', null) guard in the update); a failed first read stops the handler (fail closed)"
requirements-completed: [QUOTE-04]
status: complete
completed: 2026-11-14
estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: 425e4799c21dd6e7e394e46451db00271fc1aa55
plan_head_after: 276c7b3afff2b35ed12285377acb672d5d15811e
commits: 3
---

# Phase 92 Plan 10: Money safety for quote bookings Summary

Quote bookings can no longer be charged or refunded outside the quote: a price edit subtracts the deposit share (and is refused when nothing is left), the legacy payment-link route answers 409, the pay-now money reader refuses them, and a group payment link alerts the operator instead of confirming them.

## What was built

- **Task 1 (tracer)** - `deriveAmountMinor` in `lib/payments/edit-hook.ts` subtracts `quote_deposit_minor` when `quote_id` is set (the deposit is in the quote currency = the booking's payment currency, so EUR and CZK both work). New `assertQuoteEditAmount(current, {amount_czk, amount_eur})` returns `422 { error: 'quote_amount_below_deposit' }` when the new line amount minus the share is 0 or less; the PATCH route calls it right before the update, so nothing is written. Tracer case: 300 -> 320 EUR with a 9000 share sets the hold amount to 23000, the ledger row carries 23000.
- **Task 2** - payment-link route selects `quote_id` and answers 409 `Quote bookings are collected on the quote, not a payment link` for any quote booking, before the card_hold refusal, the resend path, any Stripe call, email or update. Tests per path (generate, resend) for modes quote, cash_guarantee, card_hold.
- **Task 3** - `loadPayNowFacts` throws `Error('quote_booking')` before any Stripe read; cancel of such a row stands and ends in the existing `money_failed` path with a `refund_failed` alert, no `refunds.create`. `handleGroupPaymentSucceeded` reads the group rows first; rows with `quote_id` are excluded from the flip and from the client/manager emails and each raises one `ops_attention` alert (`eventKey alert:ops_attention:<booking id>:group:<pi>`, note and code `group_payment_quote_booking`). A group naming only quote bookings flips nothing and sends no email.

## Commits

| Hash | Subject |
|------|---------|
| 14527169 | security(92-10): a price edit of a quote booking subtracts the deposit share (D-20) |
| 61f9b602 | security(92-10): the legacy payment-link route refuses every quote booking with 409 (B2) |
| 276c7b3a | security(92-10): pay-now reader and group payment link leave quote bookings alone (B2) |

## Verification

- Plan verification set plus `tests/payments-alerts.test.ts`: 10 files, 495 tests passed. Wider run over every touched module's test files (webhooks-stripe*, payments-cancel*, admin-fee-route, payments-fee-webhook, admin-bookings-cancel, payments-lifecycle, landing-change, admin-landing-route, payments-review-engine): all green.
- `npx tsc --noEmit`: 8 errors, all the old baseline ones in `tests/`.
- `npx eslint --quiet` on all touched source and test files: clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] PATCH route edited (plan: "no change to the route is expected")**
- The hook runs after the row is saved, so the "422 and nothing changes" behaviour needs a pre-write check. Added `assertQuoteEditAmount` in edit-hook.ts and one call in `app/api/admin/bookings/route.ts` before the update. Commit 14527169.

**2. [Rule 2 - Missing critical] `lib/payments/alerts.ts` and `tests/payments-alerts.test.ts` edited (not in files_modified)**
- An `ops_attention` alert with a note unknown to `opsAttentionAction` would read only "Open the booking in admin and check it." and tell the operator nothing. Added the `group_payment_quote_booking` text and covered it in the existing per-note test. Commit 276c7b3a.

**3. Ordering of the 409 in the payment-link route**
- The plan says "right after the card_hold refusal". Placed it BEFORE it so a card_hold quote booking gets the quote message, as the plan's behaviour list states for every payment_mode. Ordinary card_hold bookings keep their message.

**4. Scope choice on the 422**
- Applied only to `card_hold` and `cash_guarantee` quote bookings. A `payment_mode quote` booking has no amount derived from its line amount, so an edit cannot charge anything.

## Known gaps / notes for the orchestrator

- The group-payment alert replay test asserts the same event key on replay (the real once-per-key delivery is `deliverOnce`, covered by the alerts tests); `sendPaymentOperatorAlert` is mocked in the group test.
- `payments-lifecycle`, landing-change and similar callers of `reevaluateAfterEdit` are unchanged; pickup edits are unaffected (Pitfall 4).
- The panel side (hiding the payment-link section, quote chip) is 92-30.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-92-33, T-92-95, T-92-96, T-92-97 mitigated; T-92-SC accepted, no package installed).

## Self-Check: PASSED

- Commits exist: 14527169, 61f9b602, 276c7b3a.
- Greps: `quote_deposit_minor` and `quote_amount_below_deposit` in edit-hook.ts, `quote_id` x3 in the payment-link route, `quote_booking` in pay-now.ts, `group_payment_quote_booking` x2 in the webhook route.
