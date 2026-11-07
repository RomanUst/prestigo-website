---
phase: 89-cancellation-policy-cash-guarantee-no-show
reviewed: 2026-11-07T01:05:19Z
depth: deep
files_reviewed: 29
files_reviewed_list:
  - app/(internal)/driver/trip/[token]/TripCompleted.tsx
  - app/[locale]/account/trips/page.tsx
  - app/api/admin/bookings/[id]/fee/route.ts
  - app/api/admin/bookings/[id]/payment/route.ts
  - app/api/admin/bookings/cancel/route.ts
  - app/api/admin/bookings/route.ts
  - app/api/webhooks/stripe/route.ts
  - components/admin/CancelBookingDialog.tsx
  - components/admin/FeeCloseRefundedModal.tsx
  - components/admin/PaymentPanel.tsx
  - components/admin/paymentShared.ts
  - lib/driver-trip-step.ts
  - lib/manage-view.ts
  - lib/no-show.ts
  - lib/payments/actions.ts
  - lib/payments/alerts.ts
  - lib/payments/cancel.ts
  - lib/payments/emails/render.ts
  - lib/payments/emails/send.ts
  - lib/payments/fee-reopen.ts
  - lib/payments/fee.ts
  - lib/payments/hold.ts
  - lib/payments/pay-now.ts
  - lib/payments/settle.ts
  - lib/payments/state.ts
  - lib/payments/stripe.ts
  - lib/payments/tick.ts
  - lib/stripe-webhook/charge-events.ts
  - lib/stripe-webhook/recovery-events.ts
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 89: Money Review, Second Pass (fixes after 89-REVIEW-money.md)

**Reviewed:** 2026-11-07
**Depth:** deep
**Range:** `git diff bb56ea2b..HEAD` limited to lib/, app/, components/, HEAD 76b2b638
**Files Reviewed:** 29
**Status:** issues_found

## Summary

CR-01 to CR-04 are closed, on the admin path and in the webhook too. **CR-05 is not closed.** The tick no longer charges, but
the safety net that replaced it has two holes. In both, a client who was charged by card and also paid the driver stays
double-charged with no operator alert. Both are behind the closed flag.

Nothing in the fixes breaks `charge.refunded` for an ordinary booking. Two findings do touch what is live: one money gap on an
`unpaid` row (WR-02) and one on a hand refund of a round trip (WR-03). Neither double-acts or cancels the wrong row. Both leave
money with Prestigo with nobody told.

No path was found where a worker starts a charge, or where a refund is issued twice.

How this was checked:

- Findings come from reading and tracing the code. No Stripe call was made and the live database was not read.
- Stripe shapes were checked against the types of SDK 21.0.1 and against what Stripe documents. They were not checked against
  a live event.
- In the main checkout, on the merged HEAD: `tests/payments-paynow-money`, `payments-fee-webhook`, `payments-fee` and
  `driver-trip-cash` passed, 149 of 149. `tsc` shows the 8 known errors, all in `tests/`. The full suite was not run.
- Not read: `app/api/csp-report/route.ts`, `lib/csp-report-redact.ts`, `lib/locale-date.ts`, `lib/payments/consent-text.ts`
  (public fixes, no money) and `components/admin/FeeOpenCaseModal.tsx`.

## Priority 1: are CR-01 to CR-05 closed?

| Finding | Verdict | Traced |
|---|---|---|
| CR-01 wrong currency and amount | **Closed** | Cancel, case base, waive, charge and mails all read `loadPayNowFacts`. A one-way refund has no amount, so Stripe returns the rest. A case in another currency moves nothing. |
| CR-02 one leg refunds both | **Closed** | `cancelBooking` has no `leg` input. The split comes from the row and the shared PaymentIntent for all three initiators. The admin route ignores `leg`. A leg refund carries `metadata.leg` and the webhook reads it before the charge total. |
| CR-03 wrong cap, no case | **Closed** | `openNoShowCase` and the late path use the leg's share. `confirmNoShow` reads `select('*')`, and `BOOKING_COLUMNS` and `MANAGE_BOOKING_COLUMNS` both carry `leg`, `trip_type` and the leg amounts, so the split is not silently "whole". |
| CR-04 failed refund locks the case | **Closed** | Every decision works from what Stripe holds. A definitive failure unlocks. `freeStaleLock` never frees a row in `capturing`. `close_refunded` is an exit. |
| CR-05 worker finishes a cash charge | **Not closed** | The worker part is fixed: `settleBooking` refuses a cash charge from anything but a free row, and the tick only reads. The double collection remains, see CR-01 and CR-02 below. |

## Priority 2: what is live with the flag closed

