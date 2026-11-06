---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 08
subsystem: payments
tags: [cancellation, policy, fee-case, stripe, admin-route, security]
requires:
  - phase: 89-03
    provides: "policyFromSnapshot, evaluateCancellation, proposedFeeMinor, tripFactsFromRow"
  - phase: 89-04
    provides: "manage token (the client page that will call cancelBooking)"
  - phase: 89-06
    provides: "openFeeCase, loadFeeCase, isFeeEligible, feeBaseFor"
provides:
  - "lib/payments/cancel.ts: cancelBooking, CancelInitiator, CancelResult"
  - "admin cancel route: cancelled_by ('client' | 'prestigo') required, thin mapping of CancelResult"
  - "releaseHold accepts cash_guarantee; abandonHoldForClosedBooking keeps the card when a fee case is pending"
affects: [89-09, 89-11, 89-13, 89-16, 89-27]
key-decisions:
  - "CancelResult gained { kind: 'not_found' } and db_failed carries an optional cancelled flag; ok carries an optional refundId (the route answers it as refund_id)"
  - "The fresh payment read after the status CAS decides both the case (late) and the money step (in time); the pre-read decides only the checks that write nothing"
  - "A late cancel whose case can not be opened (or has no computable base) answers db_failed with cancelled: true; the route answers 500 { cancelled: true }"
  - "Status rules come from VALID_TRANSITIONS and TERMINAL_BOOKING_STATUSES (booking-status-parity bans hand-written status lists); a client additionally can not cancel on_board"
  - "An unreadable pickup instant: an operator cancel is free (nothing is charged on a guess), a client cancel answers too_late"
  - "No email on a late cancel (plan 89-27 owns the notices); free paths keep the scheduleCancelRouteEmail arguments of Phase 88, also for client_token"
  - "The admin_action ledger row (cancel_client / cancel_prestigo, key admin:cancel:<bookingId>) is written after the CAS, only for admin initiators on a booking with a card, cash or paid pay-now money flow"
requirements-completed: [HOLD-06, CANC-01]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: ac78525e121f9c08c66a422ec98db8b7474d3df9
plan_head_after: 1b19b657 (code commits; this SUMMARY follows)
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 08: One cancellation orchestrator Summary

**cancelBooking decides by the policy the booking was made under, runs the status compare-and-set first, and on a late cancel leaves the hold, the saved card and money already paid exactly as they are while opening the fee case in the same request. An in-time cancel releases, frees or refunds with nobody involved.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 2 | Hold engine fixes: pending case keeps the card on an abandoned hold, releaseHold accepts cash | debf6147 |
| 1 | cancelBooking, thin admin route, full money matrix (the whole matrix landed with the orchestrator, see Deviations) | 1b19b657 |

Tracer verified end to end in `tests/payments-cancel.test.ts` (real route, real cancelBooking, stateful fakes): an admin client-cancel of a late authorized booking answers `{ ok: true, late: true }`, status cancelled, payment_state authorized, the PaymentIntent still requires_capture, no cancel and no refund call at Stripe, one pending case with the proposal from the stored percent, an `admin_action` row `cancel_client`. Expansion followed after that passed.

## What was built

- `lib/payments/cancel.ts`: order is checks that write nothing (exists, status allowed for the initiator, outcome from the stored policy, acknowledge, busy, per-leg amount) then the status CAS (`advanceBookingStatus`, profile cancel-route, source `admin_cancel` / `client_cancel`, actor admin or system `client_token`), then `admin_action`, then a fresh payment read, then either the late branch (case + recovery link retirement, result `money: 'kept'`) or the in-time branch (collected money refunded with `refund:<id>:full`, else `releaseHold`, pay-now refund with the leg key). `moneyFailed` keeps the ledger key `refund_failed:<id>:<leg>` and alert key of Phase 88.
- `admin_prestigo` forces free; `admin_client` after the pickup counts as late; `client_token` is refused on on_board, completed, no_show, and at or after pickup; a stale or missing acknowledgement answers `policy_changed` and writes nothing; a repeat answers `already_cancelled`.
- Late recovery link: for `card_saved | failed | expired` rows holding a link, one self-loop transition with `RECOVERY_LINK_CLEARED` and event `fee_link_retired:<caseId>` (kind `fee_opened`), then `retireRecoveryLink`.
- Case base: collected money for `captured | balance_due`, else `feeBaseFor` (row amount, or the leg amount for pay-now legs, D-24). Evidence carries initiator, policy version and minutes before pickup.
- `app/api/admin/bookings/cancel/route.ts`: guards, `cancelSchema` with `cancelled_by` required, mapping only. Responses unchanged except `{ ok: true, late: true }` for a kept-money cancel and 500 `{ cancelled: true }`.
- `lib/payments/hold.ts`: `releaseHold` accepts `cash_guarantee`; `abandonHoldForClosedBooking` voids the authorization and moves `placing_hold -> card_saved` (event `hold_voided:closed:*`, errorCode `fee_pending`) when the booking has a pending case, or when the case lookup fails; otherwise `released` as before.

