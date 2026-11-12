---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 08
subsystem: payments
tags: [stripe, off-session, extra-charge, admin-route, webhook, security]
requires:
  - "91-01: booking_extra_charges, ledger kinds extra_charged / extra_failed (migration 089 live)"
  - "91-02: waitingRate in lib/pricing-config.ts, extraWaitingBlocks / extraWaitingAmountMinor in lib/stops.ts"
  - "91-05: consentCoversExtras, extra_charged email kind"
provides:
  - "lib/payments/extra.ts: loadExtraContext, isExtraChargeEligible, previewWaitingExtra, runExtraCharge, resumeExtraCharge, finalizeExtraFromWebhook"
  - "GET and POST /api/admin/bookings/[id]/extra"
  - "stripeKeys.extra, card kind card_extra, metadata key extraChargeId"
  - "display action charge_extra in FeeRouteAction"
  - "webhook routing of card_extra (dispatch.ts, charge-events.ts)"
affects: [91-11 admin extras modal]
tech-stack:
  added: []
  patterns:
    - "row-as-lock: partial unique index (one charging row per booking) + ledger-first admin_action"
    - "two witnesses, one outcome: synchronous answer and webhook share ledger keys and a compare-and-set on charging"
key-files:
  created:
    - lib/payments/extra.ts
    - app/api/admin/bookings/[id]/extra/route.ts
    - tests/admin-extra-route.test.ts
    - tests/extra-charge.test.ts
    - tests/extra-webhook.test.ts
  modified:
    - lib/payments/stripe.ts
    - lib/payments/actions.ts
    - lib/stripe-webhook/dispatch.ts
    - lib/stripe-webhook/charge-events.ts
key-decisions:
  - "Eligibility lives in extra.ts (needs consent version and in-flight row); allowedPaymentActions keeps its signature"
  - "Success order: ledger extra_charged first, then CAS charging->charged, receipt only by the writer that flips the row"
  - "Failure order: CAS charging->failed first, then extra_failed ledger row (key extra_failed:<id>:<attempt>)"
  - "Resume lease is measured from updated_at (bumped on take-over, conditional on the value read), so repeated resumes cannot overlap"
  - "A config / idempotency Stripe error is treated like a transient one (row stays charging), per isNotTheClientsFault"
  - "Observation row for a failed card_extra uses ledger kind charge_failed with key extra_failed_obs:<pi>; the row outcome is extra_failed"
status: complete
commits: 3
plan_head_before: 8d16038928b07bfc3ed103fe050970e8097fda46
plan_head_after: 8605c8ce
actuals:
  tokens: 70000
  tasks: 3
  commits: 3
---

# Phase 91 Plan 08: Operator extra charge to the saved card Summary

The operator can bill waiting beyond the booked time, or another agreed amount, to the client's saved card as a separate off-session `card_extra` PaymentIntent: one charge per click, the amount the operator saw, ledgered, never for GNet, never automatic, never touching the booking's own payment.

## What was built

