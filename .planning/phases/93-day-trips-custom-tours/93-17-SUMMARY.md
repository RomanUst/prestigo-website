---
phase: 93-day-trips-custom-tours
plan: 17
subsystem: payments
tags: [checkout, tours, cancellation-policy, stripe, card-flow]
requires:
  - phase: 93-16
    provides: tour branch in checkout compute (PricedCheckout.tour, TOUR_UNAVAILABLE / AIRPORT_PICKUP / PICKUP_OUT_OF_AREA)
  - phase: 93-05
    provides: tourPolicy, buildTourPolicySnapshot
provides:
  - tour booking row (trip_type tour, tour_id, tour_title, tour_extra_hours, hours, destination label) created by createCardCheckoutIntent in card and cash modes
  - tour- cancel_policy snapshot stored and used for the consent free-until moment
  - init tour policy preview and reason codes
affects: [93-18, tour booking UI, cancellation / fee flows]
tech-stack:
  added: []
  patterns: [tour keys added to booking meta/row only when present, so other trips keep their key set; reason codes only past the eligibility gate and only for tours]
key-files:
  created: [tests/card-checkout-tour.test.ts]
  modified: [app/api/card-checkout/intent/route.ts, app/api/card-checkout/init/route.ts, lib/checkout/compute.ts, lib/supabase.ts, tests/helpers/fake-payments-db.ts, tests/admin-extra-route.test.ts]
key-decisions:
  - "The intent route reads the cancellation policy AFTER pricing (it needs priced.tour); a tour uses tourPolicy(freeCancelHours), everything else the unchanged getCancellationPolicy"
  - "buildBookingRow writes the three tour columns only when meta.tourId is set, so a transfer row has exactly the keys it had before"
  - "tour_title is cut to 200 chars (the migration 092 CHECK), not the 500 the plan mentioned"
status: complete
commits: 2
plan_head_before: ef1469043089e565130c12fc94dc01cf366ffb8f
plan_head_after: 360cea5028735163d163de2728d68e183e1b271a
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
completed: 2026-11-18
---

# Phase 93 Plan 17: Tour card checkout wiring Summary

A tour now books through the existing Phase 88/89 card engine in both payment modes (saved card with hold, cash with card guarantee) and stores its own cancellation terms: a `tour-` policy snapshot built from `tour_settings.free_cancel_hours` with a 100 % fee. The client never sends an amount.

## What was built

- `lib/checkout/compute.ts` `buildCheckoutMeta`: for a tour adds `tourId`, `tourTitle` (EN snapshot), `tourExtraHours`, and overrides `hours` (included + extra) and `destinationAddress` (destination label). No key change for other trips.
- `lib/supabase.ts` `buildBookingRow`: `tour_id`, `tour_title`, `tour_extra_hours` only when the meta carries a tour. `distance_km` stays null (priced.distanceKm is null for tours).
- `app/api/card-checkout/intent/route.ts`: policy read moved after pricing; tour -> `tourPolicy` + `buildTourPolicySnapshot`, else the old path. The same policy drives the free-until moment, the POLICY_CHANGED cross-check and the stored snapshot (T-93-45). PRICE_CHANGED 409 unchanged (T-93-47).
- `app/api/card-checkout/init/route.ts`: tour preview uses `tourPolicy`; past the eligibility gate and for tours only, answers `{ eligible: false, reason }` for TOUR_UNAVAILABLE, AIRPORT_PICKUP, PICKUP_OUT_OF_AREA (validation or pricing failure) and LEAD_TIME (with the policy). A client with payments closed and every non-tour or other refusal keeps the opaque `{ eligible: false }` (T-93-46).
- `tests/helpers/fake-payments-db.ts`: nullable `tour_id`, `tour_title`, `tour_extra_hours` defaults on bookings, with the 092 CHECKs emulated on insert and update.
- `tests/card-checkout-tour.test.ts` (17 tests): card and cash tour intents end to end (row columns, `tour-` snapshot round trip with freeHoursFor = 36 h and fee 100 %), zero-extra-hours row, consent stored, transfer row without tour keys, init preview and each reason code, opaque answers for closed clients and other refusals, PRICE_CHANGED with no row, forged amounts ignored, POLICY_CHANGED when the transfer window is displayed, NOT_ELIGIBLE for closed clients.
- `tests/admin-extra-route.test.ts`: kind `other` charges a saved card on a completed tour booking (D-04). `lib/payments/extra.ts` needed no change.

## Verification

- vitest (plan verification set): card-checkout-tour, -init, -intent, -cash, admin-extra-route, payment-state-writers-gate: 6 files, 206 tests passed. Plus a wider set of 12 files touching buildBookingRow / the fake DB (supabase, booking-policy-snapshot, create-payment-intent, webhooks-stripe-payments, payments-cash, payments-hold, admin-bookings-tour, phase92-e2e, quote-convert-fake, checkout-compute, extra-charge): 417 passed.
- tsc: 8 errors, all the old `tests/` baseline. eslint clean on all touched files.

## Deviations from Plan

**1. [Rule 3 - Grouping] Task 1 and the init route share a commit.** The tracer test file also contains the init cases, so the init route change was committed with Task 1 (`8a1d062a`, `security:` prefix) to keep every commit green. The second commit (`360cea50`) holds the admin-extra tour test.

**2. [Rule 1 - Correctness] `tour_title` clamp is 200, not 500.** Migration 092 has `CHECK (char_length(tour_title) <= 200)`; clamping to 500 would fail the insert for a long title.

**3. Policy read order.** The plan's interface did not say the policy read had to move; it did, because `priced.tour` is only known after pricing. For non-tour trips the only difference is that a failing policy read now surfaces after consent / validation / pricing errors instead of before them. All existing card-checkout tests are green.

Otherwise the plan executed as written.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-93-45 (same `tourPolicy` for preview, consent and snapshot, round-trip test), T-93-46 (reasons only past the gate and only for tours, opaque test), T-93-47 (PRICE_CHANGED test), T-93-48 (tour meta carries ids and the EN title only) are implemented and tested.

## Notes for the orchestrator

- `app/api/create-payment-intent/route.ts` (pay-now) also calls `buildCheckoutMeta`; a tour body sent there now carries the tour keys into Stripe metadata and its row, but pay-now stays outside this plan: it stores no `tour-` snapshot. If tours must be refused or handled there, that belongs to a later plan (CARD_FLOW_TRIP_TYPES keeps tours on the card flow).
- Worktree: `node_modules` is a symlink, not committed.

## Self-Check: PASSED

- FOUND: tests/card-checkout-tour.test.ts, app/api/card-checkout/intent/route.ts, app/api/card-checkout/init/route.ts, lib/supabase.ts, lib/checkout/compute.ts, tests/helpers/fake-payments-db.ts
- FOUND commits 8a1d062a, 360cea50
