---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 13
subsystem: payments
tags: [tick, cron, fee-case, reminder, cash-guarantee, idempotency, security]
requires:
  - phase: 89-06
    provides: "settleBooking opts.collect (fee, cash_card), fee.ts markFeeCharged / unlockFeeAmount, case-derived Stripe keys, tick step F skipping rows with a fee case"
  - phase: 89-10
    provides: "cash_guarantee rows and their checkout_pending state (the reconcile it left open)"
  - phase: 89-25
    provides: "fee_pending_24h alert kind, fee_charged receipt with variants"
provides:
  - "lib/payments/tick.ts step R (registered after F): one fee_pending_24h reminder per undecided case, finish of an interrupted fee or cash card charge, repair of a case whose money arrived"
  - "step E selects cash_guarantee as well as card_hold (a missed webhook on a cash checkout is reconciled by the webhook's own code)"
  - "tick result counts fee_reminders, fees_finished, fee_cases_repaired"
affects: [89-14, 89-15, 89-26, 89-27, 89-28]
tech-stack:
  added: []
  patterns:
    - "a sweep re-drives only a charge a person asked for: the marker is the amount lock the operator click wrote on the case (charge_requested_at + decided_minor), never a state the sweep inferred"
    - "re-drive = the same settleBooking call with the amount read back from the locked case, so attempt number and Stripe key are the interrupted attempt's"
    - "selection of fee work starts from bookings.fee_case_status, so a booking without a case is never visited (D-19, D-21 by construction)"
key-files:
  created: []
  modified:
    - lib/payments/tick.ts
    - tests/payments-tick.test.ts
key-decisions:
  - "Step R calls settleBooking directly instead of runFeeCharge: runFeeCharge writes an admin_action ledger row per call, which would be a false 'operator click' on every sweep. The close (markFeeCharged + fee_charged receipt) is a small copy of fee.ts closeCharged inside tick.ts, because fee.ts is outside this plan's file list; the receipt event key email:fee_charged:<caseId> keeps a repeat a no-op"
  - "Reminders run last and skip a case closed in the same run, so a fee finished by the sweep is never followed by a 'still undecided' mail"
  - "The earlier-hold rule reminds only while the hold is live (payment_state authorized and capture_before within EXPIRING_HOLD_ALERT_MS); a released or captured row with a stale capture_before gets no early reminder"
  - "A locked amount does not suppress the reminder: a click that died before its settle claim leaves a lock and an authorized row, and the 24 h mail is then the only thing that reaches the operator"
  - "Cash card re-drive is selected by the row alone (cash_guarantee, capturing, lapsed lease, no fee case); that state exists only after an operator's cash_card_charge claimed it"
patterns-established:
  - "tick step counts for a step are named for what happened (fee_reminders, fees_finished, fee_cases_repaired) and summed by runPaymentTick"
requirements-completed: [CASH-03, HOLD-06]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: ac78525e121f9c08c66a422ec98db8b7474d3df9
plan_head_after: f5d4e2e6d6ac6190c430ccfe96c75bf9d22e7059
actuals:
  tokens: 15000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 13: Tick step R, the background half of the operator decision Summary

**The payment tick now reminds the operator once about a fee case that is still undecided after 24 h (earlier when the hold ends sooner), finishes a fee or cash card charge that a crash interrupted with the very same Stripe keys, closes a case whose money arrived, and reconciles cash checkouts after a missed webhook; it opens no case, charges nothing a person did not ask for and cancels nothing.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | open case through step R to one fee_pending_24h reminder, earlier when the hold ends sooner | 5cb74ffb |
| 2 | finish interrupted charges, repair closed money, reconcile cash checkouts | f5d4e2e6 |

Tracer verified end to end before expansion: a pending case opened 25 h ago gave one `[Fee] Still undecided after 24 h` mail keyed `alert:fee_pending:<caseId>` (ledger `alert_sent`), a second tick sent nothing, and no Stripe call or state change happened. A case opened 2 h ago with no hold stayed quiet; with `capture_before` in 10 h it reminded at once; with `capture_before` in 72 h it stayed quiet.

## What was built

- **Step R** in `lib/payments/tick.ts` (`TickStepCode` 'R', registered last in `TICK_STEPS`, file header updated):
  1. Selects bookings with `fee_case_status = 'pending'` and pairs each with its pending case through a second query by booking id.
  2. Fee re-drive: a pair whose case has `charge_requested_at` and `decided_minor`, and whose row is `capturing` with a lapsed lease, goes through `settleBooking(id, tick_sweep, { collect: { kind: 'fee', caseId, amountMinor: decided_minor, feeLabel } })`. On `captured` the case closes (`markFeeCharged`, decided_by `tick_sweep`) and the `fee_charged` receipt goes out once. On a decline the amount is unlocked (`unlockFeeAmount`), settle's failure step has already sent the link, mail and alert, and nothing is retried. Busy or transient waits for the next tick. A `noop` on an already captured row for exactly the fee closes the case.
  3. Repair: a row `captured` with `captured_amount_minor` equal to the locked fee and a pending case closes the case with no Stripe call.
  4. Cash card re-drive: `cash_guarantee` rows in `capturing` with a lapsed lease and no fee case go through `settleBooking` with `{ kind: 'cash_card' }`, ordinary `chg:<id>:<attempt>` key, one `fee_charged` receipt (`cash_card`, or `cash_unpaid` once the trip is completed).
  5. Reminder: `sendPaymentOperatorAlert('fee_pending_24h', ...)` with the Surface 8.3 details (proposed fee, free period end, open since, hold end from the booking; no-show evidence read from the case: `on_location_at`, `requested_at`, `threshold_min`). Cases closed in the same run are skipped.
  Each row is isolated; a problem adds `R` to `errors` and the next row still runs.