- **Engine (`lib/payments/extra.ts`)**: eligibility matrix (D-15: completed, non-partner, card_hold + captured, or cash_guarantee with a saved card in card_saved / cash_settled / captured / failed; D-12 consent via `consentCoversExtras`; in_flight). `runExtraCharge` writes the `admin_action` ledger row before Stripe, inserts the charging row (23505 -> `payment_busy`), creates the off-session PaymentIntent (key `extra:<chargeId>:<attempt>`, metadata `card_extra` + `extraChargeId`), then settles from the answer. Waiting amount = `ceil(minutes/15)` x class rate, one rounding to whole EUR, converted to the row's currency, checked against `expected_amount_minor` before any write (409 `amount_changed`). 'other' amounts: integer 1..99 999 999, no business cap. Decline -> row failed + `extra_failed`, no email, no retry. Transient -> row stays charging, `payment_busy`; `resumeExtraCharge` after `LEASE_SECONDS` replays the same key and amount.
- **Route**: GET `?minutes=N` preview (no-store), POST discriminated strict schemas (`waiting`, `other`, `resume`), guard order identical to the fee route, 409 `payment_busy` for an in-flight row, 500 `Payment action failed` with ids only in the log.
- **Stripe**: `stripeKeys.extra`, `CardKind` gains `card_extra`, `cardMetadata` accepts `extraChargeId`.
- **Webhook**: `card_extra` succeeded routes like `card_fee`; failed goes to `handleCardChargeFailed` (never `handleHoldFailed`); observation key `extra_failed_obs:<pi>`; `finalizeExtraFromWebhook` finishes a still-charging row with the same ledger and email keys as the synchronous path.
- **Actions**: `'charge_extra'` added to `FeeRouteAction` (type only).

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 (tracer) | 84d89117 | engine 'other' path, route, stripe key / kind / metadata, tracer + guard tests |
| 2 | b9aec552 | eligibility matrix, waiting preview and amount check, decline / transient / resume, GET, charge_extra |
| 3 | 8605c8ce | card_extra webhook routing and finalisation, webhook tests |

## Verification

- `npx vitest run` on admin-extra-route, extra-charge, extra-webhook, payment-state-writers-gate, payments-fee-webhook, webhooks-stripe-payments, webhooks-stripe, admin-payment-api, webhook-isolation-guard: 422 passed. Also admin-fee-route, payments-engine-gates, payments-fee, payments-review-engine, card-checkout-intent, payments-stripe-errors, payments-settle: all green.
- `npx tsc --noEmit`: no error in `lib/`, `app/` or the new tests (only the old `tests/` baseline).
- `npx eslint --quiet` on all touched ts files: clean.
- The `verify` skill was run for Task 1 (types, lint, related tests, invariants); for Tasks 2 and 3 the same checks were run by hand per commit. No hard-coded prices, no secrets; no messages/*.json touched.

## Deviations from Plan

None of Rules 1-4 triggered. Notes:

- The plan commit ledger file under the git dir was not written (sandboxed shell); `commits` was measured against the known base SHA `8d160389` with `git rev-list --count` (3 task commits).
- Task 1 shipped a GET that only checked admin and id (a 422 stub, as the plan said); the full GET and the `resume` schema arrived in Task 2.
- `ExtraChargeRow` gained an optional `updated_at` (not in the plan's interface) because the resume lease is measured from it.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-91-25 (admin guard before parsing, eligibility re-checked on a fresh row and context in route and engine), T-91-26 (partial unique index, `payment_busy`, key without amount, resume same key), T-91-27 (strict schemas, currency from the row, `amount_changed`), T-91-28 (partner refused in eligibility, preview and webhook), T-91-29 (explicit `card_extra` routing, PI id only on the extra row and ledger, refund test), T-91-30 (`consentCoversExtras` on the latest consent, receipt email), T-91-31 (description only on the row; tests grep ledger and console) are mitigated and tested.

## Notes for downstream plans

- 91-11 should append `'charge_extra'` to the payment GET from `isExtraChargeEligible(booking, await loadExtraContext(id))`, and use `GET /extra?minutes=N` for the confirm step, then POST `expected_amount_minor` equal to the previewed `amount_minor`.
- The route answers `422 { error: 'action_not_allowed', reason }` with `reason` in `partner | not_completed | payment_mode | no_saved_card | consent_not_covered | in_flight` (the POST answers an in-flight row as `409 payment_busy`).
- Unreachable-from-here follow-up: if a `card_extra` PaymentIntent succeeds on a row already recorded as failed, the webhook only logs ids (`[webhook] card_extra succeeded on a failed charge`); there is no operator alert for it yet.

## Self-Check: PASSED

- lib/payments/extra.ts, app/api/admin/bookings/[id]/extra/route.ts, tests/admin-extra-route.test.ts, tests/extra-charge.test.ts, tests/extra-webhook.test.ts: found.
- Commits 84d89117, b9aec552, 8605c8ce: found on branch worktree-agent-a4e4d9ddcc8a68287.
