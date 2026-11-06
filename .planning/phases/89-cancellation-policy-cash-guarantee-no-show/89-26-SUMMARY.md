---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 26
subsystem: payments
tags: [stripe, webhook, fee, cash-guarantee, dispute, refund, security]
requires:
  - phase: 89-06
    provides: "lib/payments/fee.ts (loadFeeCase, markFeeCharged), CardKind card_fee, fee recovery phase"
provides:
  - "card_fee classified and routed in dispatch.ts (payment_intent.succeeded -> charge_succeeded, payment_intent.payment_failed -> pi_failed -> handleCardChargeFailed)"
  - "charge-events.ts observation rows for card_fee: charge_succeeded:<pi> and fee_failed_obs:<pi> (ledger kind charge_failed)"
  - "handleRecoveryPaid closes a pending fee case through markFeeCharged (webhook actor, paid amount) and sends fee_charged keyed by the case"
  - "handleDispute and observeRefund cover cash_guarantee as well as card_hold"
affects: [89-27, 89-28]
tech-stack:
  added: []
  patterns:
    - "the pending case is read BEFORE the recovery transition so a read problem throws (Stripe redelivers) while nothing has changed; closing the case after the transition is best effort, logged, never thrown"
    - "the fee_charged email key email:fee_charged:<caseId> is shared with the operator-click path, so the two paths can never both mail"
key-files:
  created:
    - tests/payments-fee-webhook.test.ts
  modified:
    - lib/stripe-webhook/dispatch.ts
    - lib/stripe-webhook/charge-events.ts
    - lib/stripe-webhook/recovery-events.ts
key-decisions:
  - "charge-events.ts was edited although the plan's file list omits it: without card_fee in its SUCCEEDED_KINDS / failure filter the routed event wrote no observation row"
  - "A card_fee decline is observed as ledger kind charge_failed with key fee_failed_obs:<pi>; settle's own failure row and its recovery link stay the source of truth, the webhook adds no link, mail or state change"
  - "Only a case in status pending is closed; a waived or charged case is left alone and the charged email goes out as today"
  - "The case lookup runs only for a failed row (a fee never leaves balance_due), so Phase 88 balance_due recoveries do not touch the case table"
requirements-completed: [CASH-03, HOLD-06]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: ac78525e121f9c08c66a422ec98db8b7474d3df9
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 26: Webhook side of the fee engine Summary

**A card_fee PaymentIntent is now observed on success and failure, a paid fee recovery link closes the pending case as charged and sends fee_charged instead of charged, and disputes and refunds on cash_guarantee rows reach the operator and the ledger.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | card_fee through dispatch to the observation row (success, failure), refund on cash rows | 55487c7f |
| 2 | paid recovery link closes the case; dispute on cash bookings | c1f04332 |

Tracer verified end to end before expansion: `payment_intent.succeeded` with `kind card_fee` goes through the signed route and dispatch to one `charge_succeeded:<pi>` row (amount 4000, eur, webhook actor), no state change, never the legacy chain; a redelivery under the same or a fresh event id adds nothing.

## What was built

- `dispatch.ts`: `card_fee` in the succeeded list (route `charge_succeeded`) and in `handlePaymentFailed` (route `pi_failed` -> `handleCardChargeFailed`); `observeRefund` keeps rows with `payment_mode` `card_hold` or `cash_guarantee`.
- `charge-events.ts`: `card_fee` accepted by both observers; failure row key `fee_failed_obs:<pi>`.
- `recovery-events.ts`: for a `failed` row, the case is loaded first (`loadFeeCase`, pending only). After the transition to `captured`: `markFeeCharged(caseId, { decidedBy: 'webhook', decidedMinor: paid })` and `sendPaymentEmail({ kind: 'fee_charged', variant, eventKey: email:fee_charged:<caseId>, feeMinor, freeUntil })` in place of the charged email. No pending case: the charged email as before. The second event of the same payment returns at the existing `moved.duplicate` check, so nothing changes and nothing is sent. `handleDispute` accepts `card_hold` and `cash_guarantee`.
- `tests/payments-fee-webhook.test.ts`: 17 tests (classification, observation and redelivery, failure observer without hold-failure side effects, no-booking acknowledgement, refund on cash vs pay_now, case closing with the paid amount and webhook actor, no_show variant, duplicate event, no case, waived case untouched, duplicate-refund path leaves a pending case alone, source check that the webhook files never name the case table, dispute on cash and on a fee PaymentIntent matched through metadata, pay_now not alerted).

## Verification

- `npx vitest run` on payments-fee-webhook (17), webhooks-stripe-payments, payment-state-writers-gate, payments-fee, payments-failure, payments-settle: 6 files, 247 passed.
- `npx tsc --noEmit`: nothing in `lib/` or `app/`. `npx eslint --quiet lib/stripe-webhook tests/payments-fee-webhook.test.ts`: exit 0.

## Deviations from Plan

**1. [Rule 3 - Blocking] `lib/stripe-webhook/charge-events.ts` modified (not in the plan's file list)**
- **Issue:** the plan's tracer needs the observation row, but `handleCardChargeSucceeded` returned early for any kind outside `SUCCEEDED_KINDS` and `handleCardChargeFailed` for anything but card_charge / card_difference, so routing alone would have written nothing.
- **Fix:** card_fee added to both filters, with its own failure key.
- **Commit:** 55487c7f

**2. [Process] the two commits do not split the test file by task**
- `tests/payments-fee-webhook.test.ts` is one file and went in with the Task 1 commit, so its Task 2 tests do not pass at 55487c7f alone; at c1f04332 and after, all 17 pass.

## Notes for the orchestrator and later plans

- If the process dies between the recovery transition and `markFeeCharged`, the row is `captured` for exactly the fee and the case stays pending. The operator's repeat charge click then reconciles it (89-06 `runFeeCharge`: settle `noop` with the captured amount equal to the fee closes the case and sends the receipt once). The second webhook delivery does not heal it by design (it returns at the duplicate check).
- `fee_charged:no_show` needs `waitMin`, which comes from the booking's stored cancel policy, exactly as in the operator-click path (89-06 passes none either). A no-show booking without a stored policy would log `[payment-email] render failed` and send nothing; the case still closes.
- No new Stripe event type is needed; `charge.refunded` and `charge.dispute.created` were already subscribed. `infra/stripe/webhook-events.mjs` untouched (not in the plan's file list).
- No migration, no real Stripe call, no `.env.local` read.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-73: no unsigned path added, routing still starts after the signature check; the case is only closed from a verified `card_recovery` payment on a failed row. T-89-74: `handleDispute` covers `cash_guarantee`, asserted by test.

## Self-Check: PASSED

- tests/payments-fee-webhook.test.ts, lib/stripe-webhook/{dispatch,charge-events,recovery-events}.ts, this SUMMARY: FOUND
- commits 55487c7f, c1f04332: FOUND on branch worktree-agent-ab27bb85703793d2d
