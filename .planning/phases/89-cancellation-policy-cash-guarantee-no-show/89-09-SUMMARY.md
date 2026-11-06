---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 09
subsystem: payments
tags: [no-show, fee-case, evidence, status-gates, security, WR-02, WR-04]
requires:
  - phase: 89-06
    provides: "openFeeCase, isFeeEligible, feeBaseFor (lib/payments/fee.ts)"
  - phase: 89-25
    provides: "fee_no_show_needed operator alert"
  - phase: 89-04
    provides: "getNoShowThresholds and isAirportPickup in lib/no-show-wait.ts"
provides:
  - "assertNoShowConfirmable(booking, thresholds, nowMs, onLocationMs) in lib/no-show.ts"
  - "confirmNoShow gated, opening a pending no_show fee case with an evidence snapshot"
  - "ConfirmNoShowResult / NoShowRefusal / isNoShowRefusal exports"
  - "no-show route codes not_on_location, no_request (422), wait_not_elapsed (409 with noShowAvailableAt)"
  - "PATCH answers use_no_show_route; use_cancel_route widened; trip edit and assign refuse closed bookings"
affects: [89-08, 89-13, 89-14, 89-26]
tech-stack:
  added: []
  patterns:
    - "gate first, status second, money case third: the case is opened after the status applied and a failure to open it is logged, never reverted"
    - "a status that money follows is reachable only through its own route (PATCH answers use_*_route)"
key-files:
  created:
    - tests/admin-no-show-confirm.test.ts
    - tests/admin-bookings-status-gates.test.ts
  modified:
    - lib/no-show.ts
    - app/api/admin/bookings/[id]/no-show/route.ts
    - app/api/admin/bookings/route.ts
    - app/api/admin/bookings/[id]/assign/route.ts
    - tests/admin-no-show.test.ts
    - tests/admin-bookings.test.ts
    - tests/gnet-status-push.test.ts
key-decisions:
  - "assertNoShowConfirmable takes a fourth argument, the latest on_location instant from booking_status_log: noShowAvailableAtMs needs it and the booking row does not carry it"
  - "An unreadable arrival log is a 500 and nothing is written (money follows this status); only an absent arrival row with a known pickup falls back to pickup + threshold, and with neither instant known the open driver request is the evidence (same fail-open as the driver's request)"
  - "The stale-view check (expected_status) runs before the WR-04 gate, so a tab that saw another status still gets status_conflict"
  - "Evidence driver_id and requested_at are read from the newest no_show_requested log row (driver actor id), with the booking columns as fallback"
  - "The operator alert is keyed alert:fee_no_show_needed:<caseId> and sent only when the case was created, so a replay can not alert twice"
patterns-established:
  - "NoShowRefusal result type with isNoShowRefusal guard, mapped before advanceResultToResponse"
requirements-completed: [CASH-02, CASH-03]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: ac78525e121f9c08c66a422ec98db8b7474d3df9
plan_head_after: 0836e41567ce51c8883f0b8c1ec979890385764b
actuals:
  tokens: 24000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 09: No-show needs a request and a passed wait, and opens a pending case with evidence Summary

**confirmNoShow now refuses unless the booking is on_location, the driver asked and the live threshold has passed; on success it opens a pending no_show case (full fare proposed) with an evidence snapshot and one operator alert, charging nothing; PATCH can no longer reach no_show or a money-bearing cancel, and closed bookings can be neither edited nor assigned.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | operator confirm through the route, assertNoShowConfirmable and openFeeCase to a pending case with evidence | e1d027b5 |
| 2 | PATCH guards and the edit and assign gates (WR-02, WR-04) | 0836e415 |

Tracer verified end to end before expansion (`tests/admin-no-show-confirm.test.ts`, real route, real `confirmNoShow`, real `openFeeCase` on the payments fake): an on_location card_hold booking with a driver request becomes `no_show`, one `booking_fee_cases` row exists (kind `no_show`, status `pending`, base and proposed 12000, `decided_minor` and `charge_requested_at` null, `opened_by` the admin), the evidence holds `pickup_utc`, `on_location_at`, `requested_at`, `threshold_min`, `airport`, `confirmed_at`, `driver_id`, the hold stays `authorized` with its payment intent, `settleBooking` is never called, one `fee_opened` ledger row, one `fee_no_show_needed` alert keyed by the case id.

## What was built

- `lib/no-show.ts`: `assertNoShowConfirmable` (pure; `not_on_location`, `no_request`, `wait_not_elapsed` with the instant the wait ends, live thresholds, airport vs city). `confirmNoShow` reads the booking, checks the stale view, reads the arrival row and the live thresholds, gates, advances the status through the service (passing the row it already read), then `openNoShowCase`: `isFeeEligible` (partners and no-money bookings get no case), `feeBaseFor`, evidence from the status log, `openFeeCase` with the full base as proposal (UI-SPEC 2.3), alert through `after()` only when the case was newly created. Failure to open the case is logged with the booking id and never reverts the status. `requestNoShowForDriver` is untouched; `tests/driver-no-show.test.ts` passes unchanged.
- `no-show/route.ts`: `not_on_location` and `no_request` are 422, `wait_not_elapsed` is 409 with `noShowAvailableAt`; other failures still go through `advanceResultToResponse`.
- `admin/bookings/route.ts`: PATCH `status: 'no_show'` is 422 `use_no_show_route` before any read; `use_cancel_route` now covers `card_hold`, `cash_guarantee` and any booking with a non-empty `payment_intent_id`; the trip-edit terminal gate includes `no_show`.
- `assign/route.ts`: terminal bookings answer 422 `booking_closed` before the `driver_assignments` insert.

