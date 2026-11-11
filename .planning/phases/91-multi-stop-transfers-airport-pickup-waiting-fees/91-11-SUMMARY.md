---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 11
subsystem: admin-ui
tags: [admin, payments, extra-charge, modal, stripe]
requires:
  - "91-08: lib/payments/extra.ts (loadExtraContext, isExtraChargeEligible), GET/POST /api/admin/bookings/[id]/extra"
provides:
  - "payment GET: allowed_actions entry charge_extra and the extra object { eligible, reason, in_flight, charges }"
  - "components/admin/ExtraChargeModal.tsx: ExtraChargeModal (waiting and other modes, resume), types ExtraFacts / ExtraInFlight / ExtraChargeFact"
  - "PaymentPanel: 'Add extra charge…' action, 'Pending extra charge…' entry, 'Extra charges' list"
affects: [BookingDetailPanel (list, board, calendar share PaymentPanel)]
tech-stack:
  added: []
  patterns:
    - "server preview for the amount: the browser never computes waiting money; expected_amount_minor = the previewed amount"
    - "in-flight ref + disabled primary + guarded Modal onClose = one request, no dismissal while submitting"
key-files:
  created:
    - components/admin/ExtraChargeModal.tsx
    - tests/extra-charge-modal.test.tsx
  modified:
    - app/api/admin/bookings/[id]/payment/route.ts
    - components/admin/PaymentPanel.tsx
    - tests/PaymentPanel.test.tsx
    - tests/admin-payment-api.test.ts
    - tests/payments-lifecycle.test.ts
key-decisions:
  - "The extra context read is non-fatal in the payment GET: on failure the panel loads without charge_extra (extra eligible:false) instead of a 500"
  - "A pending (charging) extra leaves no charge_extra in allowed_actions, so the panel adds a separate 'Pending extra charge…' entry when extra.reason is in_flight; it opens the same modal in its resume view"
  - "in_flight.resumable is measured from updated_at (falling back to requested_at), matching the engine lease that a resume bumps; the plan text said requested_at"
  - "ExtraChargeModal takes an optional onRefetch and onDone(result?) in addition to the planned props, so a decline keeps the dialog open yet refreshes the list and a success reports one result line"
status: complete
commits: 2
plan_head_before: eda83cce9f975066c6d380cbd3bb724dc8b54078
plan_head_after: d85b49a5e664d45b17f97f33ceeaeda9bdb352a5
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
---

# Phase 91 Plan 11: Operator extra charge dialog Summary

The operator can bill extra waiting (amount computed by the server from the admin rate) or an agreed extra with a client-facing description to an eligible booking's saved card from the shared booking panel. The dialog states the amount and that the card is charged now with an email receipt, and the request leaves only from the primary button.

## What was built

- **Payment GET** (`app/api/admin/bookings/[id]/payment/route.ts`): `loadExtraContext` runs in the existing `Promise.all`; `charge_extra` is appended when `isExtraChargeEligible(booking, ctx).ok`; the new `extra` object is built field by field (no Stripe ids, no requester id), with `in_flight.resumable` from the lease.
- **`ExtraChargeModal`**: mode switch "Extra waiting" / "Other".
  - Other: description labelled "Shown to the client in the receipt" (3 to 200 chars, single line), amount through `parseAmountToMinor` in the booking currency; primary reads "Charge <amount> to the saved card".
  - Waiting: billable minutes (1 to 480) with the hint "Enter only the billable minutes beyond the free waiting"; debounced `GET /extra?minutes=N`; shows "45 min = 3 × 15 min" and the server amount; the POST carries `expected_amount_minor` equal to it. A preview counts only for the minutes currently typed, so a stale amount never reaches the button.
  - Answers: charged (closes, one result line), declined (code shown, stays open, refetch), `payment_busy`, `amount_changed` (new amount shown, requires a fresh click, never re-sent automatically), `action_not_allowed` by reason in plain words, `waiting_rate_missing`, 401/403, 400, 5xx and lost answers (never claims nothing was charged).
  - Pending charge: resumable shows "Retry the pending charge of X" (POST `resume`); not yet resumable shows the busy message and no charge button.
  - One request at a time (ref guard, disabled primary, Escape / scrim / Close ignored while submitting).
