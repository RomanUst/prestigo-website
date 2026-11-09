---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 22
subsystem: go-live
tags: [go-live, live-tests, stripe, checklist]
requires: [89-19, 89-20, 89-21, 89-24]
provides: ["owner live checklist with results on production"]
affects: [89-23]
key-files:
  created: [.planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-GO-LIVE-CHECKLIST.md]
  modified: []
decisions:
  - "C2 (decline at hold placement) skipped by the owner; covered by LC2 lifecycle tests and phase 88"
  - "D2-D13 (booking-based live money checks) deferred by the owner on 2026-11-09"
  - "Stripe MCC changed by the owner to Taxis and limos (A3)"
status: complete-with-deferrals
completed: 2026-11-09
---

# 89-22: go-live checklist and owner live tests

The checklist (parts A-E) was written and run on production. The orchestrator read every
booking row through Supabase MCP and marked the result.

## Results

| Part | Result |
|---|---|
| A1 Radar on saved cards | pass |
| A2 Stripe pricing plan | pass: blended |
| A3 MCC | pass: changed to Taxis and limos by the owner |
| B1, B2 erasure refused while a payment is open | pass |
| B3 erasure of a throwaway address | pending (after part E) |
| C1 hold placed by the scheduled tick | pass: PRG-20261108-86B523, `hold_authorized` 6900 at 00:15 UTC |
| C2 decline at hold placement + recovery | skipped (owner) |
| C3 Arabic email | pass: PRG-20261106-50AED4 |
| C4 admin cancel releases the hold | pass: PRG-20261108-86B523, about 45 s end to end, no errors |
| D1 free client self-cancel | pass: PRG-20261109-EAC3B5, first live self-cancel |
| D2-D13 | deferred (owner) |
| E1, E2 refund and close test bookings | pending |

## Open items

- PRG-20261106-229544: 69,00 captured in phase 88, no `refund_observed` in the database. The owner checks Stripe.
- PRG-20261106-D8ED0F: stale unpaid pay-now booking; the owner cancels it in admin.
- Notes from the run: the ledger event is `hold_authorized` (the checklist said `hold_placed`); the
  erasure preview counts a completed booking with a future pickup as upcoming (old phase 88 test data).

## Not verified on live money

Late-cancel fee, partial capture, waiver, charge without a hold, old pay-now refund of the
remainder, no-show charge, cash settle/reopen, in-trip card charge, change request, My trips,
Arabic fee emails, phone layout. All of these have automated tests; none ran with real money.
