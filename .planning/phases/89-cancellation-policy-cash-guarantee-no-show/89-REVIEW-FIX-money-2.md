---
phase: 89-cancellation-policy-cash-guarantee-no-show
fixed_at: 2026-11-07T09:51:33Z
review_path: .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-REVIEW-money-2.md
iteration: 2
findings_in_scope: 8
fixed: 8
skipped: 0
owner_decision_recorded: WR-08
status: all_fixed
---

# Phase 89: Money Review Fix Report, Second Pass

**Fixed at:** 2026-11-07
**Source review:** `89-REVIEW-money-2.md` (CR-01, CR-02, WR-01 to WR-04, IN-01, IN-02) and WR-08 of `89-REVIEW-money.md`
**Base:** 2a67f399. **Iteration:** 2

**Summary:**

- In scope: 8 findings. All 8 were reproduced by a regression test that fails on the parent commit's source, then fixed.
- Also done: WR-08 per the owner's decision, and the coordinator's request to limit legs to `round_trip` rows.
- No migration was needed. 087 and 088 are unchanged. No `ORCHESTRATOR_MCP_REQUIRED`.

## Outcomes

| Finding | Outcome | Commit |
|---|---|---|
| CR-01 late cash charge adopted with no alert | fixed | ffc88413 |
| CR-02 succeeded event consumed during `capturing` | fixed | d6899da2 |
| WR-01 late charge on `released`, or after `settleCash` wins | fixed | 3d39ab5b |
| WR-02 cancel of an `unpaid` row whose PaymentIntent was paid (live) | fixed | 8b524ef1 |
| WR-03 untagged round-trip refund counted against both legs (live) | fixed | 6c314efd |
| WR-04 charge after `reopen_cash` replays a refunded payment | fixed | 58529ec2 |
| IN-01 false case-missing alert and dead button on pay-now no-shows | fixed | 966dff7d |
| IN-02 `open_case` does not re-check the matrix | fixed | 8b08ed36 |
| WR-08 erasure and open debts | owner decision applied: debt written off, tick filters | e8a40b41 |
| Coordinator: legs only on `round_trip` rows | done | a6b99963, df50824b (fixtures) |

## Fixed Issues

### CR-01: every late cash card charge alerts the operator

**Files modified:** `lib/payments/fee.ts`, `lib/stripe-webhook/charge-events.ts`, `lib/driver-trip-step.ts`, `lib/payments/tick.ts`,
`lib/payments/settle.ts`, `lib/payments/alerts.ts`, `app/api/webhooks/stripe/route.ts`, `components/admin/CashCardChargeModal.tsx`
**Commit:** ffc88413

- New `announceLateCashCharge`: the card receipt, and one `duplicate_payment` alert (code `cash_card`, note `adopted`) per
  PaymentIntent under `alert:cash_card_late:<id>:<pi>`. The alert says the charge went through after the panel stopped waiting,
  asks the operator to check with the driver, and says that a Dashboard refund does not cancel the trip.
- All three adopters use it: the webhook, the driver's tap that finds the charge succeeded (before, no alert and no receipt), and
  the tick reconcile (before, a receipt only). They share the event key, so the operator gets one alert whoever finds the charge.
- `reconcileCashCharge` returns the PaymentIntent, amount and currency with `captured`.
- `charge.refunded` no longer cancels a card-flow booking (`card_hold` or `cash_guarantee`). A Dashboard refund of a cash row's
  card charge keeps the live trip, and the card observer still writes `refund_observed`. The finished-trip warning still logs first.
- The cash card charge dialog has its own line for a 409 `payment_busy`: "Not confirmed. Do not take cash until the panel shows
  the outcome, or take cash and watch for an alert that the card went through after all (then refund the card)."

### CR-02: a cash charge seen during `capturing` is never consumed

**Files modified:** `lib/stripe-webhook/charge-events.ts`, `lib/payments/settle.ts`
**Commit:** d6899da2

Both halves of the review's fix were applied:

- `handleCardChargeSucceeded` writes its `charge_succeeded` observation, then throws for a cash row still in `capturing`
  (`adoptLateCashCharge` answers `busy`). The webhook answers 500, the event is not claimed, and Stripe delivers it again. This is
  the same as `BUSY_STATES` in the recovery handler.
- `reconcileCashCharge` reads the ledger before it frees a row. A `charge_succeeded` observed since the row's latest
  `capture_started` is recorded as the payment, with no Stripe read needed. If the ledger can not be read, the row stays claimed
  (`waiting`), also for the operator's own click. So a row can not be freed for a cash confirmation while the system has seen a
  succeeded charge.
