---
phase: 89-cancellation-policy-cash-guarantee-no-show
reviewed: 2026-11-06T23:50:00Z
depth: deep
files_reviewed: 29
files_reviewed_list:
  - lib/payments/fee.ts
  - lib/payments/cancel.ts
  - lib/payments/cash.ts
  - lib/payments/settle.ts
  - lib/payments/hold.ts
  - lib/payments/tick.ts
  - lib/payments/recovery.ts
  - lib/payments/actions.ts
  - lib/payments/checkout.ts
  - lib/payments/state.ts
  - lib/payments/stripe.ts
  - lib/stripe-webhook/card-confirm.ts
  - lib/stripe-webhook/charge-events.ts
  - lib/stripe-webhook/dispatch.ts
  - lib/stripe-webhook/hold-events.ts
  - lib/stripe-webhook/recovery-events.ts
  - app/api/webhooks/stripe/route.ts
  - app/api/admin/bookings/route.ts
  - app/api/admin/bookings/cancel/route.ts
  - app/api/admin/bookings/[id]/fee/route.ts
  - app/api/admin/bookings/[id]/no-show/route.ts
  - app/api/admin/bookings/[id]/payment/route.ts
  - app/api/admin/bookings/[id]/assign/route.ts
  - app/api/card-checkout/init/route.ts
  - app/api/card-checkout/intent/route.ts
  - lib/no-show.ts
  - lib/booking-status-service.ts
  - supabase/migrations/087_cancellation_cash_fee.sql
  - supabase/migrations/088_erasure_payment_pii.sql
findings:
  critical: 5
  warning: 10
  info: 6
  total: 21
status: issues_found
---

# Phase 89: Money Path Code Review

**Reviewed:** 2026-11-06
**Depth:** deep
**Branch:** feat/89-cancellation-cash-noshow, diff base `git merge-base main HEAD` (5a3188e1)
**Status:** issues_found

## Summary

Five findings should stop the deploy. Three share one cause: the fee and cancel code assumes a pay-now booking is one EUR
payment for one row. That is false for a client who paid in CZK and for a round trip. The other two are a fee lock with no
exit and a cash charge the tick finishes after the client may already have paid the driver.

The card and cash engine itself held up. These were traced and found sound: the status compare-and-set before any money
step, the fee Stripe keys (`feecap:` / `fee:` plus attempt, amount locked), reconciling a capture whose answer was lost,
the partner gates at every entry point, the `apply_payment_transition` state list and the late-cancel path that leaves the
hold alone.

How this was checked:

- Findings come from reading and tracing the code. No Stripe call was made and the vitest suite was not run.
- Migration 088 was run on real Postgres for the first time, using PGlite 0.5.15 in the scratchpad. Migration 075 and
  sections 7 to 10 of 087 were applied for real, over stub tables for everything else. 088 applied cleanly twice. A full
  flow passed: `erasure_scope`, `erasure_confirm`, `erasure_record_step`, then `erasure_anonymise_person`, which refused
  without the `stripe` step and passed with it, and a repeat call returned the stored counts. Grants came out as intended.
  **No syntax or runtime error in 088.** Its open points are WR-08, IN-05 and IN-06. It was not run against the real
  Supabase schema.
- `linked_booking_id` (CR-02) rests on a repo comment and the absence of any writer in the repo. The live database was not
  checked.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Fee refunds on a CZK pay-now booking use EUR cents as if they were haléř: about 1/25 of the money is returned

**File:** `lib/payments/fee.ts:133-142`, `fee.ts:481`, `fee.ts:509-516`, `fee.ts:642-643`; `app/api/create-payment-intent/route.ts:77,139`; `components/booking/steps/Step6Payment.tsx:397`

**Issue:** A pay-now PaymentIntent is created in the client's chosen currency, and the wizard has an EUR / CZK toggle. Pay-now
rows store neither `payment_currency` nor `payment_amount_minor`, so `feeBaseFor` builds the base from `amount_eur` in EUR
cents and labels the case `eur`. `collectedForCase` returns that base, and `refundForCase` sends it as `amount` on the
original PaymentIntent. The `whole` branch at `fee.ts:642` does not rescue this: `buildBookingRow` always writes
`leg: 'outbound'` (`lib/supabase.ts:102`), so `legOf` is non-null on every current row, including one-way ones.

