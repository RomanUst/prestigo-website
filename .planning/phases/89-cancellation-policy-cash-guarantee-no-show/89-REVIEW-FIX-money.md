---
phase: 89-cancellation-policy-cash-guarantee-no-show
fixed_at: 2026-11-07T00:44:25Z
review_path: .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-REVIEW-money.md
iteration: 1
findings_in_scope: 16
fixed: 15
skipped: 0
needs_owner: 1
status: partial
---

# Phase 89: Money Review Fix Report

**Fixed at:** 2026-11-07
**Source reviews:** `89-REVIEW-money.md` (all), `89-REVIEW-public.md` (CR-01, WR-06)
**Base:** bb56ea2b. **Iteration:** 1

**Summary:**

- In scope: 16 findings (money CR-01 to CR-05, WR-01 to WR-10, public WR-06). Public CR-01 is the same bug as money CR-02.
- Fixed: 15. Needs owner: 1 (WR-08, its code half is fixed). Wrong: 0: every finding reproduced in code or in a failing test.
- Also done: the coordinator's `unpaid` addition, IN-04, and the IN-02 comments that the fixes touched.
- No migration was needed. 087 and 088 are unchanged. No `ORCHESTRATOR_MCP_REQUIRED`.

## Outcomes

| Finding | Outcome | Commit |
|---|---|---|
| CR-01 fee in the wrong currency and amount | fixed | c3ec0072 |
| CR-02 = public CR-01, one leg cancelled, both refunded | fixed | 8bdcbb32 |
| CR-03 combined fare as the leg cap, no case on the return leg | fixed | 90e0ecda |
| CR-04 failed refund locks the case | fixed | 77af1eb6, d341e521 (operator copy) |
| CR-05 tick finishes a cash card charge | fixed | bf7cb273 |
| WR-01 no-show receipt never renders | fixed | 9be30b8b |
| WR-02 case that failed to open | fixed | 5c85c294 |
| WR-03 hold placement strands the case | fixed | 632691d5 |
| WR-04 live hold survives a declined fee | fixed | 7b11668a |
| WR-05 one refund key for two decisions | fixed | efb037f2 |
| WR-06 old link closes a fee case | fixed | 81b83e13 |
| WR-07 release on a live cash booking | fixed | 13710d83 |
| WR-08 erasure and debts | **needs owner** for the rule; tick half fixed | 41900d67 |
| WR-09 cash booking re-priced on edit | fixed | a9e71ce9 |
| WR-10 cancel of a booking paid in cash | fixed | 951405ee |
| public WR-06 late client cancel with no mail | fixed | 5b5b5324 |
| IN-04 no-show during a card charge | fixed (trivial) | 5afa089f |
| IN-02 stale comments | fixed where the fixes touched them; the 087 comment is left (applied migration) | c3ec0072, 5c85c294, d341e521 |
| IN-01, IN-03, IN-05, IN-06 | left, not trivial or owner-tied | |

38ae571a aligns two older suites (`tests/admin-bookings.test.ts`, `tests/BookingsTable.test.tsx`) with CR-01 and CR-02.

## Fixed Issues

### CR-01, CR-02, CR-03: pay-now money comes from the PaymentIntent

**Files:** new `lib/payments/pay-now.ts`; `lib/payments/cancel.ts`, `lib/payments/fee.ts`, `lib/no-show.ts`,
`lib/manage-view.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/admin/bookings/cancel/route.ts`,
`components/admin/CancelBookingDialog.tsx`, `lib/payments/alerts.ts`, `lib/payments/tick.ts`

- `loadPayNowFacts` reads the currency, what the PaymentIntent received and its refunds. Cancel, fee cap, refund, mails and
  alerts all use it.
- `linked_booking_id` has no writer in this repo, as the review suspected. The sibling is found through the shared
  `payment_intent_id`. The body of `create_round_trip_bookings` is not in the repo and the live database was not checked, but
  the code no longer depends on the column.
