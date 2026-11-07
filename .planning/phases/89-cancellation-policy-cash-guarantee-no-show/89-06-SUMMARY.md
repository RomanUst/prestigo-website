---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 06
subsystem: payments
tags: [stripe, settle, fee, cash-guarantee, cancellation-policy, idempotency, security]
requires:
  - phase: 89-01
    provides: "migration 087 (booking_fee_cases, cash_settled state, fee_opened ledger kind), fake DB with the 087 tables"
  - phase: 89-25
    provides: "fee_charged, payment_failed:fee emails and the charge_failed alert wording"
provides:
  - "lib/payments/fee.ts: feeBaseFor, isFeeEligible, openFeeCase, loadFeeCase, lockFeeAmount, unlockFeeAmount, markFeeCharged, markFeeWaived, runFeeCharge, runCashCardCharge (the only writer of booking_fee_cases)"
  - "settleBooking opts.collect: { kind: 'fee'; caseId; amountMinor; feeLabel? } | { kind: 'cash_card' }, exported type SettleCollect"
  - "stripeKeys.feeCapture (feecap:<caseId>:<n>), stripeKeys.feeCharge (fee:<caseId>:<n>), CardKind card_fee"
  - "FailurePhase fee in recovery.ts (link tag f<attempt>, payment_failed variant fee, charge_failed alert, cash_guarantee accepted for this phase only)"
affects: [89-08, 89-10, 89-13, 89-26, 89-27, 89-28]
tech-stack:
  added: []
  patterns:
    - "an explicit opt-in on the one collector (opts.collect) instead of a second collector: the Phase 88 gates stay in force for every caller that does not pass it"
    - "amount lock on the case row (decided_minor + charge_requested_at), Stripe keys from case id + attempt, a definitive decline advances the attempt and unlocks"
    - "an operator click is on record first (admin_action ledger row with a short errorCode and a random key suffix), free text only on the deny-all case row"
key-files:
  created:
    - lib/payments/fee.ts
    - tests/payments-fee.test.ts
  modified:
    - lib/payments/settle.ts
    - lib/payments/stripe.ts
    - lib/payments/recovery.ts
    - lib/payments/tick.ts
    - tests/payments-failure.test.ts
key-decisions:
  - "Collect mode never schedules an automatic retry (payment_retry_at null) and has no difference branch; the caller (fee.ts) sends the receipt, settle sends no 'charged' mail"
  - "A fee larger than the live hold is not partly captured: the saved card pays the exact fee and the small hold is cancelled best effort afterwards (the case never ends short)"
  - "runFeeCharge reconciles a click whose answer was lost: settle answers noop 'captured' and the row's captured amount equals the fee, so the case is closed and the receipt sent once (event key dedupes)"
  - "markFeeWaived also requires charge_requested_at null, so a waive can not race a charge that holds the amount lock"
  - "openFeeCase returns { caseRow, created } and throws on a partner booking; lockFeeAmount does the optimistic conditional update twice at most and distinguishes locked / amount_locked / action_not_allowed with one read"
  - "tick step F skips rows with a fee_case_status: its ledger re-drive can not tell a fee failure from a trip charge failure and would send the wrong notice for the wrong amount"
patterns-established:
  - "fee outcomes: runFeeCharge answers { outcome: 'ok' | 'declined' } | { error: 'amount_locked' | 'payment_busy' | 'action_not_allowed' } (same for runCashCardCharge without amount_locked)"
requirements-completed: [CASH-03, HOLD-06]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: 71ad3bce553489f6550b0c94d0e41049330ccbc2
plan_head_after: 11f8b36858d2f407ecd7040f0faacdd1727a0dcb
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 06: Teach the one collector to take a fee Summary

**settleBooking now collects a person-chosen fee (partial capture of a live hold, or the saved card off-session) and charges the card of a cash booking, behind an explicit opts.collect, with the amount locked on the case and Stripe keys that come from the case id and the attempt, never from the amount.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | late-cancel case with a live hold through lockFeeAmount and settleBooking to a partial capture, case charged, fee_charged receipt | 48fe5e0b |
| 2 | lapsed hold, decline, transient and cash card paths, D-21 suppression, tests | 11f8b368 |

