---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 16
subsystem: admin-ui
tags: [cancel-dialog, fee-badge, cash-chip, d-20, admin, security]
requires:
  - phase: 89-03
    provides: "policyFromSnapshot, evaluateCancellation, proposedFeeMinor, tripFactsFromRow (lib/cancellation-policy.ts)"
  - phase: 89-08
    provides: "admin cancel route with cancelled_by required; answers late: true, 502 refund_failed, 500 cancelled: true"
  - phase: 89-12
    provides: "fee_case_status mirror on bookings (arrives in the admin list through admin_search_bookings b.*)"
provides:
  - "components/admin/CancelBookingDialog.tsx: who-cancelled radiogroup, local outcome line, POST with cancelled_by; exports outcomeFor, situationOf, hoursBeforePickupLabel"
  - "components/admin/FeeCaseBadge.tsx: FeeCaseBadge (red Fee decision), CashChip (neutral Cash), hasPendingFeeCase"
  - "BookingsTable: the old pendingCancel modal replaced by the dialog; badge and chip in the table row and the mobile card"
affects: [89-17, 89-18]
key-files:
  created:
    - components/admin/CancelBookingDialog.tsx
    - components/admin/FeeCaseBadge.tsx
    - tests/cancel-booking-dialog.test.tsx
  modified:
    - components/admin/BookingsTable.tsx
    - tests/BookingsTable.test.tsx
key-decisions:
  - "The dialog does its own fetch and reports through callbacks (onCancelled, onRefundFailed, onCancelledWithoutCase); BookingsTable only mirrors the result on the row. The dialog is always mounted around the shared Modal so Escape, backdrop and focus return work as for the other admin dialogs; state resets on every open"
  - "Late is previewed only where the server would open a case: a card or cash row needs a saved card or live hold (the isFeeEligible rule, mirrored from the row columns; a row without those columns counts as having one), pay-now needs a payment intent, a captured card row always counts; everything else is the status-only row even when the client is late"
  - "After the pickup time an operator cancel for the client counts as late (as cancel.ts does); an unreadable pickup instant is free (as the server)"
  - "Round-trip leg sentences moved in: the paired-booking warning is always shown for a leg, the per-leg refund line follows a choice and only on the free row"
  - "Status select: Cancelled opens the dialog for card_hold, cash_guarantee and any row with a payment intent; a row with no money keeps the PATCH path (server unchanged)"
  - "A late answer (late: true) marks the row fee_case_status pending at once so the red badge appears without a reload"
  - "CashChip lives in FeeCaseBadge.tsx (the list-badge file of this plan) so PaymentStateBadge.tsx stays untouched for plan 89-17"
requirements-completed: [HOLD-06, CASH-03]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: d763449b786eabc2fedd635f4914c15a538e4503
plan_head_after: 42a71dd3903dd20ffcfa3d121c2b677e64a9dd4f (code commits; this SUMMARY follows)
actuals:
  tokens: 36000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 16: Admin cancel dialog and the red Fee decision badge Summary

**The operator can no longer cancel a booking without saying who cancelled: no tile is preselected, the primary stays disabled until a choice, and the outcome line then states the money effect (free with release or refund, or late with the fee decision to follow) from the same pure policy function the server uses. Pending fee cases show a red "Fee decision" badge in the list, and cash bookings show a Cash chip next to their payment badge.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | CancelBookingDialog: choice, outcome line, POST with cancelled_by | c7c588c2 |
| 2 | BookingsTable wiring, FeeCaseBadge, Cash chip, test migration | 42a71dd3 |

Tracer verified before expansion (`tests/cancel-booking-dialog.test.tsx`): on open both tiles are `aria-checked=false`, the primary is disabled, focus is on the first tile; choosing "The client" on an in-time authorized card shows "Free. The hold is released and nothing is charged." with "Cancel and release hold"; the submit posts `{ id, cancelled_by }` (plus `leg` for a round-trip leg).

## What was built

