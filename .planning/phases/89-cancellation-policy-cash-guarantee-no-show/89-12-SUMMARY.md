---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 12
subsystem: payments
tags: [fee-route, waive, cash-settle, reopen, refund, admin-api, security]
requires:
  - phase: 89-06
    provides: "runFeeCharge, runCashCardCharge, lockFeeAmount, markFeeWaived, loadFeeCase, closeCharged (lib/payments/fee.ts)"
  - phase: 89-08
    provides: "cancelBooking opens the late-cancel case; releaseHold accepts cash_guarantee"
  - phase: 89-09
    provides: "confirmNoShow opens the no-show case with evidence"
  - phase: 89-25
    provides: "fee_charged / fee_waived emails and the refund_failed alert"
provides:
  - "POST /api/admin/bookings/[id]/fee: strict discriminated union (charge, waive, charge_saved_card, mark_cash_settled, reopen_cash), the only place an operator amount enters"
  - "lib/payments/fee.ts: waiveFee, chargeFromCollected, collectedForCase, isMoneyCollected, FeeDecisionResult"
  - "lib/payments/cash.ts: settleCash, reopenCash, addPaymentNote, removePaymentNote, CASH_TRIP_STATUSES"
  - "lib/payments/actions.ts: PaymentAction widened with charge_fee, waive_fee, charge_saved_card, mark_cash_settled, reopen_cash; ExecutablePaymentAction; one matrix for card, cash, pay-now and partner rows"
  - "admin payment GET: fee_case and cash objects"
affects: [89-14, 89-15, 89-16, 89-17, 89-26, 89-27, 89-28]
tech-stack:
  added: []
  patterns:
    - "the amount is the only money field of the request; cap and currency come from the case row; the fee route is a deliberate, documented exception next to an amount-free actions module"
    - "decisions on money already collected refund through one deterministic key per case (refund:<bookingId>:fee:<caseId>), so a retry replays instead of refunding twice"
    - "an operator note is written before the action and removed again when the action did not happen (history never describes something that did not occur)"
key-files:
  created:
    - app/api/admin/bookings/[id]/fee/route.ts
    - lib/payments/cash.ts
    - tests/admin-fee-route.test.ts
    - tests/payments-cash.test.ts
  modified:
    - lib/payments/fee.ts
    - lib/payments/actions.ts
    - app/api/admin/bookings/[id]/payment/route.ts
    - tests/admin-payment-api.test.ts
key-decisions:
  - "Money already collected (pay-now with a payment intent, or a card row in captured / balance_due) never gets a new charge: chargeFromCollected refunds collected minus fee. The collected amount of a pay-now row is the case base (the leg amount or the booking amount); of a card row it is captured_amount_minor. A charge can not exceed what was collected"
  - "A refund that fails answers 502 refund_failed (not in the plan's answer list), leaves a refund_failed ledger row keyed refund_failed:<id>:fee:<caseId> and one operator alert, and the case stays pending. After a charge the amount lock stays, so the same click replays the same Stripe refund; another amount answers 409 amount_locked"
  - "Waive refuses with 409 payment_busy while a charge holds the amount lock on the case (markFeeWaived is also conditional on no lock)"
  - "The action matrix lives on the row: a pending case is read from bookings.fee_case_status (the trigger mirror) plus isFeeEligible; the route re-checks the case row itself. A pending case on a closed booking gives charge_fee and waive_fee and nothing else; a closed booking with no case keeps release only"
  - "Cash: charge_saved_card and mark_cash_settled are offered in card_saved and failed on confirmed, assigned, en_route, on_location, on_board and completed (CASH_TRIP_STATUSES, derived from CALENDAR_ACTIVE_STATUSES minus no_show, checked again inside the compare-and-set of settleCash). reopen_cash is offered in cash_settled whatever the status"
  - "settleCash ledger key cash_settled:<id>:<reopenings so far>, reopenCash key cash_reopened:<id>:<settlements so far>: settle, reopen, settle gives three rows with three keys. A repeat is a replay and answers ok"
  - "mark_cash_settled on a booking that is already cash_settled answers ok before the matrix (a double click is not an error)"
  - "The admin GET exposes fee_case { kind, status, currency, proposed_minor, base_minor, charged_minor, charge_in_flight, free_until, opened_at, decided_by, decided_at, reason, contact_note, evidence } and cash { unconfirmed, confirmed_by ('driver' | 'admin' | 'system' | null), confirmed_at, notes[] } (cash is null for other modes)"