- The leg is derived on the server for every initiator. The route still accepts `leg` from an old tab and ignores it.
- A leg's share is `paid * leg / (outbound + return)`, the split of the checkout preview. The return leg takes the rest, so the
  two caps always add up to the payment, also with a promo.
- A one-way row also stores `leg: 'outbound'`: with no sibling and no leg amounts it owns the whole payment.
- A case on a pay-now row is opened in the payment's currency, for what is still held. A case in another currency moves nothing.
- `charge.refunded` reads the refund's leg before the charge total, so the last leg's refund cancels that leg only.
- The review did not mention this: **live events carry no `charge.refunds`**, so the old `metadata.leg` read never worked in
  production. The handler now lists the refunds from Stripe, and a failed read throws so Stripe redelivers.
- The manage page shows the leg's money from the PaymentIntent and falls back to a leg estimate when Stripe can not be read.
- A Stripe failure after the status change keeps the cancel: a free cancel answers `money_failed`, a late one `case_missing`.

**Coordinator's addition:** `refundsPayNow` and `isFeeEligible` now require the row to have left `unpaid`, and the manage page
promises nothing for such a row. Regression tests are in `tests/payments-paynow-money.test.ts`.

### CR-04: a failed refund has an exit

- Every decision works from what Stripe still holds, so a repeat sends only what is missing, also after a hand refund or a lost
  answer. A card row counts the refunds of its payment.
- A definitive failure releases the lock. A transient one keeps it, because the refund may have executed.
- After the lease (10 minutes) waive and another amount take over the lock, never on a row in `capturing`.
- A waive with everything already back closes the case with no Stripe call.
- New `close_refunded` on the fee route: strict schema, note required, no amount. It needs a refund failure on record or a
  refund at Stripe, moves no money, sends no client mail, ends the case as waived and clears the refund banner.
- To keep part of the money after a hand refund, the operator charges what is left: nothing moves and the receipt goes out.

### CR-05: no worker charges a cash booking

- The tick only reads Stripe: the stored id, else the customer's PaymentIntent list by metadata. The list is used instead of
  Search, which lags. Succeeded is recorded. Otherwise the row returns to `card_saved`, or `failed` if an earlier decline is on
  it, and the operator is alerted.
- A transient error in the operator's click does the same at once, even when the read fails too (D-21). The attempt stays, so
  a new click replays the same Stripe key.
- `settleBooking` can no longer claim an interrupted cash charge.
- The driver gets `cash_wait` while a charge runs. A tap on a dead charge reconciles and settles the cash. The amount stays on
  the screen during `capturing`.
- Beyond the review, closing the gap this leaves: a charge that executes after we gave up is adopted by the webhook. If the
  cash was already confirmed, the card money is refunded automatically and the operator alerted.
- `TRANSITIONS` gains `capturing -> card_saved` and `card_saved -> captured`. These are TS only: the SQL function has no
  transition list.

### Warnings

- **WR-01:** all three closers pass the wait from `evidence.threshold_min`; a receipt that fails is logged.
- **WR-02:** the no-show catch alerts. `open_case` on the fee route rebuilds the case from the row
  (`lib/payments/fee-reopen.ts`). A cancel qualifies only if the stored terms make it late at the logged cancel time and it was
  not Prestigo's. Offered on closed card and cash rows and on pay-now no-shows; a cancelled pay-now row gets it only after its
  `case_missing` alert, because most of those were simply refunded.
- **WR-03:** a placement keeps the card when the booking is a no-show or late by its stored terms. A pending case always offers
  `waive_fee`, which closes it with no money step when nothing is held. The re-read and alert after `openFeeCase` were not
  added: the two changes above already remove the dead end.
- **WR-04:** `voidLeftoverHold` runs on a release from `failed` or `expired` and after a paid recovery link. It cancels only a
  hold in `requires_capture`.
- **WR-05:** key `refund:<id>:fee:<case>:<amount>`, `metadata.fee_case`, and an `admin_action` ledger row `fee_refund:<refundId>`.
  `refund_observed` was not used: the manage page sums it for card rows and would count twice.