Tracer verified end to end before expansion: a cancelled card_hold booking with a 10000 hold and a late_cancel case of base 10000, fee 4000: one `paymentIntents.capture` with `amount_to_capture: 4000` and key `feecap:<caseId>:0`, row `captured` with `captured_amount_minor` 4000, no difference charge, case `charged` with `decided_minor` 4000 and `decided_by` / `decided_at` set, `bookings.fee_case_status` mirrored to `charged`, one `fee_charged` receipt keyed `email:fee_charged:<caseId>`, and no Phase 88 `charged` mail.

## What was built

- `settle.ts`: `opts.collect` (`SettleCollect`). `assertMoneyEligible` stays first. With collect the old `card_hold` and `isCompleted` gates are replaced by `collectGate` (fee: card_hold or cash_guarantee, status cancelled / no_show / completed, integer amount between 1 and the row amount; cash_card: cash_guarantee, status not cancelled / no_show), all evaluated before the CAS claim. Without collect those two gates are byte-for-byte what they were. `cash_settled` joined `SETTLED_STATES` (a settled cash row answers `noop`, no Stripe call). In collect mode: due is the case amount (or the row amount for cash_card), a cash booking never looks at a hold, fee keys `feecap:` / `fee:` and metadata kind `card_fee`, `chg:` for cash_card, no difference branch, no `charged` email, `payment_retry_at` always null on failure. `grep -c amount_to_capture` is still 1. Header comment rewritten ("No code path collects before the trip is completed" was no longer true without a qualifier).
- `fee.ts`: described in `provides`. Only the case table is written; payment_state is never written (the single-writer gate test passes); free text (reason, contact note) lives on the case row, the ledger keeps `fee_charge` / `cash_card_charge` codes, the amount and the currency.
- `recovery.ts`: `FailurePhase` `fee`; link tag `f<attempt>`; alert kind `charge_failed`; the email is `payment_failed` variant `fee` with `feeMinor` and `feeLabel` (cancellation, no_show, trip); `cash_guarantee` accepted after the partner gate for the fee phase only; the Phase 88 phases are untouched.
- `stripe.ts`: `feeCapture`, `feeCharge`, `card_fee`.
- `tick.ts`: the `FAILURE_ALERT_KIND` map had to become total for the new phase (type error), and step F now skips rows that have a fee case (see deviations).

## Verification

- `npx vitest run` on payments-fee (40 tests), payments-failure (28), payments-settle, payments-engine-gates, payment-state-writers-gate, payments-tick, payments-lifecycle, payments-review-engine, payments-hold, admin-payment-api, payments-state, payments-emails, payments-alerts, webhooks-stripe-payments: 14 files, 883 passed. Every existing test in `tests/payments-settle.test.ts` passes unchanged.
- `npx tsc --noEmit`: no error outside `tests/`, none in the touched tests. `npx eslint --quiet lib/payments tests/payments-fee.test.ts tests/payments-failure.test.ts`: exit 0.
- Mutation check: removing the new `fee_case_status` filter from tick step F makes the new tick test fail, restoring it makes it pass.
- Acceptance tests named in the plan: zero `paymentLinks.create`, zero mails and zero alerts for a declined cash card charge before completion (payments-fee with the recovery mock, payments-failure end to end with the real sender); two clicks with different amounts around a decline give `fee:<id>:0` and `fee:<id>:1`, and one around a transient answers `amount_locked` with no Stripe call.

## Deviations from Plan

