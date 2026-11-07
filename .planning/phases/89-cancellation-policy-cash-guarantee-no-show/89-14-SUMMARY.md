---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 14
subsystem: driver-trip
tags: [driver, cash, confirm-cash, settle-cash, trip-page, security]
requires:
  - phase: 89-12
    provides: "settleCash(booking, actor) in lib/payments/cash.ts, the cash_settled / cash_reopened ledger and the operator reversal"
  - phase: 87
    provides: "token-gated driver trip route, ConfirmStepDialog pattern, TripCompleted, InvalidTripLinkView"
provides:
  - "driver action { action: 'confirm_cash' } (strict, no amount field) and driverConfirmCash in lib/driver-trip-step.ts"
  - "buildDriverCash and DriverTripCash { amountLabel, state: 'due' | 'settled' }: the server-built label, the only amount a driver page ever carries"
  - "trip page cash prop, cash chip, completion warning, cash card in TripCompleted, cancelled line in InvalidTripLinkView"
affects: [89-15, 89-17, 89-26, 89-27, 89-28]
tech-stack:
  added: []
  patterns:
    - "the browser receives a formatted label string, never a number; non-cash trips get no cash key at all (the Phase 87 props)"
    - "the driver link settles money only through settleCash with a system actor driver_trip; no amount is read from the request"
    - "an ended view carries a reference only for a cancelled booking on the current driver's own link; every other ended reason stays byte-identical"
key-files:
  created:
    - tests/driver-trip-cash.test.ts
  modified:
    - lib/driver-trip-step.ts
    - app/api/driver/trip/[token]/progress/route.ts
    - app/(internal)/driver/trip/[token]/page.tsx
    - app/(internal)/driver/trip/[token]/TripScreen.tsx
    - app/(internal)/driver/trip/[token]/TripDetails.tsx
    - app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx
    - app/(internal)/driver/trip/[token]/TripCompleted.tsx
    - app/(internal)/driver/trip/[token]/InvalidTripLinkView.tsx
    - tests/driver-trip.test.ts
    - tests/driver-trip-screen.test.tsx
key-decisions:
  - "D-21 as narrowed by the plan: no 'The passenger did not pay' button, no cash_not_received action, no amber admin banner, no operator mail. The cash card carries the line 'If the passenger did not pay, call the office.' and the page keeps the existing Call the office link; the schema test asserts that cash_not_received, passenger_did_not_pay and report_unpaid are rejected"
  - "confirm_cash answers: 200 { ok, status, nextStep: null, cash: 'settled' } (replay adds replay: true), 422 cash_not_allowed (not completed, not cash_guarantee, state not card_saved / failed / cash_settled, partner booking; nothing written), 409 cash_conflict (state moved between our read and the compare-and-set), 400 invalid_token (identity)"
  - "A cash trip whose Phase 88 state is failed counts as unsettled for the driver: the client pays the driver. settleCash already clears the failure noise"
  - "state 'settled' keeps the label: the ok line reads 'Cash received: {amount}. Thank you.' (UI-SPEC 6.2: the amount stays because the driver just confirmed it, and a reload shows the same line)"
  - "The cash payment columns (payment_mode, payment_state, payment_amount_minor, payment_currency) are joined into the existing page select; bookings.amount_eur is still never selected. The step module reads payment_mode, payment_state, recovery_link_id through the existing bookings!inner join, so it still has no .from('bookings') query (source gate in driver-trip-progress.test.ts unchanged)"
  - "The D-09 byte-identical ended-view test was narrowed, not removed: cancelled on a reassigned link stays in the identical set; cancelled on the current driver's link has its own test (UI-SPEC 6.3 and the plan require the line there)"
requirements-completed: [CASH-04]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: d763449b786eabc2fedd635f4914c15a538e4503
plan_head_after: bc1266b0cc22b5bf9232ad10d60c9034b35d9c16
actuals:
  tokens: 13500
  tasks: 2
  commits: 2
---

# Phase 89 Plan 14: The driver's cash step Summary

**A driver on a completed cash booking sees the amount (a server-built label), taps "I received {amount}" through a confirm dialog, and that settles the booking in cash through `settleCash` with the `driver_trip` actor; there is no amount from the driver, no "did not pay" answer (the line tells them to call the office), completion is never blocked, and every non-cash trip renders exactly as in Phase 87.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | confirm_cash through the strict schema and the progress route to settleCash, scoped amount label on the page | 5a88c67b |
| 2 | cash chip, completion warning, cash card and cancelled line on the trip screens | bc1266b0 |

Tracer verified end to end before expansion (`tests/driver-trip-cash.test.ts`: the real progress route, the real `driver-trip-step`, the real `settleCash` and the real payment transition on the payments fake; only Supabase, the rate limit and Stripe links are doubles): `POST { action: 'confirm_cash' }` on a completed cash_guarantee booking in `card_saved` answered `200 { ok: true, status: 'completed', nextStep: null, cash: 'settled' }`, the row became `cash_settled` and the ledger holds one `cash_settled` row keyed `cash_settled:<id>:0` with actor `system` / `driver_trip` and no amount.

## What was built

