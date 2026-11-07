---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 17
subsystem: admin-ui
tags: [payment-panel, fee-decision, cash-guarantee, admin, modals]
requires:
  - phase: 89-12
    provides: "POST /api/admin/bookings/[id]/fee (charge, waive, charge_saved_card, mark_cash_settled, reopen_cash); admin GET fee_case, cash, allowed_actions"
provides:
  - "FeeDecisionBanner, FeeChargeModal, FeeWaiveModal, CashCardChargeModal, MarkCashModal, ReopenCashModal"
  - "PaymentStateBadge with mode and completed (cash vocabulary) and CashChip"
  - "PaymentPanel: Fee sub-block, cash facts and banners, ledger labels, buttons from allowed_actions"
  - "paymentShared.ts (types, string-based amount parser, copy, styles) and paymentParts.tsx (AlertBanner, DecisionButtons, useDecisionRequest, NoteField)"
affects: [89-14, 89-16, 89-26, 89-27, 89-28]
tech-stack:
  added: []
  patterns:
    - "decimal text becomes integer minor units by string handling only (regex, padEnd, no float); more decimals than the currency allows is refused, never rounded"
    - "one useDecisionRequest hook per dialog: in-flight ref blocks a second click, the dialog can not be dismissed while it runs, a reopened dialog starts clean"
    - "dialogs never import the panel (shared files), so there is no import cycle"
key-files:
  created:
    - components/admin/FeeDecisionBanner.tsx
    - components/admin/FeeChargeModal.tsx
    - components/admin/FeeWaiveModal.tsx
    - components/admin/CashCardChargeModal.tsx
    - components/admin/MarkCashModal.tsx
    - components/admin/ReopenCashModal.tsx
    - components/admin/paymentShared.ts
    - components/admin/paymentParts.tsx
    - tests/admin-fee-panel.test.tsx
    - tests/admin-cash-panel.test.tsx
  modified:
    - components/admin/PaymentPanel.tsx
    - components/admin/PaymentStateBadge.tsx
key-decisions:
  - "Money text is never typed: every amount, percent and hour in the banner and dialogs is computed from the case row and the payment facts (formatMinor); the source has no euro sign"
  - "The panel renders for card_hold and cash_guarantee, and for any other mode (pay-now) only when the GET carries a fee_case; a pay-now panel shows no payment state badge"
  - "The fee banner sits inside PaymentPanel above the other banners (plan text), not in the booking detail above the panel (UI-SPEC text): same visual order, one place to wire"
  - "Waive is hidden while fee_case.charge_in_flight (the server would answer payment_busy); charge stays so the same click replays the same amount"
  - "502 refund_failed: both dialogs stay open, refetch, and say what the operator does next (retry the same amount, or refund in the Stripe Dashboard; a different amount is refused while the lock stays; the alert was emailed)"
  - "driver_reported_unpaid is not built: the amber banner row of UI-SPEC 5.2 is absent; unconfirmed cash is an info banner and an info badge, no alert role, no danger token, no count, no filter (D-21)"
requirements-completed: [CASH-03, CASH-04]
status: complete
completed: 2026-11-06
commits: 3
plan_head_before: d763449b786eabc2fedd635f4914c15a538e4503
plan_head_after: 61c4e491f2aa3c61a71b26901ce45a506ac515b8 (code commits; this SUMMARY follows)
actuals:
  tokens: 62000
  tasks: 3
  commits: 3
---

# Phase 89 Plan 17: The operator's money decisions in the booking panel Summary

**An operator can now see a pending late-cancel or no-show case in the booking, charge any amount up to the cap from a dialog that parses the typed text into integer minor units and shows a live percent readout, waive it with a reason, and handle a cash booking (charge the saved card during or after the trip, mark it paid in cash, reopen it as unpaid) from one dialog each; every button comes from the server's `allowed_actions`.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | pending case in the panel through FeeChargeModal to the POST and the refetched state | fc6848a5 |
| 2 | waive dialog and ledger labels | 0f9f1385 |
| 3 | cash vocabulary, banners and the three cash dialogs | 61c4e491 |

Tracer verified end to end before expansion (`tests/admin-fee-panel.test.tsx`, real `PaymentPanel` and `FeeChargeModal` on a stubbed fetch): a pending late-cancel case shows the banner and the Fee block, "Charge fee…" opens the dialog prefilled with the proposal and focus on the amount, typing "40.10" turns the primary into "Charge {amount}", the click POSTs `{ action: 'charge', amount_minor: 4010, reason }` to `/api/admin/bookings/b-1/fee`, the dialog closes, the payment GET is fetched again and the result line reads "Done. {amount} was charged and the client was emailed."

## What was built