requirements-completed: [CASH-03, CASH-04, HOLD-06]
status: complete
completed: 2026-11-06
commits: 3
plan_head_before: a8ea758def68907849573be3ba1f6393ee774403
plan_head_after: 1ed94a63 (code commits; this SUMMARY follows)
actuals:
  tokens: 52000
  tasks: 3
  commits: 3
---

# Phase 89 Plan 12: The operator's money decisions on the server Summary

**One strict route now takes every operator money decision of the phase: charge a fee (any amount up to the case base, cap and currency from the case row, no-show needs a 10 character contact note), waive it (hold or card released, collected money refunded, reason on the case only), charge the saved card of a cash booking at any point of the trip, mark cash paid, and reverse that with a note; the admin GET hands the panel the fee case, the cash facts and one server-side action matrix.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | strict fee route, charge through runFeeCharge with cap and note rules, action matrix | b50f7c66 |
| 2 | waive, collected-money fee, cash settle, reopen, saved-card charge | 6b9fc37b |
| 3 | admin GET fee_case and cash, matrix tests | 1ed94a63 |

Tracer verified end to end before expansion (`tests/admin-fee-route.test.ts`, real route, real `runFeeCharge`, real `settleBooking` on the payments fake and fake Stripe): a pending late-cancel case on a cancelled booking with a live 10000 hold, `POST { action: 'charge', amount_minor: 4000 }` answered `200 { outcome: 'ok' }`, one partial capture `amount_to_capture: 4000` with key `feecap:<caseId>:0`, the row `captured` with `captured_amount_minor` 4000, the case `charged` with `decided_by` the admin and the reason stored on it, an `admin_action` row `fee_charge`, and none of the operator text in the ledger.

## What was built

- **`app/api/admin/bookings/[id]/fee/route.ts`**: guard order enforceMaxBody, getAdminUser (401/403), uuid (400), JSON (400), strict schema (400), booking (404), rules (422), engine (409/502). Five `z.strictObject` variants: a currency or any extra field is a 400. Header comment names it as the deliberate exception to the no-amount rule of `lib/payments/actions.ts` (D-14). Cap = `caseRow.base_minor` (422 `amount_above_cap`); no-show without a trimmed contact note of 10+ characters is 422 `note_required` (D-13); no case, a decided case, a partner booking, a released/cash_settled booking are 422 `action_not_allowed`. Answers: `{ outcome: 'ok' | 'declined' }`, 409 `amount_locked` / `payment_busy`, 502 `refund_failed`.
- **`lib/payments/fee.ts`**: `chargeFromCollected` (lock, refund of collected minus fee with key `refund:<id>:fee:<caseId>`, leg metadata kept for a pay-now leg row, then the existing `closeCharged`; fee equal to collected refunds nothing) and `waiveFee` (audit row `fee_waive` first; a hold or saved card goes through `releaseHold`, collected money is refunded in full; `waived` ledger row `waived:fee:<caseId>`; case waived with the reason; `fee_waived` mail once with the money outcome, no operator text). Refund failure: `refund_failed` ledger row + `refund_failed` operator alert.
- **`lib/payments/cash.ts`**: `settleCash` (card_saved | failed to cash_settled through `applyTransition` only, status checked inside the compare-and-set, recovery link and failure noise cleared) and `reopenCash` (cash_settled to card_saved; note written first and removed again if the transition is not applied). The driver path of plan 89-14 calls `settleCash(booking, { type: 'system', id: 'driver_trip' })`.
- **`lib/payments/actions.ts`**: `allowedPaymentActions` is now the one matrix for card, cash, pay-now and partner rows (see decisions); `runPaymentAction` takes `ExecutablePaymentAction` and still takes no amount; the five new names are display names executed by the fee route.
- **`app/api/admin/bookings/[id]/payment/route.ts`**: GET adds `fee_case` and `cash`; POST schema untouched (still 400 for an amount and for the new names).

## Verification