- **`refunds.list` / `paymentIntents.list` / `amount_received`:** all shapes are right. `RefundListParams.charge` and
  `.payment_intent`, `PaymentIntentListParams.customer` exist. `limit: 100` is the maximum. Refunds and PaymentIntents list newest
  first, so `find` gets the latest. `amount_received` does not fall after a refund, and the code subtracts refunds itself.
- **API version:** both clients are constructed without `apiVersion`, so they use the SDK's pin, `2026-03-25.dahlia`. `charge.refunds`
  is typed optional and nullable, and `?.data ??` handles absent, null and present.
- **`charge.refunded` fires on partial refunds too, with `charge.refunded: false`.** The early return at `route.ts:941` therefore
  ignores every partial. Confirmed: a Dashboard partial refund changes no status, as the fix report says.
- **Dashboard full refund, one-way:** unchanged, `rows.length === 1` at `route.ts:972` never reaches the new read.
- **Dashboard full refund, round trip:** latest refund untagged, so a bulk cancel. Correct, also when an earlier leg refund was tagged.
- **Last leg's refund:** tagged, so only that row is cancelled. This is the real fix of the bulk cancel.
- **Admin cancel, one-way:** split `whole`, no amount, key `refund:<id>:full`. Same as main.
- **Admin cancel, round trip:** one leg only, new and intended by D-24. The operator now cancels each leg.
- **Failed read in the webhook:** the throw leaves `POST` uncaught, Next answers 500, the event is not claimed and Stripe redelivers.
  A redelivery is a no-op on a cancelled row. `observeRefund` repeats safely on its key.
- **To prove at go-live:** `refunds.list` needs read access to refunds. If `STRIPE_SECRET_KEY` is a restricted key without it, a round-trip
  refund answers 500 for the whole retry window and no row is cancelled. Check the key type.

## Priority 3: the new states and actions

- **`capturing -> card_saved`:** only `reconcileCashCharge` uses it, guarded by mode and state. The SQL lease rule blocks only leased
  targets, so the move works during a live lease. Safe.
- **`card_saved -> captured`:** only `recordCashCharge` uses it. No other caller reaches it.
- **Charge without a person:** none. Steps B, C and F filter `card_hold`. `redriveFee` needs a lock set by a click. `runPaymentAction` offers
  no capture on a cash row. A cash row in `capturing` with a fee case is left to `redriveFee`, and `reconcileCashCharge` can not reach it
  (tick filter, driver path needs `completed`), so a `card_fee` payment is never mistaken for "no payment".
- **`close_refunded`:** admin only, strict schema, moves nothing. It can end a case as waived while Stripe still holds money: one small
  refund at Stripe satisfies the check. That is the operator's word and the note is required, so it is not raised as a defect.
- **`open_case`:** can not create money movement, a free cancel or a Prestigo cancel is refused, and a second call answers `exists`. See IN-02.
- **Double refund:** none found. Fee refunds read Stripe first and the key carries the amount. `cash_dup` replays, and after 24 h a repeat
  fails at Stripe as already refunded.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A late cash charge is adopted with no operator alert, so CR-05's double collection stays in its usual order

**File:** `lib/stripe-webhook/charge-events.ts:89-92`; `lib/payments/settle.ts:599-601`; `lib/driver-trip-step.ts:296-300`; `components/admin/paymentShared.ts:187`

**Issue:** The fix refunds a late charge only when the cash was confirmed first (`already_paid`). The driver can confirm only on a
`completed` booking, and D-21 has the operator charging during the trip. So the webhook almost always arrives first. That is the
`adopted` branch, and it sends the client a receipt and tells nobody at Prestigo. `tests/payments-fee-webhook.test.ts` pins that no refund
happens there and asserts no alert.

**Scenario:**

1. Client on board. The operator clicks Charge saved card. All three tries time out.
2. `reconcileCashCharge` finds nothing, the row goes back to `card_saved`, and the panel says "Payment is being processed. Wait a moment
   and try again." The operator takes that as no, and the client pays the driver.
3. Stripe executes. The webhook moves the row to `captured`. The client gets a card receipt. No alert.
4. The trip completes. `buildDriverCash` returns null for `captured`, so the driver has no cash step. An old open page gets "This booking
   changed. Reload the page."
5. The client has paid the full fare twice. The panel offers no action on a `captured` cash row. The cash is recorded nowhere.

The hand exit is unsafe too. If the trip is not yet `completed`, a full refund in the Dashboard reaches `route.ts:972`, because the row now
holds this PaymentIntent, and cancels the live trip with a raw update.

The driver path has the same gap. A tap that finds the charge succeeded (`driver-trip-step.ts:298`) records it and answers `cash_conflict`,
with no alert and no receipt. The webhook then sees `captured` and adds nothing, so the client gets no receipt either.

**Fix:** Alert on every adoption, and on the driver path too. Offer the operator a way to return the card money that does not go through the
trip-cancelling handler.