- The test runs the reviewer's scenario: Stripe executes, the event lands during `capturing`, and the answer and the list read are both lost.

### WR-01: a late cash card charge owed to nobody is refunded

**Files modified:** `lib/payments/settle.ts`, `lib/payments/alerts.ts`, `lib/stripe-webhook/charge-events.ts`
**Commit:** 3d39ab5b

- `released`, and `captured` with another PaymentIntent on the row, are now `already_paid`, the same as `cash_settled`. They are
  refunded under the `cash_dup` key and the operator is alerted. A redelivery of the PaymentIntent that is recorded does nothing.
- If the compare-and-set loses (for example `settleCash` landed first), the row is read again and decided once more. A row that
  keeps moving answers `busy`, so the event is delivered again and the money is never kept.
- The alert says why the charge was a second collection: cash confirmed, booking released, or already paid by card.

### WR-02: cancelling an `unpaid` row with a paid PaymentIntent refunds it (live)

**Files modified:** `lib/payments/cancel.ts`
**Commit:** 8b524ef1

`refundsPayNow` no longer requires the row to have left `unpaid`. The PaymentIntent decides:

- A paid one is refunded in full, late or in time. `isFeeEligible` stays false on an unpaid row, so no fee case is opened.
- An abandoned checkout (`paidMinor` 0) moves nothing.
- A read failure answers `money_failed` with the `refund_failed` alert, never a silent "nothing was taken".

The old test that pinned "no Stripe call on an unpaid row" now pins the refund.

### WR-03: an untagged round-trip refund counts once (live)

**Files modified:** `lib/payments/pay-now.ts`, `lib/payments/cancel.ts`, `lib/payments/fee.ts`, `lib/payments/alerts.ts`
**Commit:** 6c314efd

- An untagged refund whose amount matches one leg's share alone (within 1%) belongs to that leg (`attributeUntagged`). This
  covers the reviewer's €130 example: the outbound leg now gets its full €170.
- Any other untagged refund (a goodwill amount, or two equal legs) is unattributed. It lowers only the trip-wide cap, which is
  what Stripe still holds, and only once. Whichever leg is decided last gets the shortfall, and the total returned to the client
  is always what was paid.
- `PayNowFacts` gains `unattributedMinor` and `shortMinor`. A cancel whose leg comes up short sends the new
  `refund_unmatched` operator alert ("Refund not matched to a leg"), once per leg, with the shortfall. The alert asks the
  operator to check which leg the Dashboard refund was for, and to refund the difference by hand if it was the other leg.
- For "something went back at Stripe", fee decisions (`close_refunded`, the waive mail) also count unattributed refunds.
- `refund_unmatched` was added to `OPERATOR_ALERT_KINDS`. The two contract tests were updated.

### WR-04: a reopened cash booking charges under a fresh Stripe key

**Files modified:** `lib/payments/cash.ts`
**Commit:** 58529ec2

`reopenCash` advances `charge_attempts` in its own transition. The new value is the higher of the stored and the freshly read
counter, plus one, so the counter never goes down even from a stale row. The test runs the scenario end to end: a late charge on
`chg:<id>:0` is refunded, the cash is confirmed and then reopened, and a new click creates `chg:<id>:1`. That request really
executes, it is not replayed.

The review's second idea, a "refunded PaymentIntent counts as not collected" check in `chargeSavedCard`, was not added. A
`cash_dup` refund only happens on a `cash_settled`, `released` or `captured` row. Of these, only `cash_settled` can become
chargeable again, and only through `reopen_cash`, which now advances the attempt. A hand refund of an adopted charge leaves the
row `captured`, and no charge is offered there.

### IN-01: no false alert or dead button on pay-now no-shows

**Files modified:** `lib/no-show.ts`, `lib/payments/actions.ts`, `lib/payments/fee-reopen.ts`, `app/api/admin/bookings/[id]/payment/route.ts`
**Commit:** 966dff7d

- A pay-now no-show with nothing held gets no case and no `case_missing` alert. A read failure still alerts. A card row with no
  amount is a broken row, so it still alerts.
- The matrix offers `open_fee_case` on no pay-now row. The admin GET adds it for a cancelled or no-show pay-now row only after
  that row's own `case_missing` alert (`payNowCaseMissing`). Historic pay-now no-shows therefore get no button.

### IN-02: `open_case` re-checks the matrix on the server

**Files modified:** `app/api/admin/bookings/[id]/fee/route.ts`
**Commit:** 8b08ed36