## Research A8 (assign route on closed bookings) confirmed

Read the route: no terminal check preceded the `driver_assignments` insert (the status read in 5b only fed the status logic after the insert). A cancelled, completed or no_show booking therefore still got an assignment row, a live trip token and a driver email. The gate is real, not dropped. The booking read already selected `status`, so no extra query.

## Verification

- `npx vitest run` on admin-no-show (46), admin-no-show-confirm (9), driver-no-show, admin-bookings-status-gates (12), admin-bookings, admin-bookings-edit-payment, admin-bookings-cancel, admin-bookings-payment-link, admin-assignment, gnet-status-push, booking-status-service: 11 files, 384 passed. Also card-checkout-init, card-checkout-cash, driver-trip, payments-lifecycle, noshow-alert: 123 passed.
- `npx tsc --noEmit`: no error outside `tests/`; the 8 baseline errors in `tests/` are unchanged. `npx eslint --quiet` on every touched source and test file exits 0.
- `grep -c assertNoShowConfirmable lib/no-show.ts` prints 2; `grep -c use_no_show_route app/api/admin/bookings/route.ts` prints 2; `grep -c TERMINAL_BOOKING_STATUSES` on the assign route prints 2.

## Deviations from Plan

**1. [Rule 1 - Bug] Two older tests pinned the hole**
- **Found during:** Task 2
- **Issue:** `tests/admin-bookings.test.ts` ("87-03 D-02: no_show is accepted from on_location") and `tests/gnet-status-push.test.ts` ("87-03 D-22 ... -> no_show") asserted that PATCH to no_show answers 200. That is exactly WR-04.
- **Fix:** Both now assert 422 `use_no_show_route`, with nothing written, no email and no GNet push. The on_board half of the GNet test is unchanged.
- **Files modified:** tests/admin-bookings.test.ts, tests/gnet-status-push.test.ts
- **Commit:** 0836e415

**2. [Rule 3 - Blocking] `assertNoShowConfirmable` signature gained `onLocationMs`**
- The plan names `(booking, thresholds, nowMs)`. `noShowAvailableAtMs` needs the arrival instant, which lives only in `booking_status_log`, so it is a fourth parameter. The function stays pure.

**3. [Rule 2 - Missing functionality] Extra test file**
- The plan lists `tests/admin-no-show.test.ts`. That file mocks the status service and a hand-built Supabase double, which cannot carry the case-and-evidence path. The end-to-end tracer lives in the new `tests/admin-no-show-confirm.test.ts` (payments fake DB); the old file was reworked to the new read order (cash booking, no case) and gained the refusal and mapping tests.

**4. [Rule 2 - Missing functionality] Fail closed on an unreadable arrival log**
- The driver's request fails open when the log is unreadable. The operator confirm is followed by money, so it answers 500 and writes nothing instead.

Process note: the plan-head ledger file was not written (the git dir sits outside the sandbox); `plan_head_before` is the dispatch base and `commits` was measured with `git rev-list --count ac78525e..HEAD` (2 before this SUMMARY commit).

## Notes for the orchestrator and later plans

- A dismiss ("Client found") that lands between the gate read and the status compare-and-set is not detected (the status CAS only protects against a status move). The result is a pending case, never a charge, and a person decides; no change made.
- `ConfirmNoShowModal` / `BookingsTable` only see the new codes as a non-200: if the modal prints the raw `error`, plan 89-14 (admin UI) may want friendly copy for `not_on_location`, `no_request`, `wait_not_elapsed` (the 409 carries `noShowAvailableAt`).
- `app/api/card-checkout/init/route.ts` still imports `getNoShowThresholds` / `isAirportPickup` from `@/lib/no-show`, which now also pulls the fee module; switching it to `@/lib/no-show-wait` would keep that route's import graph small (left alone, not in this plan).
- Plan 89-08 / 89-13 (fee route and admin case card) can rely on a no-show case existing in `pending` with `evidence` set whenever a card or paid no-show booking is confirmed; the proposal equals the base, and the alert key is `alert:fee_no_show_needed:<caseId>`.
- No migration, no Stripe call, no `.env.local` read.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-31 (assertNoShowConfirmable with live thresholds, PATCH refused), T-89-32 (evidence snapshot stored on the case at confirm, short facts only), T-89-33 (status must be on_location with an open request; a stale tab gets status_conflict or not_on_location).

## Self-Check: PASSED

- lib/no-show.ts, tests/admin-no-show-confirm.test.ts, tests/admin-bookings-status-gates.test.ts, this SUMMARY: FOUND
- commits e1d027b5, 0836e415: FOUND on branch worktree-agent-a87f9fbc5944edf2c
