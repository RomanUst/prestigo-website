---
phase: 93-day-trips-custom-tours
plan: 20
subsystem: admin-dispatch-driver
tags: [tour, admin, dispatch, driver-screen, extra-charge, trip-edit]
requires:
  - phase: 93-06
    provides: trip_type 'tour' in dispatch filter and the PATCH guard (422 TOUR_PRICE_FIXED)
provides:
  - "'Tour' filter chip in BookingsTable and BookingsWorkspace"
  - "tourDisplay(booking) helper in components/admin/bookingTypes.ts"
  - "Day trip rows in BookingDetailPanel, BoardCard and the driver TripScreen"
  - "read-only tour price + Override price in TripEditPanel"
  - "extra-hour hint in ExtraChargeModal (tourVehicleClass prop)"
affects: [93-28 go-live, tour checkout plans]
tech-stack:
  added: []
  patterns: ["admin hint-only fetch that never blocks the dialog on failure"]
key-files:
  created: [tests/admin-booking-tour-display.test.tsx]
  modified:
    - components/admin/bookingTypes.ts
    - components/admin/BookingsTable.tsx
    - components/admin/BookingsWorkspace.tsx
    - components/admin/BookingDetailPanel.tsx
    - components/admin/TripEditPanel.tsx
    - components/admin/ExtraChargeModal.tsx
    - components/admin/PaymentPanel.tsx
    - components/admin/dispatch/BoardCard.tsx
    - app/(internal)/driver/trip/[token]/TripScreen.tsx
    - app/(internal)/driver/trip/[token]/page.tsx
key-decisions:
  - "One tourDisplay() helper (title + hours text) shared by the panel, the board card and the driver page, so the wording cannot drift"
  - "Tour price review skips /api/calculate-price (no standard rate exists); Confirm stays disabled until Override price is ticked"
status: complete
metrics:
  completed: 2026-11-18
  tasks: 2
actuals:
  tokens: 9500
  tasks: 2
  commits: 2
plan_head_before: 36e0c261d15b2525161a34ef45ccdc45a3f4fc13
plan_head_after: f13871c4eb8ff421e04a46c49e3c1a69f37b0a7c
---

# Phase 93 Plan 20: Tour bookings in admin, dispatch and the driver screen Summary

A tour booking now reads as "Day trip: Dresden" with "6 h at destination · 1 extra" in the admin detail panel, the dispatch board card and the driver trip screen; the Tour filter chip exists in both filter bars; the fixed tour price is read-only in the edit panel; and the extra-charge dialog shows the booked class's extra-hour price as a hint only.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 (tracer) Day trip rows + Tour chip | 7a352459 | chip in BookingsTable + BookingsWorkspace; `tourDisplay()`; "Trip", "Return to" (= pickup address) and "Time at destination" rows in BookingDetailPanel; `board-tour-line` in BoardCard; `driver-tour-line` in TripScreen; driver page selects trip_type, hours, tour_title, tour_extra_hours |
| 2 Read-only price + extra-hour hint | f13871c4 | TripEditPanel tour branch; ExtraChargeModal hint from GET /api/admin/tour-settings; PaymentPanel threads `tourVehicleClass` to the modal |

## Behaviour

- TripEditPanel, tour booking: "Review Price" opens the review without calling /api/calculate-price, shows the note "Tour prices are fixed. Use Override price to change this booking.", the amount input is read-only and Confirm & Save is disabled. Ticking "Override price" makes the amount editable and the PATCH carries `override_price: true`. Unticking restores the stored amount. The 93-06 server guard stays authoritative.
- ExtraChargeModal: for business / first_class / business_van it reads extra_hour_e / s / v_eur from tour settings and shows "Extra hour for this car: {amount}" (EUR via `formatMinor`). The amount field stays empty; nothing is charged automatically. A non-200 or malformed answer hides the hint without blocking the modal. Non-tour bookings never call the settings route.
- Driver screen: Phase 87 look kept (existing `--driver-*` / `--admin-*` tokens only); the line shows the title, the hours and "Return to the pickup address."

## Deviations from Plan

**1. [Rule 3 - Blocking] Files outside the plan's file list**
- `components/admin/bookingTypes.ts`: optional `tour_id`, `tour_title`, `tour_extra_hours` on `AdminBooking` plus the `tourDisplay()` helper (all admin views need the columns typed; they already arrive via `admin_search_bookings` `select b.*`).
- `components/admin/PaymentPanel.tsx`: the extra-charge modal is mounted inside PaymentPanel (not BookingDetailPanel), so the booked car class had to be passed through it (`tourVehicleClass`, optional, default null).
- `app/(internal)/driver/trip/[token]/page.tsx`: the driver page builds the `trip` props and its select string had to include the tour columns.

**2. [Judgement] Intermediate commit does not type-check alone**
- Task 1 commit (7a352459) passes `tourVehicleClass` from BookingDetailPanel to PaymentPanel, which Task 2 (f13871c4) declares. Both commits are in this plan; the tip type-checks.

**3. [Judgement] Driver strings are English**
- TripScreen is not localized (all existing strings are English), so the new lines follow it. No pattern change.

## Verification

- `npx vitest run --exclude '.claude/**'` on admin-booking-tour-display (17 tests), admin-no-hardcoded-colors, admin-bookings-edit-payment, booking-detail-panel, dispatch-board, bookings-workspace, extra-charge-modal, driver-trip-screen, driver-trip: 9 files, 401 tests passed.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (i18n-translate-dnt, nav-auth, passenger-actions).
- `npx eslint --quiet` on all touched files: clean.
- No colour literal added in any touched admin file (admin-no-hardcoded-colors green).

## Known Stubs

None.

## Threat Flags

None. No new endpoint or trust boundary; the UI hints defer to the server guards (T-93-55 via 93-06 TOUR_PRICE_FIXED, T-93-56: the dialog only shows a hint, the operator types and confirms through the existing consent-gated extra charge).

## Notes for the orchestrator

- The extra-hour hint depends on `GET /api/admin/tour-settings` (plan 93-07, not in this worktree's base); until it ships the hint is simply hidden.
- Tests were run inside the worktree and loaded without issue; re-run after merge as usual.

## Self-Check: PASSED

- FOUND: tests/admin-booking-tour-display.test.tsx
- FOUND commits 7a352459, f13871c4