**1. [Rule 3 - Blocking] `lib/payments/tick.ts` touched (not in the plan's file list)**
- **Found during:** Task 1 (tsc)
- **Issue:** `FAILURE_ALERT_KIND: Record<FailurePhase, ...>` stopped compiling when `FailurePhase` gained `fee`.
- **Fix:** added `fee: 'charge_failed'` to the map.
- **Commit:** 48fe5e0b

**2. [Rule 1 - Bug] tick step F would re-send a fee failure as a trip charge failure**
- **Found during:** Task 1, reading step F after the type fix
- **Issue:** step F re-drives `failed` card_hold rows that are not cancelled / no-show and decides the phase from the ledger (`charge_failed` means phase charge). A fee that failed on a `completed` booking has the same ledger kind, so the re-drive would have created a link and mail for the full trip amount instead of the fee.
- **Fix:** step F selects only rows with `fee_case_status` null. Covered by a test that fails without the filter.
- **Commit:** 48fe5e0b (filter), 11f8b368 (test)

**3. [Rule 3 - Ordering] `recovery.ts` changes landed in the Task 1 commit**
- The plan lists `recovery.ts` under Task 2, but `settle.ts` imports `PaymentFailureInput` with the `fee` phase and does not compile without it. The recovery behaviour is proven in Task 2's tests.

**4. [Rule 2 - Missing functionality] a fee larger than the live hold**
- The plan says to skip the difference branch, which would leave a case short when the hold is smaller than the fee (possible after a price rise, D-16). A fee is the exact decided amount: when `amount_capturable < fee` the hold is not used, the saved card is charged the exact fee under `fee:<caseId>:<n>`, and the leftover hold is cancelled best effort after the capture (key `pi_void:<pi>`).

**5. [Rule 2 - Missing functionality] reconcile of a lost answer in `runFeeCharge`**
- If the money moved but the case was not closed (crash between settle and `markFeeCharged`), a repeat of the click would have answered `action_not_allowed` forever with the amount locked. It now detects settle `noop` with the row captured for exactly the fee, closes the case and sends the receipt once.

**6. [Rule 2 - Hardening] `markFeeWaived` and `lockFeeAmount` tightenings**
- `markFeeWaived` requires no charge in flight (`charge_requested_at` null). `lockFeeAmount` refuses an amount above `base_minor` or below one cent as `action_not_allowed` before touching the table (the table CHECK would otherwise throw). The plan's `.or(...)` condition is implemented as the conditional update on `charge_requested_at IS NULL` plus one read for the same-amount case, because the shared fake DB has no `.or` and a second conditional update is not needed.

Process note: the plan-head ledger file could not be written from the sandbox (compound git command refused); `plan_head_before` is the dispatch base and `commits` was measured with `git rev-list --count 71ad3bce..HEAD` (2 before this SUMMARY commit).

## Notes for the orchestrator and later plans

- Webhook routing of `metadata.kind = card_fee` is plan 89-26; the recovery link of a fee is a normal `card_recovery` link (same `createRecoveryPaymentLink`, tag `f<attempt>`); I did not read the webhook side, so 89-26 must check how a paid fee link should close the case (markFeeCharged) and the row.
- After a fee is captured the row is `captured` with `captured_amount_minor` below `payment_amount_minor`. `allowedPaymentActions` gives a closed booking `release` only, so no link for "the rest of the fare" is offered; plans that add actions on closed bookings (89-10) must not derive an amount owed from `payment_amount_minor - captured_amount_minor` for a row with a fee case.
- `runFeeCharge` / `runCashCardCharge` expect the caller to have authenticated the admin, validated the amount (integer, 1..base), and loaded the case (`loadFeeCase`). `openFeeCase` is idempotent per booking; the cancel / no-show routes (89-08, 89-13) call it with `feeBaseFor` and the evaluated policy.
- The audit key of an operator click is `admin:fee_charge:<caseId>:<ms>:<8 random chars>` and `admin:cash_card_charge:<bookingId>:<ms>:<8 random chars>`.
- `booking_payment_notes` (cash_card_charge note) is not written here; the route that takes the operator's note owns it.
- No migration, no Stripe call against the real API, no `.env.local` read.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-18 (amount lock, CAS claim, case-derived keys), T-89-19 (the amount never enters a key; test asserts every key matches `fee:<uuid>:<digit>`), T-89-20 (`collectGate` before the claim, partner gate first), T-89-21 (admin_action row first, decided_by / decided_at on the case), T-89-22 (reason and note asserted absent from the ledger).

## Self-Check: PASSED

- lib/payments/fee.ts, tests/payments-fee.test.ts, this SUMMARY: FOUND
- commits 48fe5e0b, 11f8b368: FOUND on branch worktree-agent-a5bc9d286c6c16729