## Verification

- `npx vitest run tests/payments-cancel.test.ts tests/admin-bookings-cancel.test.ts tests/admin-bookings.test.ts tests/payments-hold.test.ts tests/payment-state-writers-gate.test.ts tests/status-writers-gate.test.ts tests/booking-status-parity.test.ts`: 364 passed. Also green: payments-review-engine, payments-engine-gates, payments-fee, payments-lifecycle, payments-failure, payments-tick, payments-settle, BookingsTable.
- 94 tests in `payments-cancel.test.ts`: a table over 11 booking types times free / late / by-Prestigo, no `refunds.create` on any late path, lapse to `expired` through the real webhook handler on a late-cancelled hold, busy / lost race / RPC failure, failed money steps, per-leg, the client rules.
- `npx tsc --noEmit`: no error outside `tests/`; none in the touched tests. `npx eslint --quiet` on all touched source and test files: clean.
- Full suite: all pass except suites that cannot resolve `next-intl/.../server.react-server.js` through the symlinked node_modules (environment, same as `tests/passenger-actions.test.ts`, a known baseline file).

## Deviations from Plan

**1. [Rule 3 - Blocking] Both tasks' code was written together**
The tracer test already covers cash release and a lapsed hold, which need the hold.ts changes, so the hold.ts commit came first and the orchestrator (full matrix) second; every commit is green on its own.

**2. [Rule 1 - Bug] Own parity violation**
`tests/booking-status-parity.test.ts` bans inline status lists; the first version of cancel.ts had two. Replaced by `VALID_TRANSITIONS` / `TERMINAL_BOOKING_STATUSES`.

**3. [Rule 3 - Blocking] Tests that encode the old route contract**
`tests/admin-bookings.test.ts` (the Phase 27/87 cancel block) and `tests/admin-bookings-cancel.test.ts` send `cancelled_by: 'prestigo'` by default in their request helper (free whatever the time, so every old money assertion is unchanged); the ledger-count helper in the second excludes the new `admin_action` row, and one "rpc called once" assertion in the first filters to the status RPC. New describe block "who cancelled" in the second.

## Notes for the orchestrator and later plans

- **The admin UI sends no `cancelled_by` yet**: `BookingsTable.handleCancel` posts `{ id, leg? }`, so the cancel button answers 400 until plan 89-16 (CancelBookingDialog) lands. Plan 89-16 must also not preselect a choice (D-20).
- Plan 89-27 owns the notices: on a late cancel no email is sent at all today; on free paths `scheduleCancelRouteEmail` is called for every initiator including `client_token`.
- Open: a late cancel that applied but could not open its case (DB error) answers `db_failed { cancelled: true }`; a retry answers `not_cancellable` (already cancelled), so such a booking needs the later tick/step-G or admin tooling to open the case. Rare; flagged for plans 89-13 / 89-16.
- Until policy go-live every booking is "legacy" (NULL `cancel_policy`): an `admin_client` cancel within the last hour before pickup, or after it, now opens a pending case instead of releasing or refunding (D-07). `admin_prestigo` keeps today's behaviour exactly.
- Pay-now late cancel keeps the money (D-07, deliberate change of the old full refund); the waive-as-refund is plan 89-09 / 89-13.
- Not done here by design: manage route / My trips callers, the PATCH `use_cancel_route` guard for cash and paid pay-now (research item d), tick step G.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-89-26 (CAS first, no refund for a lost race: tested with and without payment), T-89-27 (server recompute, stale acknowledge cancels nothing), T-89-28 (admin_prestigo forces free, required cancelled_by), T-89-30 (actor log, `admin_action` errorCode, source `client_cancel`) are mitigated and covered by tests.

## Self-Check: PASSED

- lib/payments/cancel.ts, tests/payments-cancel.test.ts: FOUND
- commits debf6147, 1b19b657: FOUND