- **Step E**: `.in('payment_mode', ['card_hold', 'cash_guarantee'])`. This closes the item 89-10 left open: the reconcile runs the same `applySetupSucceeded` the webhook runs, which already handles the cash variant (no hold scheduled, cash email).
- Steps A to D and F are unchanged. The tick source still contains no `card_flow_mode` (checked by a test and by `tests/payment-state-writers-gate.test.ts`).

## Verification

- `npx vitest run tests/payments-tick.test.ts tests/payment-state-writers-gate.test.ts`: pass. 14 related files (payments-tick 77, payments-fee, payments-failure, payments-settle, payments-lifecycle, payments-alerts, payments-review-engine, card-checkout-cash, infra-qstash-schedule, outbox-sweep, middleware-csrf-forms, writers gate): 389 tests, 0 failures. payments-tick run 8 times in a row, stable.
- `npx tsc --noEmit`: nothing in `lib/`, `app/` or the touched tests. `npx eslint --quiet lib/payments/tick.ts tests/payments-tick.test.ts`: exit 0.
- Mutation check: replacing the `charge_requested_at` guard in step R with a default makes the T-89-45 test and the "never locked" repair test fail; restoring it makes them pass.
- Named acceptance tests: a re-driven fee uses the same key as the interrupted attempt (`feecap:<caseId>:0` on both captures, `amount_to_capture` 4000); no charge on a case without `charge_requested_at` (T-89-45); two overlapping ticks finish the fee once (T-89-46); a declined re-drive unlocks the case, calls `handlePaymentFailure` with phase `fee`, and two later ticks create no second PaymentIntent; a completed cash booking in `card_saved` gets no case, no mail, no change (D-21); an unpaid booking past its alert window keeps its status (D-19); a stale cash `checkout_pending` row is reconciled with actor `tick_reconcile`.

## Deviations from Plan

None in behaviour. Notes on how the plan was read:

- The plan says "settleBooking with opts.collect amount from decided_minor"; the close after a capture needs `closeCharged` from `fee.ts`, which is not exported and not in this plan's file list. Rather than touch `fee.ts` (other plans in the wave may), the 12-line close is repeated in `tick.ts` and uses only exported helpers.
- `decided_by` on a case closed by the sweep is `tick_sweep`, not the operator; the operator's identity stays on the `admin_action` ledger row written by the original click (89-06).

## Issues Encountered

- A test of mine flaked once in about 4 runs: the interrupted click and the tick ran in the same millisecond, and the claim ledger key `capture_started:<attempt>:<ms>` then collided, so the claim was refused as busy. Production ticks never run in the click's millisecond; the test now waits 5 ms after the click.
- The per-plan head ledger file could not be written from the sandbox (git dir is outside the worktree), as in 89-06; `plan_head_before` is the dispatch base and `commits` was measured with `git rev-list --count` (2 before this SUMMARY commit).

## Notes for the orchestrator and later plans

- A fee charge whose click died BEFORE the settle claim (case locked, row still `authorized`) is not re-driven: only a row the settle claimed (`capturing`) is. The operator is reached by the 24 h reminder, and the same click repeated replays the same amount. If the owner wants those finished automatically too, it is a one-line widening of the state check, but it would start a charge from a lock alone.
- Pending cases are read oldest pickup first, 100 per run. A backlog above 100 undecided cases would starve the newest ones; far above any real volume for one operator.
- The reminder for `no_show` reads the evidence keys that plan 89-09 stores (`on_location_at`, `requested_at`, `threshold_min`); a missing key is simply omitted from the mail. For `late_cancel` "Cancelled at" shows the case's `opened_at` (bookings has no cancelled_at column).
- Unchanged by design: no case for a cash booking without a driver confirmation (D-21), no automatic cancel of an unpaid booking (D-19; the existing 24 h `no_valid_hold_24h` alert of step D is untouched).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-45 (re-drive only with `charge_requested_at` and a locked `decided_minor`; mutation-tested), T-89-46 (same keys because the settle reads the attempt from the row, claim by CAS with lease, receipt and alert event keys; overlapping-ticks test).

## Self-Check: PASSED

- lib/payments/tick.ts, tests/payments-tick.test.ts, this SUMMARY: FOUND
- commits 5cb74ffb, f5d4e2e6: FOUND on branch worktree-agent-a7ef1cdddba11adfa