- `npx vitest run tests/admin-fee-route.test.ts tests/payments-cash.test.ts tests/admin-payment-api.test.ts tests/payment-state-writers-gate.test.ts`: 73 + 30 + 135 + gate, all passing. Also green: payments-fee, payments-cancel, payments-tick, payments-hold, payments-settle, booking-status-parity (435 tests across the related files).
- Wider run (`tests/payments*`, `tests/admin*`, `tests/webhooks*`, `tests/payment*`, `tests/erasure*`, `tests/card-checkout*`, `tests/booking-status*`): 2745 passed, 1 timeout (`admin-bookings-kpi-decoupling`, 5 s limit under parallel load). A full-suite run alongside it also timed out `seo-volume-pages` and `locale-links-backstop` under load; all three pass when run alone (4, 42 and 2 tests), and none touches this plan's files.
- `npx tsc --noEmit`: nothing outside `tests/`; the 8 baseline errors in `tests/` unchanged. `npx eslint --quiet` on every touched source and test file: clean.
- `grep -c z.strictObject` on the fee route prints 5; `grep -c charge_fee lib/payments/actions.ts` prints 4.
- Mutation check: removing the cap check from the route makes the `amount_above_cap` test fail; the saved-card matrix check is covered a second time by the settle gate (cancelled, no-show, cash_settled all answer `action_not_allowed`, and the note is removed again).
- Named acceptance tests: a settled booking answers `action_not_allowed` on charge and charge_saved_card; the ledger holds `cash_settled`, `cash_reopened`, `cash_settled` in order with keys `:0`, `:1`, `:1`; a table-driven matrix over every payment state for card, cash, pay-now, partner and closed rows; the payment route still answers 400 for an amount.

## Deviations from Plan

**1. [Rule 3 - Blocking] The action matrix landed with the tracer**
The route re-checks the matrix (T-89-44) and the tracer test needs `charge_fee`, so the matrix change of Task 3 was committed in Task 1; Task 3 added the GET facts and the table tests.

**2. [Rule 2 - Missing functionality] 502 `refund_failed`**
The plan lists no answer for a failed refund of a waive or a collected-money charge. A silent 200 would hide that money did not move, so the route answers 502 `{ error: 'refund_failed' }` (the case stays pending, the ledger and the alert carry it). Plan 89-17 should print a line for it.

**3. [Rule 2 - Missing functionality] Settle clears more than the recovery link**
`settleCash` also clears `payment_failed_at`, `last_payment_error`, `payment_retry_at` and the lease, because a cash booking that failed on the card during the trip and was then paid to the driver must not keep showing a payment error (the ledger keeps the `charge_failed` rows).

**4. [Rule 2 - Missing functionality] `charge_in_flight` and a wider cash set in the GET**
`fee_case.charge_in_flight` (a pending case whose amount is locked) lets the panel show "charge in progress" and hide waive; the plan did not name it. `cash.confirmed_by` also has `'system'` for a settle by neither a driver nor an admin.

Not done by design: `driver_reported_unpaid` from UI-SPEC 5.2 (it belongs to plan 89-14, which owns the driver `cash_not_received` action; the GET can add the field when that exists).

## Notes for later plans

- **89-14 (driver):** call `settleCash(booking, { type: 'system', id: 'driver_trip' })` after its own checks; it returns `'settled' | 'replay' | 'not_allowed'`. A cancelled or no-show booking is refused inside the compare-and-set.
- **89-17 (panel):** response shapes above. Fee route answers: 200 `{ outcome }`, 400, 409 `amount_locked` / `payment_busy`, 422 `amount_above_cap` / `note_required` / `action_not_allowed`, 502 `refund_failed`. `allowed_actions` is the only source of buttons; `charge_fee` and `waive_fee` replace release while a case is pending. Amounts are integer minor units in the case currency (`fee_case.currency`).
- **Open (carried, not new):** after a refund failure the amount lock of a charge stays, and Stripe replays a definitive refund error for the same key. If the operator fixes the refund by hand in Stripe (`resolve_refund`), the case still needs closing; there is no route action for that. A later plan or a manual SQL fix should decide how (nothing is lost: the case is pending, the booking is cancelled and the ledger says what happened).
- No migration, no real Stripe call, no `.env.local` read. `REVENUE_STATUSES` and the stats SQL are unchanged (D-23): a charged fee is on record through the `captured` ledger row of a fee capture, or the `admin_action` row `fee_charge` (with the amount) of a collected-money charge.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-40 (cap from the case row, strict schema, lock), T-89-41 (getAdminUser before any work; `/api/admin` is under the CSRF prefix), T-89-42 (admin_action first with a short code, `decided_by`, reason and notes on deny-all rows), T-89-43 (notes and reasons only in the admin GET, never in the ledger or mails), T-89-44 (matrix re-checked on a fresh row, settled rows refused inside the engine as well) are mitigated and covered by tests.

## Self-Check: PASSED

- app/api/admin/bookings/[id]/fee/route.ts, lib/payments/cash.ts, tests/admin-fee-route.test.ts, tests/payments-cash.test.ts, this SUMMARY: FOUND
- commits b50f7c66, 6b9fc37b, 1ed94a63: FOUND on branch worktree-agent-ac1ada674d656954a