- **WR-06:** only a tag `f<n>` closes a case. Any other link payment is refunded through `refundDuplicatePayment`.
- **WR-07:** release on a cash row only when closed or for an unfinished checkout.
- **WR-09:** `cash_guarantee` keeps the agreed amount like `card_hold`.
- **WR-10:** the alert option was chosen, so settling stays allowed before the trip (CASH-04). The cancel leaves the
  `refund_failed` trail, answers `money_failed` and tells the operator to return the cash.
- **public WR-06:** `client_cancelled` goes out for every client cancel without a case, flagged late.

## Needs Owner

### WR-08: should an open debt block erasure?

Fixed now: tick steps B, C and F skip `anonymised_at` rows, so no retry, settle or mail reaches an erased person.

Open: `erasure_payment_open` still gives 0 for `failed`, `balance_due` and completed `card_saved` rows with a past pickup, so
the Stripe Customer is deleted and the debt becomes uncollectable. This is a legal and business choice, so 088 is unchanged:

- **Block erasure** until the debt is closed. It keeps the debt. It needs an exit first: a cancelled booking in `balance_due` has
  no operator action today, and an unconfirmed cash trip would block too.
- **Write the debt off** on erasure. Simple, and the money is lost.

IN-05 is the same function and should be decided with it. 088 is not applied yet, so either choice can go in there.

## Decide or Know Before Go-Live

- **Dialog amounts:** the admin cancel dialog still shows a row estimate for pay-now (pre-promo, EUR). The leg line now says
  "about". The real figures are in the case and in the refund. Showing them needs a Stripe read on open.
- **Blocked cancel:** two rows sharing a payment with no leg amounts answer `leg_amount_missing` and can not be cancelled.
  Every current writer sets both amounts, so only old or hand-edited rows can hit this.
- **Untagged partial refunds:** the Phase 27 default still cancels both legs for a Dashboard partial refund it can not match.
  It is not reachable live today, because `handleChargeRefunded` returns early unless `charge.refunded` is true, and Stripe sets
  that only on a full refund. So partial refunds change no status in production, and cancel and fee flows already set theirs.
- **Prestigo cancel during a hold placement:** inside the late window the card stays `card_saved` with no case. The row offers
  release and the failed release alerts.
- **Cash cancel mail:** a cancel of a `cash_settled` booking sends the client no mail, the same as a failed refund. The operator
  alert tells them to act.
- **Unpaid rows on My trips:** public WR-01 belongs to the public fixer. Only the money side is done here.

## Verification

Ran in the isolated worktree, not the main checkout, so re-run the gate after merging.

- **New tests:** every fix commit carries regression tests that fail on its parent's source. CR-01, CR-02 (cancel and manage),
  WR-01 to WR-10, public WR-06 and IN-04 were run failing before the fix. The CR-02 webhook tests (3 failures), CR-04 (13) and
  CR-05 (16) were written with their code, so they were proven afterwards by running them against the parent commit's source.
- **Tests that pass on the parent, because an earlier fix delivered that part:** the CR-03 late-cancel tests (CR-01, CR-02) and
  the CR-04 tests "same click after a refund by hand" and "finds the refund that did execute" (CR-01's PaymentIntent read). The
  CR-03 no-show tests do fail on the old `lib/no-show.ts` (5 failures).
- **Full suite:** 382 files passed, 2 skipped; 11,583 tests passed. Run with a temporary config using
  `resolve.preserveSymlinks`, removed afterwards. With the default config 7 files can not load `next-intl` through the
  `node_modules` symlink, which is an environment problem, not a test failure.
- **Flaky test:** `PaymentPanel` "422 closes the modal" failed in two loaded default-config runs and passed alone and in the final
  full run.
- **tsc:** no new errors, only the 8 known ones in `tests/`. **eslint:** clean on all 47 changed `.ts` and `.tsx` files.
- **Not done:** no real Stripe call and no browser check of the admin dialogs or the driver wait message. `refunds.list` and
  `paymentIntents.list` are proven against the fake only.

---

_Fixed: 2026-11-07_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