**Scenario:** A client pays 12,500 CZK (PaymentIntent 1,250,000 haléř, `amount_eur` 500) and cancels late.

1. The case has base 50,000, currency `eur`.
2. The operator waives because the flight was cancelled.
3. `refunds.create({ amount: 50000 })` refunds **500 CZK**. Stripe accepts it because it is below the charge.
4. The case closes as `waived` and the client's email says €500 was refunded.
5. 12,000 CZK stays with Prestigo with no alert.

A partial fee fails the same way: a fee of 200 EUR refunds 300 CZK instead of 7,500 CZK. Only a 100% fee is unaffected,
because it refunds nothing. The same source error affects pay-now rows whose `amount_eur` was changed by a trip edit: the
refund then follows the edited figure, not what Stripe holds. The comment at `lib/payments/cancel.ts:133` ("the pay-now
charge is in EUR") is wrong for the same reason.

**Fix:** Take pay-now money facts from Stripe, not the row. At the decision, retrieve the PaymentIntent and use
`pi.currency` and `amount_received` minus what was already refunded. Open the case in that currency, or store
`payment_currency` and `payment_amount_minor` on pay-now rows at capture and backfill them.

```ts
const pi = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] })
const refundable = pi.amount_received - (pi.latest_charge as Stripe.Charge).amount_refunded
// a one-way waive refunds with no amount; a leg refunds its share of `refundable`, in pi.currency
```

Add a CZK pay-now test for waive and partial charge.

### CR-02: A client cancelling one leg of a pay-now round trip refunds both legs, and the webhook then cancels the other leg

**File:** `app/api/manage/cancel/route.ts:100-105`; `lib/payments/cancel.ts:357-370`, `cancel.ts:372`, `cancel.ts:577-581`; `app/api/webhooks/stripe/route.ts:983-993`; `lib/manage-view.ts:203-206`; `components/admin/CancelBookingDialog.tsx:87-89,294`

**Issue:** The manage route never passes `leg`, and D-24 applies the policy per leg row. Without `input.leg`, `refundParams` is
`{ payment_intent }` with no amount, so a free cancel refunds the whole PaymentIntent that pays for both rows. Only this row
is cancelled by the compare-and-set, but a full refund makes `handleChargeRefunded` bulk-update every row of that
PaymentIntent to `cancelled`, straight past the status service.

**Scenario:** Both rows carry a stored policy and the confirmation email carries a manage link for each leg
(`lib/supabase.ts:482`, `policy-block.ts`). A client with a €300 round trip cancels only the return leg, in time.

1. The manage page for that row shows no refund at all, because the return row has `amount_eur` NULL and `fareOf` is null.
2. The server refunds the full €300.
3. `charge.refunded` cancels the outbound row too, even if the driver is on the way. The driver gets no notice and no
   assignment is touched.

Prestigo loses the money and the trip disappears.

**The admin path may have the same hole.** The dialog sends `leg` only when `linked_booking_id` is non-null. The comment at
`app/api/admin/bookings/[id]/payment-link/route.ts:101-103` says that column is never populated, and no migration or insert
path in this repo writes it. If the live database agrees, every admin cancel of a round-trip leg also refunds the whole
PaymentIntent. That part predates this phase, but D-24 now depends on it.

**Fix:** Derive the leg on the server, inside `cancelBooking`, from the row, and do not rely on the caller:

```ts
const leg = input.leg ?? (booking.trip_type === 'round_trip' && (booking.leg === 'outbound' || booking.leg === 'return') ? booking.leg : undefined)
```

Add `trip_type` and `leg` handling to the refund and fee steps. Change the dialog test to `isLegCancel` on `trip_type`. Make
`freeMoneyOf` show the leg amount. Add a client-cancel test on a two-row PaymentIntent.

### CR-03: A no-show or late cancel on a pay-now round trip uses the combined fare as the leg's cap, or opens no case at all

**File:** `lib/no-show.ts:395`; `lib/payments/fee.ts:139-142`, `fee.ts:481`; `lib/payments/cancel.ts:496-501`, `cancel.ts:616`; `lib/supabase.ts:136,431,465`

**Issue:** `feeBaseFor(booking)` without a leg reads `amount_eur`. On a round trip the outbound row's `amount_eur` is the
**combined** total, because only `amount_czk` is overridden per leg. The return row's `amount_eur` is NULL. `openNoShowCase`
never passes a leg, and neither does the client cancel (CR-02).

**Scenario A, the cap:** The client no-shows the outbound leg of a €300 round trip (€170 + €130).

1. The case has base and proposed fee 30,000, so the "100%" cap covers a return trip that is still booked.
2. The operator waives. `collected` is 30,000, so the refund is the full PaymentIntent.
3. `charge.refunded` is then a full refund and bulk-cancels the live return leg.
4. If the operator instead charges 100%, the return leg's money is kept as a fee. A later cancel of that leg refunds money
   already counted as the fee.

**Scenario B, no case:** The client no-shows the return leg, or a client late-cancels it.

- No base means `[no-show] no fee base` is logged and nothing else happens. The money stays, nobody is alerted and no
  decision is possible.
- The client path answers `{ ok, late, kept }` with a `case_missing` alert, and that case can never be opened (WR-02).

**Related:** The leg amounts are pre-promo, so with a promo the two leg bases add up to more than was paid. The second waive
then fails at Stripe. Checkout shows a third figure: `app/api/card-checkout/init/route.ts:76-81` previews the outbound
leg's post-promo share. D-14 says the server enforces the limit, and here the limit is wrong.

**Fix:** Pass the row's leg in both callers. Compute one leg base in one place: the leg's share of what was actually paid,
as the init route already does (`paid * leg / (outbound + return)`), in the PaymentIntent's currency (CR-01). Make a missing
base an operator alert on the no-show path.

### CR-04: A failed fee refund locks the case with no exit, and the only exit is unsafe

**File:** `lib/payments/fee.ts:588-598`, `fee.ts:624`, `fee.ts:249`, `fee.ts:377-380`; `app/api/admin/bookings/[id]/payment/route.ts` (`resolve_refund`); `supabase/migrations/088_erasure_payment_pii.sql` (`erasure_payment_open`)

**Issue:** `chargeFromCollected` takes the amount lock, then refunds. On `refund_failed` it deliberately keeps the lock.
Nothing else ever clears it: `unlockFeeAmount` runs only on settle outcomes, `waiveFee` answers `payment_busy` while
`charge_requested_at` is set, another amount answers `amount_locked`, and step R looks only at `capturing` and `captured`
card rows.

**Scenario:** A pay-now late cancel, fee 50%. The refund fails: `charge_disputed`, an insufficient Stripe balance, or the
operator already refunded in the Dashboard.

1. The operator gets the alert, refunds by hand and clicks "refund resolved". That writes only a ledger row.
2. The case stays `pending` and locked for good. Waive and every other amount are refused, the badge stays red and the
   person can never be erased, because `erasure_payment_open` counts the pending case.
3. The only click left is repeating the same charge. Within 24 h it replays the stored error. After 24 h Stripe has pruned
   the key, so it **issues the refund a second time**, on top of the hand refund.

A waive that fails and is finished by hand ends close by. Repeat waive keeps failing ("already refunded"), and the only way
to close the case is a charge for the full amount, which records a fee nobody took and emails the client a fee receipt.

The same dead end follows a crash between `lockFeeAmount` and the settle claim, and a `busy` answer before any Stripe call
(`fee.ts:377-380`). The operator who wants to waive then has to charge the client first.

**Fix:**

- Release the lock on a definitive refund failure, keeping it only for transient errors.
- Add an operator action "refund done by hand" that closes the case with no Stripe call.
- Let `waiveFee` take over a lock whose row is not `capturing` with a live lease.
- Before any fee refund, list the PaymentIntent's refunds and skip if one for this case exists (see WR-05).

### CR-05: A cash card charge that hit a transient Stripe error is finished later by the tick, after the client may have paid the driver

**File:** `lib/payments/fee.ts:459-461`; `lib/payments/settle.ts:570`; `lib/payments/tick.ts:625-637,682-700`; `lib/driver-trip-step.ts:291`

**Issue:** D-21 says that if the card fails the client pays the driver in cash. A transient result is not a failure to the
engine: the row stays in `capturing`, the operator sees `payment_busy`, and step R replays the charge once the 600 s lease
lapses, with no person involved. While the row is `capturing`, the driver's `confirm_cash` is refused (`cash_not_allowed`)
and the operator's "mark settled" is not offered, so nothing can stop the re-drive.

**Scenario:**

1. The operator charges the card while the client is still in the car. Stripe times out, or answers 5xx before executing.
2. The panel shows busy, the card apparently did not work, and the client pays the driver.
3. The driver's confirmation is refused.
4. Ten minutes later the tick creates the charge under `chg:<id>:<n>` and it succeeds. The client has paid the full fare
   twice, and only a receipt email shows it.

Low frequency, but it is a full double collection with nothing in the system to catch it.

**Fix:** Do not create a new charge from the tick for `cash_card`. Step R should only reconcile: search by metadata, adopt a
succeeded PaymentIntent, otherwise move `capturing -> failed` and alert the operator. A new attempt is then a new person
click, and `failed` is already a state `settleCash` accepts. Also answer the driver with a clear "wait" while the row is
`capturing`.

## Warnings

### WR-01: The no-show receipt never renders for pay-now and pre-deploy bookings, so the client is charged with no email

**File:** `lib/payments/fee.ts:412-419`; `lib/payments/tick.ts:575-582`; `lib/stripe-webhook/recovery-events.ts:229-236`; `lib/payments/emails/send.ts:76,174-181`; `lib/payments/emails/render.ts` (`fee_charged:no_show`)

**Issue:** `fee_charged:no_show` needs `waitMin`. None of the three callers passes it, so it comes from `policyBoxFromRow`, and
that returns null when `amountMinor` is 0 (every pay-now row) or no policy is stored (every pre-deploy row). The render
throws, `sendPaymentEmail` returns `'failed'`, and `sendReceipt` ignores the return value.

**Scenario:** The operator keeps a no-show fee on a pay-now booking and refunds the rest. The money moves and no receipt goes
out. Nothing re-drives it, because the key was never recorded. The money step is not undone, so this is a warning.

**Fix:** Pass `waitMin` from `caseRow.evidence.threshold_min` in all three closers, and log a `'failed'` result.

### WR-02: A fee case that failed to open can never be opened, and a no-show failure alerts nobody

**File:** `lib/no-show.ts:378-380`, `no-show.ts:396-399`, `no-show.ts:443-449`; `lib/payments/cancel.ts:497-501`, `cancel.ts:520-527`; `lib/payments/actions.ts:105,116`

**Issue:** `openFeeCase` has two callers and no retry. The doc comment says a failure is "alerted, and the operator can still
open the case by hand", but the catch only logs and no action or route opens a case.

**Scenario:** A database blip during `confirmNoShow` leaves the status `no_show` with a live hold and no case. The matrix offers
only `release`. Nobody is told, and the fee can no longer be charged (D-13, D-15). A late cancel at least alerts
`case_missing`, but the operator has no way to act on it either.

**Fix:** Add an idempotent `open_case` action on the fee route (it can recompute everything from the row), or a step R pass for
closed fee-eligible bookings with no case. Raise an alert in the `openNoShowCase` catch.

### WR-03: The status write and the case insert are not atomic, so a hold placement can destroy the saved card and strand the case

**File:** `lib/payments/hold.ts:183-219`; `lib/payments/cancel.ts:381-505`; `lib/no-show.ts:486-497`; `lib/payments/actions.ts:96,116`

**Issue:** `abandonHoldForClosedBooking` keeps the card only if a pending case already exists. The case is opened after the
status change.

**Scenario:** The tick is placing a hold, the client late-cancels, the status lands, Stripe answers, `requireStatus` blocks the
placement, and no case exists yet. The row goes to `released` (terminal). The cancel's fresh read happened before that, so
the case opens on a released row. Then:

- `isFeeEligible` is false, the matrix returns `[]` and the operator can neither charge nor waive.
- The case is pending forever, which also blocks erasure.

**Fix:** Offer `waive_fee` for any pending case whatever the state, closing it with no money step when nothing is held. After
`openFeeCase`, re-read the row and alert if it is `released`. Better still, have the abandon step keep the card whenever the
booking is closed and the policy outcome is late.

### WR-04: A live hold survives a declined fee, then a waive or a paid link

**File:** `lib/payments/hold.ts:620-622`; `lib/payments/settle.ts:200-203`, `settle.ts:630-637`; `lib/stripe-webhook/recovery-events.ts:174-187`

**Issue:** `releaseHold` treats `failed` as "nothing at Stripe". A fee can leave `failed` with an authorization still live: the
hold is smaller than the fee (the fare was raised after the hold) and the saved card is declined. `leftoverHoldId` is voided
only on success.

**Scenario:** After that decline, a waive calls `releaseHold`, the row becomes `released` and the client's card stays blocked
until the authorization lapses, up to seven days. Paying the fee link leaves the same hold in place, so the client has paid
and still has the amount held.

**Fix:** In `releaseHold`, and after a paid recovery link, void `hold_payment_intent_id` when it is set, for `failed` and
`expired` too. `cancelPaymentIntent` already treats an already-cancelled intent as success.

### WR-05: One refund key serves two decisions and amounts, and no refund id is recorded

**File:** `lib/payments/fee.ts:514-516`; `lib/payments/stripe.ts:61`

**Issue:** `refund:<bookingId>:fee:<caseId>` is shared by `waiveFee` (the whole amount) and `chargeFromCollected` (the
difference), and the case keeps no refund id. The ledger has no row saying a fee refund happened, and pay-now refunds are
not observed at all (`dispatch.ts:209` filters to card and cash).

**Scenario:** A waive times out at Stripe, so it is recorded as failed, but it may have executed. The operator then charges 40%.
Inside 24 h the different amount under the same key gives an idempotency error and locks the case (CR-04). After 24 h the
key is gone, so a smaller refund runs on top of the first. A crash after a successful leg refund, before the case closes,
has the same 24 h exposure on a repeat click.

**Fix:** Put the refund id on the case or in a ledger row as soon as Stripe answers. Pass `metadata.fee_case` on the refund and
check `refunds.list` before creating one. Include the amount in the key so a different decision gets a clean error path.

### WR-06: A late payment of an old recovery link closes the fee case with nobody deciding

**File:** `lib/stripe-webhook/recovery-events.ts:144-146,184-187`; `lib/payments/cancel.ts:619-624`

**Issue:** Any card_recovery payment on a `failed` row with a pending case is treated as the fee paid. The comment in `cancel.ts`
says such a payment "is refunded by the recovery webhook", but the code does the opposite.

**Scenario:** A hold is declined and the client gets a link for the full fare. The client opens Checkout, then cancels late. The
link is retired, but the open session is paid. The case closes as `charged` by `webhook`, and the client gets a fee receipt.
The operator never decided (D-05), and a cancelled-flight waive is no longer possible.

**Fix:** Close the case only for a fee link (tag `f<attempt>`, or a metadata flag set when the link is created). Refund any other
link payment through `refundDuplicatePayment`.

### WR-07: Releasing a cash booking before the trip removes the driver's cash step

**File:** `lib/payments/actions.ts:111`; `lib/driver-trip-step.ts:338-344`; `lib/payments/cash.ts:105`

**Issue:** `release` is offered on an active cash booking. `released` is terminal, the driver page shows no cash block for it and
`settleCash` refuses it.

**Scenario:** The operator clicks Release on a confirmed cash booking, for example to drop the card at the client's request. The
trip runs, the driver is never warned to collect (D-11), and nothing can record cash received. The booking looks closed
with no money.

**Fix:** Offer `release` on a cash row only when the booking is closed, or keep the row settle-able after a release.

### WR-08: Erasure passes past-pickup debts, deletes the Customer, and the tick keeps working the anonymised row

**File:** `supabase/migrations/088_erasure_payment_pii.sql` (`erasure_payment_open`, stripe ids UPDATE); `lib/erasure-store.ts:194`; `lib/payments/tick.ts:213-264,276-324`

**Issue:** Confirmed on PGlite: `failed`, `balance_due` and completed `card_saved` rows with a past pickup give `payment_open = 0`.
`LIVE_PAYMENT_STATES` does not include them, so their Customer is deleted. After anonymising, the `failed` test row still
held `cus_` and `pm_` ids, because only terminal states are cleared.

**Scenario:** A person with an unpaid `failed` trip is erased. Step B or C settles the row, Stripe rejects the deleted Customer,
and `recordFailure` creates a recovery link and emails `erased-<id>@erased.invalid`. The debt silently becomes uncollectable
and the operator gets an alert about an anonymised booking.

**Fix:** Decide the rule explicitly. Either count `failed` and `balance_due` in `erasure_payment_open`, or clear the ids on all
anonymised rows and exclude `anonymised_at IS NOT NULL` from steps B, C and F.

### WR-09: A cash booking is not protected from re-pricing on a trip edit

**File:** `app/api/admin/bookings/route.ts:561-562`; `lib/payments/edit-hook.ts:121-131`

**Issue:** A-WR-11 keeps the agreed amount on a price-field edit for `card_hold` only. The recompute knows nothing about the
client's promo. For `cash_guarantee` the edit is either refused (422 mismatch) or takes the recomputed price, and
`reevaluateCashAfterEdit` then moves `payment_amount_minor`, which is what the driver collects and what the card can be
charged.

**Scenario:** A cash booking with a 20% promo gets an address fix. Unless the submitted amount diverges, the agreed price is
replaced by the full price. That breaks D-12, the same amount the client saw. The server logic is confirmed; what the admin
form submits was not checked.

**Fix:** Treat `cash_guarantee` like `card_hold` in `cardKeepsAgreed` and `cardExplicit`.

### WR-10: Cancelling a booking already marked as paid in cash says nothing was taken

**File:** `lib/payments/cancel.ts:107,569-571`; `lib/payments/cash.ts:35-37`

**Issue:** `CASH_TRIP_STATUSES` includes `confirmed` and `assigned`, so the operator can mark cash settled before the trip.
`cash_settled` is then "nothing held", and the free path sends a cancel email with `money: 'none'`.

**Scenario:** A trip cancelled by Prestigo after the cash was recorded: D-20 says it is free for the client, but nobody is alerted
that cash has to be returned, and the email says no money was taken.

**Fix:** Restrict settling to `on_board` and `completed`, or raise an operator alert when a `cash_settled` row is cancelled.

## Info

### IN-01: `pi_void:<pi>` is used with different parameters

**File:** `lib/payments/hold.ts:393`, `lib/payments/settle.ts:230,633`, `lib/payments/checkout.ts:326`
`cancelPaymentIntent` sends `cancellation_reason`; the other three send nothing. Reusing the key gives an idempotency error.
It is harmless today because the first cancel has already done the work and each caller tolerates the error. Route them all
through `cancelPaymentIntent`.

### IN-02: Comments that contradict the code

**File:** `supabase/migrations/087_cancellation_cash_fee.sql` (section 6); `lib/payments/cancel.ts:133,623`; `lib/no-show.ts:379`
087 says a NULL policy means "no fee", but `LEGACY_POLICY` proposes 100% inside the last hour. That matches research
Pitfall 13, so the comment is the stale part. The others are covered by CR-01, WR-06 and WR-02.

### IN-03: Declined-fee notices are not re-driven

**File:** `lib/payments/tick.ts:446,450-452`
Step F skips rows with a fee case and cash rows, so a Resend outage loses the recovery link email. The operator does see
`declined` in the response, so this is minor.

### IN-04: `confirmNoShow` has no busy check

**File:** `lib/no-show.ts:486-494`
`cancelBooking` refuses a `capturing` row; no-show does not. A cash charge in flight at `on_location` plus a no-show leaves
`capturing` with status `no_show`, where `collectGate` refuses the re-drive and the matrix offers nothing. Narrow, but return
busy for parity.

### IN-05: An abandoned checkout blocks erasure until its pickup date passes

**File:** `supabase/migrations/088_erasure_payment_pii.sql` (`erasure_payment_open`)
Confirmed on PGlite: an `unpaid` row in `checkout_pending` with a future pickup gives `payment_open = 1`, with no money
involved. The operator has to cancel it first. Exclude `status = 'unpaid'`, or say so in the preview.

### IN-06: Deploy window for 088

**File:** `supabase/migrations/088_erasure_payment_pii.sql`
Neither order loses data, but erasure stops between the two steps. With 088 first, old code raises "stripe step is not
finished". With the code first, `erasure_record_step` refuses `stripe`. Before applying, check that no request is mid-flight:
`select id, status, steps from erasure_requests where status in ('confirmed', 'running')`. 088 also needs 087 applied first.

---

**Findings by severity:** critical 5, warning 10, info 6, total 21.

_Reviewed: 2026-11-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