- **`paymentShared.ts`**: types of `fee_case` and `cash`, `parseAmountToMinor` (regex plus `padEnd`, no float: "10.10" is 1010, "10.101" is refused as `decimals`, comma accepted, zero and non-decimal text refused), `minorToInput`, `percentOf`, `feeCollection` (hold, paid, saved card; mirrors `collectedForCase` for display only), the fee route request helper, the shared copy table and `commonFeeError`.
- **`paymentParts.tsx`**: `AlertBanner` (moved from the panel, gains `info` and `ok` families with the `Info` icon), `DecisionButtons` (accent or danger primary, "Working…", disabled while invalid), `useDecisionRequest`, `NoteField`.
- **`FeeDecisionBanner`**: late-cancel and no-show text from the case row and the evidence, plus the hold / no hold / money-paid sentence. A decided case renders nothing.
- **`FeeChargeModal`**: prefilled amount, focus on the amount, readout and helper, contact note (no-show only, 10 to 1000, counter above 900), optional reason, response table of UI-SPEC 4.3 (ok, declined, 409 `amount_locked` / `payment_busy`, 422 `amount_above_cap` / `note_required` / `action_not_allowed`, 401/403, 5xx) plus the new 502 `refund_failed` line.
- **`FeeWaiveModal`**: required reason 1 to 500 with three suggestion buttons, body names the money effect, danger primary.
- **Cash dialogs**: `CashCardChargeModal` (fixed amount, required note, impact line and declined line depend on the trip being completed), `MarkCashModal` (focus on "Not yet"), `ReopenCashModal` (accent primary, required note).
- **`PaymentStateBadge`**: `mode` and `completed` props, cash labels of UI-SPEC 5.1 (Cash on trip neutral, Cash unconfirmed info), `CashChip`.
- **`PaymentPanel`**: Fee sub-block (facts, evidence list on no-show only, charge-in-flight line), cash facts (Cash to collect, Cash confirmed with the confirmer and Prague time, admin-only notes), no hold facts for cash, cash banners, "Release saved card" label and copy for cash, `EVENT_LABELS` for `fee_opened`, `cash_settled`, `cash_reopened`, `waived` reads "Fee waived" next to a case. The operator reason and notes appear in the facts and never in the history list.

## Verification

- `npx vitest run tests/admin-cash-panel.test.tsx tests/admin-fee-panel.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/PaymentPanel.test.tsx tests/BookingsTable.test.tsx`: 236 passed (65 + 37 in the two new files; the 134 existing panel and table tests unchanged). `tests/admin-payment-api.test.ts` and `tests/payments-engine-gates.test.ts`: 170 passed.
- `npx tsc --noEmit`: nothing outside `tests/`; no error in the new test files.
- `npx eslint --quiet` on all 12 touched components and both new tests: exit 0.
- `grep -c "€"` on `FeeChargeModal.tsx` prints 0 (and a test checks all new components).
- Acceptance tests: "10.10" becomes 1010 and "10.101" is refused; the waive request can not be sent with an empty or blank reason; unconfirmed cash renders no `--status-danger` / `--admin-danger` token and no `alert` role in the panel.

## Deviations from Plan

**1. [Rule 3 - Structure] Two shared files instead of importing the panel**
The five dialogs need the panel's types, formatters and styles, and the panel imports the dialogs. `paymentShared.ts` and `paymentParts.tsx` (not in the plan's file list) hold the shared parts so no cycle exists. `PaymentPanel` re-exports `formatPragueFull` and the types, so `BookingsTable` is untouched.

**2. [Rule 2 - Missing functionality] 502 `refund_failed` copy (as asked by 89-12)**
Both dialogs print a clear line and what to do next. The charge line explains that the amount stays locked.

**3. [Rule 2 - Missing functionality] Waive hidden during a charge in flight; pay-now rows with a case**
`fee_case.charge_in_flight` hides "Waive fee…" (the server would refuse with `payment_busy`) and shows a status line. A pay-now booking with a fee case gets the panel (it needs the buttons); without a case it stays silent as before.

**4. [Scope] Not done**
- The "Cash" chip is in the panel header only. The list row of `BookingsTable` (UI-SPEC 5.1 also names the list) is not in this plan's file list and is left for the plan that owns the list badges (the `FeeCaseBadge` of 4.1 as well).
- `driver_reported_unpaid` (UI-SPEC 5.2 amber row) is not built, by instruction.

**5. [Process] Tests written with the code**
Each task's tests were committed together with its implementation, not as a separate RED commit.

## Notes for later plans

- After a failed refund the case stays pending and the amount lock stays; the panel tells the operator to retry the same amount or refund in Stripe. If the operator refunds by hand, nothing in the UI closes the case yet (carried open item of 89-12).
- `Cash to collect` is also shown in `failed` for a cash booking (the banner says the driver takes that amount), a small widening of UI-SPEC 5.2, which names only `card_saved`.
- The fee banner is inside `PaymentPanel`. A plan that wants it above the panel (UI-SPEC wording) can lift `FeeDecisionBanner` out; it only needs `payment` and `fee_case`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-57 (mistyped amount): string parser, live percent readout, UI cap, server cap. T-89-58 (button the state does not allow): buttons rendered only from `allowed_actions`, the server re-checks. Operator text (reason, contact note, cash notes) is shown only in the admin panel facts, never in the history list (tested).

## Self-Check: PASSED

- components/admin/FeeDecisionBanner.tsx, FeeChargeModal.tsx, FeeWaiveModal.tsx, CashCardChargeModal.tsx, MarkCashModal.tsx, ReopenCashModal.tsx, paymentShared.ts, paymentParts.tsx, tests/admin-fee-panel.test.tsx, tests/admin-cash-panel.test.tsx, this SUMMARY: FOUND
- commits fc6848a5, 0f9f1385, 61c4e491: FOUND on branch worktree-agent-a0e264905c9988923