- **`CancelBookingDialog.tsx`** (UI-SPEC Surface 3). Heading "Cancel booking {reference}", a Prague pickup line with "{n} h before pickup" / "pickup time passed", the required `radiogroup` (`aria-required`, roving tabindex, arrow keys select), a `role="status"` outcome box (Info or TriangleAlert icon), the Phase 66 round-trip leg sentences, a GNet notice for partner rows, error line `role="alert"`, "Keep booking" then the danger primary (label from the outcome row, "Cancelling…" with a spinner while the request runs, not dismissible while busy), and the footnote "The client and the assigned driver are emailed." Every colour is a `var(--admin-*)` / `var(--status-*)` token; amounts go through `formatMinor`; no euro sign typed.
- **Outcome table**, exactly one row: pay-now paid, card hold/saved, cash with saved card, no money (manual, unpaid, partner), card already captured; free or late (late only for "The client"; Prestigo is always free). Proposed fee = `proposedFeeMinor(base, snapshot.feePercent)`; a booking with a NULL or invalid snapshot uses `LEGACY_POLICY`.
- **Errors**: 409 `payment_busy`, 409 `status_conflict` (via `statusConflictMessage`), 401/403 session line, anything else the generic "Could not cancel the booking. Nothing was changed. Try again."; 502 `refund_failed` with `cancelled: true` closes the dialog and the row turns cancelled and the open panel refetches to show the Phase 88 banner.
- **`FeeCaseBadge.tsx`**: `FeeCaseBadge` on `BadgeShell` (danger family, "Fee decision", dot, no age), `CashChip` (neutral, "Cash"), `hasPendingFeeCase` (pending only, never a GNet booking).
- **`BookingsTable.tsx`**: pendingCancel modal (about 230 lines), `handleCancel`, `CancelRefundFailedError`, `refundFailedLine` and three state variables removed; `<CancelBookingDialog>` mounted once. Badge under the status badge and above the payment badge in the table cell and the mobile card; the two payment-badge conditions now include `cash_guarantee` (with the chip). `Booking` gained `fee_case_status`, `cancel_policy`, `pickup_utc`, `distance_km`, `amount_eur`, `payment_currency`, `payment_amount_minor`, `capture_before`, `stripe_payment_method_id`, `hold_payment_intent_id`. `admin_search_bookings` returns `to_jsonb(paged.*)` of `SELECT b.*`, so all of these arrive without a migration (confirmed in 071; no column list to stop on).

## Verification

- `npx vitest run tests/cancel-booking-dialog.test.tsx tests/admin-bookings-cancel.test.ts tests/admin-no-hardcoded-colors.test.ts tests/BookingsTable.test.tsx`: 219 passed. `tests/admin` (all), `booking-status-parity`, `payments-cancel`: 1052 passed.
- 38 new dialog and badge tests plus 9 new table wiring tests. Named acceptance: neither radio has `aria-checked=true` on open; the outcome row per payment situation; Prestigo free on a late booking; legacy NULL policy uses the legacy rule (free at 2 h, late at 30 min); each Surface 3 error shows its line; badge shows for pending only, not charged, waived, null, not GNet; Cash chip on cash rows only.
- `npx tsc --noEmit`: no error outside `tests/`, none in the touched tests. `npx eslint --quiet` on all touched files: clean. `grep -c "€"` prints 0 for both new components; `grep -c CancelBookingDialog components/admin/BookingsTable.tsx` prints 3.

## Deviations from Plan

**1. [Rule 3 - Blocking] tests/BookingsTable.test.tsx updated (not in files_modified)**
13 existing tests encoded the old modal (button labels "Confirm Cancel + Refund", "Confirm Cancel + Release Hold", the old variant sentences, "refund failed" line inside an open dialog). Migrated to the new dialog: choose "Prestigo", new button labels, 502 now closes the dialog. Two 409/PATCH tests used a fixture with a payment intent and a status select to Cancelled, which now (by plan) opens the dialog; their fixtures got `payment_intent_id: null` to keep testing the PATCH path.

**2. [Rule 2 - Missing functionality] 500 `cancelled: true`**
The plan's error list has no line for the cancel route's 500 `{ cancelled: true }` (cancel applied, late case could not be opened). Printing "Nothing was changed" would be false, so the dialog says "The booking was cancelled, but the fee decision could not be opened. Reload and check the booking.", keeps the primary disabled and turns "Keep booking" into "Close"; the row is marked cancelled.

**3. [Rule 2 - Missing functionality] GNet notice**
The old modal told the operator that a partner booking is billed by the partner and that CANCEL is pushed to GNet. Kept as a muted line in the new dialog (partner rows only; contains no "refund").

**4. [Rule 3 - Blocking] Cash chip location**
The plan lists no file for the chip; it is exported from `FeeCaseBadge.tsx` rather than touching `PaymentStateBadge.tsx`, which plan 89-17 reworks (mode-aware labels).

## Not covered here (for the orchestrator)

- The no-show route's new refusals (422 `not_on_location`, 422 `no_request`, 409 `wait_not_elapsed` with `noShowAvailableAt`) are shown by `ConfirmNoShowModal.tsx` and `NoShowBanner.tsx`, which are not in this plan's files. `ConfirmNoShowModal` still prints its generic "Could not confirm the no-show. Reload and try again." for them. Operator copy for these three belongs to a plan that owns that file (likely 89-17/89-18); flagging so it is not forgotten.
- `PaymentPanel` still mounts only for `card_hold` rows (plan 89-17 widens it to cash). The list shows the cash badge and chip now.
- A cash row's payment badge still uses the Phase 88 card labels until 89-17 adds the mode-aware label map.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-89-55 (no default for who cancelled; disabled primary; the server requires the field) is mitigated and tested; T-89-56 (preview vs result) is mitigated by the shared pure function and the server being the authority.

## Self-Check: PASSED

- components/admin/CancelBookingDialog.tsx, components/admin/FeeCaseBadge.tsx, tests/cancel-booking-dialog.test.tsx: FOUND
- commits c7c588c2, 42a71dd3: FOUND