- A replay (the case is already open) answers ok and writes nothing.
- Otherwise `openCaseOffered` must hold on the fresh row before the click is recorded. That means the matrix, including the
  `capturing` gate, or a pay-now row's `case_missing` alert.

The best-effort `admin:cancel` ledger row behind `cancelledByPrestigo` was left as the reviewer accepted it: a person still has
to charge, and the case can be waived.

### Coordinator request: legs exist only on round-trip rows

**Files modified:** `lib/payments/pay-now.ts` (a6b99963); test stubs and fixtures in df50824b
**Commit:** a6b99963, df50824b

`resolvePayNowSplit` returns "whole" for any row that is not `trip_type = 'round_trip'`, without a sibling lookup. The sibling
lookup itself now filters `trip_type = 'round_trip'`. This means a group payment link (`metadata.groupBookingIds`) can never be
read as two legs. Group rows do not store `payment_intent_id` at all (`handleGroupPaymentSucceeded`; the `(payment_intent_id,
leg)` unique index would refuse a second `outbound` row), so today they never reach this code.

Tests: a one-way row that shares its PaymentIntent with another row is whole and cancels normally. A round-trip row ignores a
non-round-trip row on the same payment. The coordinator's live check (3 shared PaymentIntents, all round trips with both leg
amounts) needs no data change.

## WR-08: Owner Decision Recorded

**Decision (owner, 2026-11-07):** an open debt does NOT block erasure. On erasure the debt is written off.

- `erasure_payment_open` (migration 088) is kept as it is. It still returns 0 for `failed`, `balance_due` and completed
  `card_saved` rows with a past pickup, so the Stripe Customer is deleted and that debt can no longer be collected. This is the
  chosen outcome. IN-05 of the first review is settled with it.
- The tick never works an anonymised row (commit e8a40b41). Steps B, C and F already filtered them. Steps D (operator alerts),
  E (checkout reconcile) and R (fee re-drive, reminders, cash card reconcile) now filter `anonymised_at IS NULL` too. Step A's SQL
  claim (migration 085) has no such filter and needs none: it takes only `card_saved` or `placing_hold` rows with a future pickup,
  and `erasure_confirm` refuses a person who has one. A test seeds anonymised rows for steps D, E and R. Nothing is called at
  Stripe, no state moves, and no mail goes out.

## Behaviour Changes to Know

- **Refunds on card-flow bookings:** `charge.refunded` cancels no `card_hold` or `cash_guarantee` row. Before, a full Dashboard
  refund of a captured card row with a live trip cancelled it with a raw update. Card-flow bookings are cancelled from admin or
  the manage page only.
- **After a Dashboard refund of an adopted cash charge,** the row stays `captured`, with `refund_observed` in the ledger. The panel
  does not show the cash, and the alert tells the operator what to do. A dedicated "refund the card, record the cash" action
  would need its own design.
- **The webhook answers 500** while a cash card charge is in `capturing`, for at most the 10-minute lease. Stripe retries.
- **`refund_unmatched` is sent from the cancel only.** A no-show case or a later fee decision on a leg that is short uses the
  same correct arithmetic, but sends no alert of its own.
- **`open_case` replays** answer 200 with no new `admin_action` row (before, every click wrote one).

## Verification

All checks ran in this agent's isolated worktree, not in the main checkout. Re-run the gate after merging.

- **Regression tests:** each fix commit carries tests that were run against the parent commit's source and failed there: CR-01
  (4), CR-02 (3), WR-01 (3), WR-02 (3), WR-03 (6, including 2 alert-contract tests), WR-04 (2), coordinator (1), IN-01 (2),
  IN-02 (1), WR-08 (1). Two guard tests pass on the parent too, on purpose: the round-trip row that ignores a non-round-trip
  row, and the replay part of `payNowCaseMissing`.
- **Touched suites:** the related tests were run before each commit.
- **Full suite:** 383 files passed, 2 skipped, 11,636 tests passed. The first full run found one failure, which was fixed and
  re-run: a comment in `tick.ts` named the hold claim RPC, which `tests/payment-state-writers-gate.test.ts` forbids. Runs used a
  temporary `vitest.symlink.config.ts` with `resolve.preserveSymlinks`, because `next-intl` does not load through the
  `node_modules` symlink. The temporary config was deleted afterwards and was never committed.
- **tsc:** 8 errors, the known baseline in `tests/` only. **eslint:** clean on all 30 changed `.ts` and `.tsx` files.
- **Not done:** no real Stripe call, no live database read, and no browser check of the new cash dialog line.

---

_Fixed: 2026-11-07_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