```ts
if (outcome === 'adopted') {
  await sendCashCardReceipt(bookingId, { id: bookingId })
  await sendPaymentOperatorAlert('duplicate_payment', row, {
    eventKey: `alert:cash_card_late:${bookingId}:${pi.id}`,
    code: 'cash_card',
    amountMinor: pi.amount_received,
    note: 'adopted', // "The card charge went through after all. If the client also paid cash, refund the card."
  })
  return
}
```

In `handleChargeRefunded`, skip the cancel for `cash_guarantee` rows. Answer `payment_busy` for a cash charge with its own copy ("Not confirmed.
Do not take cash until the panel shows the outcome, or take cash and check the alert").

### CR-02: A `payment_intent.succeeded` that arrives during `capturing` is consumed, and the row can then be released with nothing left to catch the charge

**File:** `lib/stripe-webhook/charge-events.ts:78,93`; `lib/payments/settle.ts:600`, `settle.ts:556-562`, `settle.ts:538-540`; `lib/stripe-webhook/dispatch.ts:165-178`

**Issue:** `adoptLateCashCharge` answers `none` for a row in `capturing`. `once` then marks the event processed. The own-claim reconcile releases
the row even when Stripe could not be read, and the comment at `settle.ts:539-540` relies on `handleCardChargeSucceeded` to catch a charge that
did execute. In this order nothing will: the event is already spent, and the tick only looks at rows still in `capturing`.

**Scenario:** The failures are correlated: the path from Vercel to Stripe is bad while Stripe to Vercel works.

1. The operator clicks. Stripe executes the charge, but the answers are lost and the SDK keeps retrying for up to a minute.
2. The webhook arrives. The row is `capturing`, so the answer is `none`. A `charge_succeeded` ledger row is written and the event is claimed.
3. The SDK gives up. `findCashCharge` also fails. The row goes to `card_saved`.
4. The driver confirms cash, and `settleCash` succeeds.

The client paid twice, and the system shows a normal cash booking. The only trace is one `charge_succeeded` ledger row. No later event, sweep or
alert touches it. This is worse than CR-01 because even the driver gets no refusal.

**Fix:** Do one of the two, the first is smaller:

- In `handleCardChargeSucceeded`, throw for a cash row in `capturing`, so `once` answers 500 and Stripe redelivers. `handleRecoveryPaid` already
  treats `BUSY_STATES` this way.
- Before releasing in `reconcileCashCharge`, read the ledger for a `charge_succeeded` row of this booking newer than the claim, and record that
  charge instead.

## Warnings

### WR-01: A late charge that lands on any other row state is kept silently

**File:** `lib/payments/settle.ts:598-601`; `lib/stripe-webhook/charge-events.ts:93`

**Issue:** `adoptLateCashCharge` returns `none` for `released`, and also when its compare-and-set loses. The caller then returns with no refund and no alert.

**Scenario A, released:** After the row is released from a timed-out charge, the operator cancels the booking in time. `releaseHold` moves it to
`released`. The charge lands. The client paid the full fare on a cancelled booking, and only a `charge_succeeded` row shows it.

**Scenario B, the race:** The webhook reads `card_saved`. The driver's `settleCash` lands before `recordCashCharge`. The transition is not applied, so the
answer is `none`. The state is now `cash_settled`, exactly the case that should refund, and the event is claimed.

**Fix:** After a transition that did not apply, re-read and decide again. Treat `released` and `cash_settled` alike: refund under the `cash_dup` key and alert.

```ts
if (row.payment_state === 'cash_settled' || row.payment_state === 'released') return 'already_paid'
if (row.payment_state !== 'card_saved' && row.payment_state !== 'failed') return 'none'
if (await recordCashCharge(...)) return 'adopted'
return adoptLateCashCharge(bookingId, pi, actor) // the row moved: decide on its new state, at most once more
```

### WR-02: Cancelling an `unpaid` row whose PaymentIntent was paid now refunds nothing (regression against main, live)

**File:** `lib/payments/cancel.ts:345-347`, `cancel.ts:423`, `cancel.ts:633`

**Issue:** `refundsPayNow` is false for `previousStatus === 'unpaid'`, so the PaymentIntent is never read. The comment at `cancel.ts:346` says it "is still read
below". It is not: the read at line 423 sits behind the same flag. On main this row attempts a refund and either succeeds or leaves `refund_failed` and an alert.

**Scenario:** A client pays. The webhook is late or failing, as in the outages `sendEmergencyAlert` exists for, so the row is still `unpaid` in the operator's
follow-up queue. The operator cancels it. The answer is `money: 'none'` and the client's mail says nothing was taken. On redelivery
`reconcileBookingToConfirmed` matches no `unpaid` row and `saveBooking` inserts nothing, so `handleOneWaySucceeded` returns at "already handled". The round-trip
path behaves the same. The charge stays with Prestigo and no alert is sent.

**Fix:** Read the PaymentIntent, as the comment promises, and let `paidMinor` decide. An abandoned checkout then falls into `payNowEmpty`, so the
coordinator's goal is kept.

```ts
const refundsPayNow = !partner && !isHold && Boolean(booking.payment_intent_id)
// isFeeEligible stays false on an unpaid row, so a paid one is refunded in full, never held as a fee
```

A read failure on an unpaid row then raises a false `money_failed`, which is the safe side. Note that the order "cancel first, client pays after" stays silent on
main too, because the PaymentIntent is not cancelled. Cancelling a `requires_*` PaymentIntent here would close it.

### WR-03: An untagged Dashboard refund on a round trip counts against both legs, so the client is short by that amount (live)

**File:** `lib/payments/pay-now.ts:143-145,154`

**Issue:** `refundedMinor` adds untagged refunds to each leg, so one hand refund lowers both shares. The comment presents this as caution, but no alert or note
tells anybody, and the mail states the smaller figure as the refund.

**Scenario:** A €300 round trip, €170 + €130.

1. The operator refunds €130 in the Dashboard for the return leg. It is partial, so no status changes.
2. The operator cancels the return row: `collected` is 0, `money: 'none'`.
3. The client cancels the outbound leg in time: `min(170 - 130, 300 - 130)` = €40.

Both legs are cancelled free, the client got €170 of €300, and Prestigo keeps €130 with nobody told. The same applies to a €20 goodwill refund: each leg loses €20.

**Fix:** Keep the cap, since a guess must not eat the other leg's money, but make the shortfall visible. When a two-row payment has an untagged refund and the leg's result
is below its share, raise an operator alert with the difference, and do not state the figure as the full refund. Better still, let the operator tag it:
`refunds.update(id, { metadata: { leg } })`, which Stripe allows and which makes the existing arithmetic correct.

### WR-04: After `reopen_cash`, a charge click replays a payment that was already refunded and records the booking as paid

**File:** `lib/stripe-webhook/charge-events.ts:98-101`; `lib/payments/cash.ts:145-150`; `lib/payments/settle.ts:264-271,283-301`

**Issue:** `reconcileCashCharge` keeps the attempt number on purpose, and the `cash_dup` refund does not change it. `chg:<id>:<n>` therefore still maps to the refunded
PaymentIntent. A refunded PaymentIntent keeps `status: 'succeeded'`.

**Scenario:** A late charge lands on a `cash_settled` row and is refunded automatically. The operator then finds that the driver's confirmation was wrong and uses
`reopen_cash` (D-22). The row is `card_saved`. The operator charges the card. Stripe replays the old PaymentIntent, `succeeded`, so the row goes to `captured`, with a
"card charged" receipt to the client. No money was taken. After 24 h `searchFirst` finds the same PaymentIntent and does the same, so a new charge can never run on
that attempt. The same happens if the operator refunded a late charge by hand.

**Fix:** Advance `charge_attempts` when `reopenCash` runs, or in the `cash_dup` branch. Also, in `chargeSavedCard`, treat a replayed or found PaymentIntent with money
refunded as not collected.

## Info

### IN-01: A pay-now no-show with no money behind it raises a false alert and a dead button

**File:** `lib/no-show.ts:413-416`; `lib/payments/actions.ts:115-117`; `lib/payments/fee-reopen.ts:61`

A row can carry a PaymentIntent with no money left: fully refunded, or a stale intent on a booking paid another way. `isFeeEligible` is true, `feeBaseNow` is null, and `alertCaseMissing`
says the case could not be opened and to decide from the booking. `open_fee_case` is offered, and it answers 422 on every click. Send the alert only when
`feeBaseNow` threw, not when it answered null. Every historic pay-now no-show also gets the panel and the button.

### IN-02: `open_case` does not re-check the action matrix

**File:** `app/api/admin/bookings/[id]/fee/route.ts:205-210`

The header of `lib/payments/actions.ts` says the admin POST re-checks the matrix. Every other action does, this one does not, so `state !== 'capturing'` and the `case_missing` gate of the admin GET
hold in the UI only. `cancelledByPrestigo` also relies on a best-effort ledger row (`cancel.ts:407-418`): if that write failed, a Prestigo cancel inside the late window could be opened as a
case. A person still has to charge it, and the case can be waived. Add the `state` check on the server.

---

**Not re-raised, already in the fix report:** two rows sharing a payment with no leg amounts answer `leg_amount_missing` and can not be cancelled by anyone, Prestigo included. That is a state with no
exit, and on main the same row cancels. Before go-live, run one query for `payment_intent_id` shared by two rows where either leg amount is NULL. Also open: WR-08 (owner decision).

**Findings by severity:** critical 2, warning 4, info 2, total 8.

_Reviewed: 2026-11-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