- **`lib/driver-trip-step.ts`**: `confirm_cash` added to the strict union (an `amount` next to it is a 400, as is an amount next to a step). `driverConfirmCash`: identity, `assertMoneyEligible` (partner refused), status `completed`, mode `cash_guarantee`, state in `card_saved | failed | cash_settled`, then `settleCash(..., { type: 'system', id: 'driver_trip' })`. `buildDriverCash` returns `{ amountLabel, state }` through `formatMinor` (amount and currency are the booking's own), or `null` for every other trip, for partner bookings and for unusable money. The trip lookup join reads `payment_mode`, `payment_state`, `recovery_link_id`.
- **Progress route**: the action branch is a switch on `data.action` (`request_no_show` keeps working, `confirm_cash` delegates). The route still has no bookings query and no write of its own.
- **Trip page**: the select adds the four payment columns (not `amount_eur`); `cash` is passed to `TripScreen` only for a cash trip (no key otherwise) and to the re-opened `TripCompleted` together with the token. A cancelled booking on the current driver's link passes `cancelledReference` to the ended view; unknown, reassigned, declined and no_show links keep the uniform view.
- **Screens**: neutral "Cash payment" chip with a Banknote icon in the expanded details (no amount); `ConfirmStepDialog` gets a `cash` prop (warning block on the final step: "CASH TO COLLECT", the amount, both sentences; "Yes, complete trip" and "Not yet" unchanged) and a `cash-received` mode ("Confirm cash received", initial focus on "Not yet"); `TripCompleted` (now a client component) shows the cash card in both variants, then the `role="status"` ok line; error copy for 409 / 422 / 400, 429 and everything else with `role="alert"`; `InvalidTripLinkView` shows "This trip was cancelled. You do not need to go." and "Booking {reference}".

## Verification

- `npx vitest run tests/driver-trip-cash.test.ts tests/driver-trip.test.ts tests/driver-trip-screen.test.tsx tests/driver-trip-progress.test.ts tests/driver-no-show.test.ts tests/driver-trip-step.test.ts`: 335 passed (39 new in `driver-trip-cash`, plus new cash blocks in the screen and page suites). Also green: driver-help-route, driver-help-contract, driver-help-chat, private-link-paths, admin-no-hardcoded-colors, slide-to-advance, infra-vps-isolation-guard, booking-status-parity, payment-state-writers-gate (247).
- `npx tsc --noEmit`: nothing outside `tests/`; the 8 baseline errors in `tests/` unchanged. `npx eslint --quiet` on every touched source and test file: clean.
- Mutation check: removing the `status !== 'completed'` guard from `driverConfirmCash` fails 5 tests (every non-completed status then settles); restored.
- Named acceptance tests: a non-cash trip's `TripScreen` props are exactly `initialNote, noShow, token, trip, view` (the Phase 87 shape) with no payment text; the select never contains `amount_eur` and its only amount-like column is `payment_amount_minor`; completion of a cash booking sends only `{ step: 'completed' }` and then shows the card; the operator reversal (D-22) gives three ledger rows with keys `:0`, `cash_reopened:…:1`, `cash_settled:…:1` and the page shows `due` again.

## Deviations from Plan

**1. [Rule 3 - Blocking] The component prop surface landed with Task 1**
The page (Task 1) passes `cash`, `token` and `cancelledReference`, and the Task 1 type gate covers `app/(internal)/driver`, so the optional props were declared on `TripScreen`, `TripCompleted` and `InvalidTripLinkView` in Task 1 (unused until Task 2).

**2. [Rule 1 - Test conflict with the plan's own requirement] D-09 byte-identical test narrowed**
`tests/driver-trip.test.ts` asserted that a cancelled booking renders the same ended HTML as every other reason. The plan requires the cancelled line for the current driver's link, so cancelled-on-a-reassigned-link stays in the identical set and cancelled-on-the-current-link has its own test (reference shown, no passenger, address or date). Anti-enumeration holds: the line appears only for a link whose assignment driver is still the booking's driver and not declined.

**3. [Process] Tests written after the implementation of Task 1**
The tracer's implementation and tests were written together, so the RED run was not observed separately; the mutation check above stands in for it.

Not done by design (D-21, as given by the plan): the "The passenger did not pay" button and its confirm dialog, a `cash_not_received` / `driver_reported_unpaid` action, the amber admin banner and the `[Cash]` operator mail. The `driver_reported_unpaid` field that plan 89-12 mentioned for the admin GET therefore does not exist and nothing in plan 89-15 / 89-17 should wait for it.

## Notes for later plans

- Open from the plan: the wording "If the passenger did not pay, call the office." is hard-coded English like the rest of the driver screens (no i18n for driver pages).
- The chip lives in the expanded details sheet (UI-SPEC 6.1 names `TripDetails`), so it is visible once the driver opens the sheet, not on the collapsed card.
- The label is in the page payload from assignment on (needed for the final-step dialog) but is rendered only in the final-step dialog and after completion; the chip never shows it.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-47 (token-bound, completed only, ledger actor `driver_trip`, operator reversal D-22), T-89-48 (strict schema, no amount accepted; `settleCash` takes none; tested) and T-89-49 (label built only for unsettled or settled cash; non-cash props asserted equal to Phase 87) are mitigated and covered by tests.

## Self-Check: PASSED

- tests/driver-trip-cash.test.ts, lib/driver-trip-step.ts, app/(internal)/driver/trip/[token]/TripCompleted.tsx, this SUMMARY: FOUND
- commits 5a88c67b, bc1266b0: FOUND on branch worktree-agent-af7ba30df27efe111
