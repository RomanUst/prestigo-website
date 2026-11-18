---
phase: 93-day-trips-custom-tours
plan: 06
subsystem: crm-sync-admin
tags: [trip-type, espocrm, admin-patch, pricing-guard, security]
requires:
  - phase: 93-01
    provides: bookings.trip_type accepts 'tour' (migration 092 live, no CHECK on trip_type)
provides:
  - "'tour' in TRIP_TYPE_VALUES (lib/customer-mapping.ts, infra/espocrm/lib/booking-map.mjs)"
  - "CBooking tripType option 'tour' (Day trip) in infra/espocrm/fields.json"
  - "'tour' in KNOWN_TRIP_TYPES (admin dispatch route)"
  - "error code TOUR_PRICE_FIXED (admin bookings PATCH)"
affects: [93-28 go-live (owner runs infra/espocrm/sync.mjs), tour checkout plans]
tech-stack:
  added: []
  patterns: ["tour bookings bypass the pricing engine in admin PATCH; operator override stored as entered"]
key-files:
  created: [tests/admin-bookings-tour.test.ts]
  modified:
    - lib/customer-mapping.ts
    - infra/espocrm/lib/booking-map.mjs
    - infra/espocrm/fields.json
    - app/api/admin/bookings/dispatch/route.ts
    - app/api/admin/bookings/route.ts
    - tests/customer-mapping-parity.test.ts
    - tests/espocrm-model.test.ts
    - tests/espocrm-booking-map.test.ts
    - tests/admin-bookings-dispatch.test.ts
key-decisions:
  - "Guard keys on the real price-affecting field set (vehicle_class, addresses, distance_km), not on pickup date/time, which never re-price in the existing route"
  - "espocrm-booking-map TripType parity test now expects the wizard union plus 'tour' (wizard TripType union stays unchanged)"
status: complete
metrics:
  completed: 2026-11-18
  tasks: 2
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 62c473eeedad4d3de91200b645ccb3834b23a007
plan_head_after: e56322af35200f4a55bfd20e4c6ddf354e47c8fa
---

# Phase 93 Plan 06: Tour trip type in CRM mapping, dispatch and admin edits Summary

A booking with trip_type 'tour' now maps to an EspoCRM CBooking draft with tripType 'tour', is accepted by the dispatch filter, and is never re-priced by the admin PATCH (422 TOUR_PRICE_FIXED unless override_price).

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 (tracer) CRM mapping accepts 'tour' | 73f99ee4 | 'tour' appended to TRIP_TYPE_VALUES in both mapping files (parity kept), fields.json tripType option + "Day trip" label, pinned lists updated |
| 2 Dispatch filter and PATCH guard | e56322af (`security:`) | KNOWN_TRIP_TYPES gains 'tour'; PATCH guard + tour branch that skips pricing config and engine |

## Behaviour

- Price-affecting edit (vehicle_class, origin/destination address, distance_km) of a tour booking without override_price: 422 `{ code: 'TOUR_PRICE_FIXED', error: 'Tour prices are fixed. Use Override price to change this booking.' }`, nothing written.
- With override_price: the operator's amount_czk is stored as entered (amount_eur via czkToEur), the old fixed amount is the "standard" shown in the override note; `computeOutboundLegTotal` and `getPricingConfig` are never called (spy-tested).
- operator_notes, status and cheap edits (pickup date/time, client fields) on tour bookings work as before. POST (manual booking) enum is untouched (no 'tour').
- Wizard `TripType` union and the quote line CHECK (091) unchanged.

## Deviations from Plan

**1. [Rule 3 - Blocking] tests/espocrm-booking-map.test.ts parity test**
- **Found during:** Task 1
- **Issue:** the existing test required `TRIP_TYPE_VALUES` to equal the wizard `TripType` union in types/booking.ts; the plan keeps that union unchanged, so the test would fail.
- **Fix:** expects the union plus 'tour'.
- **Files:** tests/espocrm-booking-map.test.ts (not in the plan's file list)

**2. [Judgement] PATCH guard scope narrower than the plan's wording**
- The plan lists "date, time, vehicle, addresses, hours" as price-affecting and a test bullet expects pickup_date without override_price to return 422. In the existing route, pickup date/time are cheap edits that never re-price, and hours is not editable via PATCH. The guard therefore covers the real PRICE_EDIT_FIELDS (vehicle_class, origin_address, destination_address, distance_km); a pickup date change alone stays allowed (test asserts no recompute and no amount write). Refusing a reschedule of a tour would block a normal operator action without any price-safety gain. If the owner wants date/time blocked too, add them to the guard condition in app/api/admin/bookings/route.ts (one line) and flip the test.

## Owner action (go-live, plan 93-28)

Run `infra/espocrm/sync.mjs` so CBooking tripType gets the 'tour' option before any tour booking syncs (T-93-16). Not run here (no live CRM access from the worktree).

## Verification

- `npx vitest run --exclude '.claude/**'` on admin-bookings-tour, admin-bookings, admin-bookings-dispatch, admin-bookings-edit-payment, customer-mapping-parity, espocrm-model, espocrm-booking-map: 7 files, 446 tests passed. (lead-sync-booking also passed in Task 1: 261 tests across 4 files.)
- `npx tsc --noEmit`: 8 errors, all the old baseline errors in tests/.
- `npx eslint --quiet` on the changed source and the new test: clean.
- Tests mocking next-intl server modules were not involved; no load problems in the worktree.

## Known Stubs

None.

## Threat Flags

None. T-93-15 (admin re-price of tour) and T-93-16 (CBooking enum drift) mitigated as planned.

## Self-Check: PASSED

- FOUND: tests/admin-bookings-tour.test.ts, all modified files
- FOUND commits: 73f99ee4, e56322af
