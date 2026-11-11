---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 15
subsystem: admin-bookings
tags: [airport-pickup, landing, admin-route, security, D-08, D-11]
requires:
  - phase: 91-07
    provides: lib/airport-pickup.ts (pickupFromLanding, LANDING_OFFSETS)
  - phase: 91-12
    provides: TripRouteSection and the landing_pickup_mismatch guard of the general trip edit
provides:
  - applyLandingChange, the single operator move of landing and pickup
  - POST /api/admin/bookings/[id]/landing
  - MovePickupDialog and the "Move pickup…" button in the Route section
affects: [admin booking panel, calendar sync via the generated pickup instant, card hold timing]
tech-stack:
  added: []
  patterns: [compare-and-set update with .select('id') row count, notify AND-gate with logEmail dedup copied from the trip-edit PATCH]
key-files:
  created:
    - lib/landing-change.ts
    - app/api/admin/bookings/[id]/landing/route.ts
    - components/admin/MovePickupDialog.tsx
    - tests/landing-change.test.ts
    - tests/admin-landing-route.test.ts
    - tests/move-pickup-dialog.test.tsx
  modified:
    - components/admin/TripRouteSection.tsx
    - components/admin/BookingDetailPanel.tsx
key-decisions:
  - "Compare-and-set on landing_date, landing_time, pickup_date and pickup_time (plan said pickup only): also catches a second move that changed the landing but ended on the same pickup."
  - "A move to the landing the booking already has answers 200 with no write, audit, re-evaluation or email; the dialog disables the confirm button for it."
  - "The dialog reports onMoved with pickup_utc: null so the board and calendar read the new date and time instead of the stale instant (same as handleTripUpdated)."
requirements-completed: [STOP-05]
status: complete
commits: 2
plan_head_before: 61e023006332629e8c15a27c8ea5525e86358754
plan_head_after: 1c0d8d9f3d285a1abdf76dcf00d580b83d3817da
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
---

# Phase 91 Plan 15: Move pickup for a late flight Summary

**Operator-only "Move pickup…" for airport bookings: new landing + stored offset, recomputed and compare-and-set on the server, with the same audit, payment re-evaluation and optional client notice as a manual time edit.**

## What was built

- `lib/landing-change.ts` `applyLandingChange`: reads the booking, 404 / 422 no_landing / 422 final_status / 409 payment_in_progress (existing `assertEditablePrecheck`), derives the pickup with `pickupFromLanding` and the stored offset (422 invalid_landing), 409 `pickup_changed` (with the server pickup) when it differs from the pickup the dialog showed, then updates landing and pickup together with a compare-and-set (0 rows gives 409 `stale`). Afterwards: `reevaluateAfterEdit({ priceChanged: false, pickupChanged })`, the notify AND-gate (operator tick AND `notification_flags.booking_changed`, `logEmail` as the dedup gate), one `booking_edit_audit_log` row per changed field with the operator id and the real `notified` value, and `sendBookingChangedEmail` in `after()`. The generated pickup instant is never written.
- `POST /api/admin/bookings/[id]/landing`: `enforceMaxBody`, `getAdminUser` (401 / 403 before the body is read), uuid (400), JSON (400), strict schema (400, `landing_time` 25:00 is 400), then the function; the catch logs the booking id and a fixed message only.
- `MovePickupDialog`: prefilled from the stored landing or from the flight's estimated arrival in Prague time when set and different; shows "Now: landing 14:00, pickup 14:30 (+30 min)" and "Move pickup to 15:40" (with "on <date>" past midnight) before anything is sent; "Notify client" off by default; the POST goes only from "Confirm move"; an in-flight ref blocks a double submit and the dialog cannot be closed while pending; server errors map to readable lines.
- `TripRouteSection` renders "Move pickup…" for a booking with a landing and an offset whose status is not completed, cancelled or no_show, and hands the patch to `BookingDetailPanel` (`handleTripUpdated`, which also refreshes the payment panel).

## Task commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | operator moves the pickup to new landing + offset | 4efa5ae0 |
| 2 | route guards, notices, midnight/DST, nothing moves automatically | 1c0d8d9f |

## Verification

- `npx vitest run tests/landing-change.test.ts tests/admin-landing-route.test.ts tests/move-pickup-dialog.test.tsx tests/trip-route-section.test.tsx tests/booking-detail-panel.test.tsx tests/admin-flight-refresh.test.ts tests/cron-flight-refresh.test.ts tests/admin-no-hardcoded-colors.test.ts` all green (flight-refresh tests unmodified).
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/` only. `npx eslint --quiet` on all touched source files: exit 0.
- Import proof: `grep -rl "@/lib/landing-change" app lib components` prints only the landing route; the same check is a test.
- Acceptance greps: `reevaluateAfterEdit` appears in `lib/landing-change.ts`; no non-comment mention of the generated pickup instant column; "Move pickup to" in the dialog.
- Browser check of the dialog was not run (executor worktree has no preview server); the dialog is covered by component tests.

## Deviations from Plan

None - plan executed exactly as written, apart from the stricter compare-and-set noted under key-decisions (a refinement inside the planned CAS, not a new behaviour).

Task 2 needed no code fixes: the cases it lists passed against the Task 1 implementation, so its commit contains the tests only.

## Threat model status

- T-91-43 (automation): only the landing route imports `lib/landing-change`; flight-refresh routes untouched (both asserted by tests).
- T-91-44 (stale / concurrent): `pickup_changed` check, CAS (`stale`), payment in-flight precheck.
- T-91-45 (non-admin): `getAdminUser` first, strict schema.
- No package installs (T-91-SC accepted).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register.

## Issues Encountered

None.

## Self-Check: PASSED

- lib/landing-change.ts, app/api/admin/bookings/[id]/landing/route.ts, components/admin/MovePickupDialog.tsx, tests/landing-change.test.ts, tests/admin-landing-route.test.ts, tests/move-pickup-dialog.test.tsx all exist.
- Commits 4efa5ae0 and 1c0d8d9f exist on the worktree branch.