- **PaymentPanel**: `PaymentActionName` gains `charge_extra`; label "Add extra charge…"; modal mount; "Extra charges" list (kind, amount through `money`, status, Prague date, decline code); "Pending extra charge…" entry for a charging row.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 (tracer) | 17553da5 | payment GET extension, ExtraChargeModal, PaymentPanel wiring, GET and panel tests, lifecycle test update |
| 2 | d85b49a5 | tests/extra-charge-modal.test.tsx: other and waiting modes and every non-happy answer, resume, double submit |

## Verification

- `npx vitest run tests/extra-charge-modal.test.tsx tests/PaymentPanel.test.tsx tests/admin-payment-api.test.ts tests/admin-no-hardcoded-colors.test.ts tests/admin-fee-panel.test.tsx`: green (18 modal tests, 141 API tests).
- Also green: admin-fee-route, payments-lifecycle, payments-engine-gates, admin-cash-panel, cancel-booking-dialog, booking-detail-panel, BookingsTable, admin-extra-route, payment-state-writers-gate.
- `npx tsc --noEmit`: only the 8 old errors in `tests/`.
- `npx eslint --quiet` on all touched files: clean.
- No colour literal and no typed currency amount in `components/admin/ExtraChargeModal.tsx` (amounts come from the API through `money`/`formatMinor`); no `messages/*.json` touched.
- The `verify` skill was not invoked as a separate run; its checks (types, lint, related tests, price / secret scans) were run by hand per commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Existing test encodes old behaviour] payments-lifecycle expected no allowed actions after capture**
- **Found during:** Task 1 verification
- **Issue:** `tests/payments-lifecycle.test.ts` asserted `allowed_actions` equals `[]` for a captured completed card booking; with D-15 the booking now offers `charge_extra`.
- **Fix:** expectation changed to `['charge_extra']` with a comment (not in the plan's `files_modified`, but the plan's rule is to update such tests in the same task).
- **Files modified:** tests/payments-lifecycle.test.ts
- **Commit:** 17553da5

**2. [Rule 2 - Missing path] Resume had no entry point in the panel**
- **Issue:** a charging row makes `isExtraChargeEligible` answer `in_flight`, so `charge_extra` is absent and the planned "Retry the pending charge" would be unreachable.
- **Fix:** the panel shows "Pending extra charge…" when `extra.reason === 'in_flight'`, opening the same modal in its resume view.
- **Commit:** 17553da5

**3. Plan interface notes**
- `resumable` is measured from `updated_at` (fallback `requested_at`) to match the engine's lease; the extra-context read in the GET is non-fatal; `ExtraChargeModal` has the optional `onRefetch` and `onDone(result?)`. The types `ExtraFacts` / `ExtraInFlight` live in the modal file because `paymentShared.ts` is outside `files_modified`.
- The tracer and waiting code landed in one pass in commit 1, so the Task 2 commit holds the modal tests only (the waiting and answer tests passed on first run; they are behaviour tests, not a RED-first record). The double-click test cannot separate the ref guard from the disabled button under React's synchronous act; both guards exist.
- The plan commit ledger file under the git dir could not be written (sandbox); `commits` was measured against the known base SHA with `git rev-list --count`.

## Known Stubs

None.

## Threat Flags

None. T-91-35 (button label states the server amount; `expected_amount_minor` checked by the server, tested incl. `amount_changed`) and T-91-36 (in-flight ref, disabled primary, no dismissal while submitting) are mitigated and tested.

## Notes for downstream plans

- A browser/UAT check of the dialog against a real eligible booking (live Stripe) is left to the phase's final canary; nothing here talks to Stripe directly.

## Self-Check: PASSED

- components/admin/ExtraChargeModal.tsx, tests/extra-charge-modal.test.tsx: found.
- Commits 17553da5, d85b49a5: found on branch worktree-agent-ae83a0388fe3ec29b.
