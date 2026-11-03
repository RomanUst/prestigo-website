---
phase: 87-status-service-driver-step-flow
plan: 03
subsystem: api, booking-status
tags: [compare-and-set, rpc, status-service, completion-event, gate-test, partner-booking, vitest]
status: complete

requires:
  - phase: 87-01
    provides: advanceBookingStatus / advanceResultToResponse extraction, three side-effect profiles
  - phase: 87-02
    provides: BOOKING_STATUSES, isPartnerBooking, assertMoneyEligible, migration 084 live (advance_booking_status, booking_status_log, completed_at)
provides:
  - "lib/booking-status-service.ts: compare-and-set status writes through the advance_booking_status RPC, expectedFrom stale-view guard, conflict result, completion emission"
  - "lib/booking-events.ts: emitBookingCompleted + BookingCompletedEvent, the single in-process completion hook for Phase 88"
  - "409 contract { error: 'status_conflict', currentStatus } (+ refund_id on cancel) for the admin and driver UI plans"
  - "tests/status-writers-gate.test.ts: direct bookings.status writer gate with a reasoned allowlist"
affects: [87-05 admin UI, 87-08 driver trip route, 87-09 no-show, 88 money, 89 no-show charge]

tech-stack:
  added: []
  patterns:
    - "Status write = supabase.rpc('advance_booking_status') with p_from = the validated status; applied false -> conflict, nothing else runs"
    - "Source-reading gate with a reasoned allowlist (same shape as VPS_ASYNC_ALLOWLIST) for a forbidden write pattern"

key-files:
  created:
    - lib/booking-events.ts
    - tests/status-writers-gate.test.ts
  modified:
    - lib/booking-status-service.ts
    - app/api/admin/bookings/route.ts
    - app/api/admin/bookings/cancel/route.ts
    - "app/api/admin/bookings/[id]/assign/route.ts"
    - tests/booking-status-service.test.ts
    - tests/admin-bookings.test.ts
    - tests/gnet-status-push.test.ts
    - tests/admin-assignment.test.ts
    - tests/admin-bookings-cancel.test.ts

key-decisions:
  - "expectedFrom is checked before VALID_TRANSITIONS, so a stale admin view gets 409 status_conflict (not 422) even when the attempted transition is also invalid from the real status"
  - "The RPC row is merged over the pre-read row for the result booking (completed_at included); side effects keep using the pre-read row as in 87-01"
  - "A malformed RPC answer (no data, or applied not a boolean) is db_error; applied false with a null current_status is not_found"
  - "Completion is scheduled in after() before the profile-specific early returns, so it holds for any profile and any actor"
  - "Cancel keeps refund-before-status; on a lost race after a refund it answers 409 with refund_id and logs '[cancel] refund issued but status changed' (money consequences are Phase 88/89)"
  - "Assign keeps the driver_assignments row on a lost first-assign race, skips the status write and the GNet push, logs, and returns 201 with booking_status = the current status"

requirements-completed: [PAYF-02, DRV-02, DRV-03, DRV-05]

commits: 3
plan_head_before: f0bdad82a7754f4a8b5c5e4abaa7b0fdeac799ee
plan_head_after: 4b0371c14b2ba40d25339a796e9277959a8e62fd
actuals:
  tokens: 15600
  tasks: 3
  commits: 3

coverage:
  - id: D1
    description: "Admin PATCH status writes are compare-and-set through advance_booking_status; a lost race or a stale expected_status is 409 status_conflict with the current status and no side effect"
    requirement: "PAYF-02"
    verification:
      - kind: unit
        ref: "tests/booking-status-service.test.ts#advanceBookingStatus — compare-and-set (D-01, PAYF-02)"
        status: pass
      - kind: integration
        ref: "tests/admin-bookings.test.ts (87-03 cases), tests/gnet-status-push.test.ts (lost CAS pushes nothing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "KNOWN_STATUSES and the PATCH zod status enum come from BOOKING_STATUSES (on_board, no_show accepted; arrived rejected)"
    requirement: "DRV-02"
    verification:
      - kind: integration
        ref: "tests/admin-bookings.test.ts#87-03 D-02"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cancel and assign use the same compare-and-set with defined, logged lost-race responses; no_show is terminal for cancel"
    requirement: "PAYF-02"
    verification:
      - kind: integration
        ref: "tests/admin-bookings-cancel.test.ts, tests/admin-assignment.test.ts#87-03"
        status: pass
    human_judgment: false
  - id: D4
    description: "One partner-aware completion event per booking, only on an applied CAS to completed, for any actor; no money path"
    requirement: "DRV-03"
    verification:
      - kind: unit
        ref: "tests/booking-status-service.test.ts#advanceBookingStatus — completion event (D-05, D-06)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A direct bookings.status writer outside the reasoned allowlist, or a second caller of the RPC, fails the suite"
    requirement: "PAYF-02"
    verification:
      - kind: unit
        ref: "tests/status-writers-gate.test.ts"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-11-03
---

# Phase 87 Plan 03: Compare-and-set status writes, completion event, writers gate Summary

**Every admin status write (PATCH, cancel, assign) now goes through the live `advance_booking_status` RPC with `p_from` = the validated status, so exactly one of two racing writers applies and the loser gets 409 `status_conflict` with the winner's status; a completed trip fires one partner-aware `emitBookingCompleted`, and a gate test fails on any new direct `bookings.status` writer.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3 (1 tracer, 2 auto/tdd)
- **Files:** 11 (2 created, 9 modified)

## Accomplishments

- **Tracer (Task 1).** The service replaced `update().eq('id')` with `supabase.rpc('advance_booking_status', { p_booking_id, p_from, p_to, p_actor_type, p_actor_id, p_source, p_patch })`. `p_patch` holds only `operator_notes`, `driver_price_czk`, `driver_id` and `clear_payment_link: true` (CR-02). `applied: false` becomes `conflict` (or `not_found` when `current_status` is null); an RPC error or malformed answer is `db_error`; on a conflict no email, QStash, link deactivation, GNet push or completion event runs. `expectedFrom` (admin `expected_status`) short-circuits to 409 before any RPC. `KNOWN_STATUSES` and the zod enum are built from `BOOKING_STATUSES`.
- **Cancel and assign (Task 2).** Cancel passes `expectedFrom = booking.status`, treats `no_show` as terminal (422, no refund), and answers 409 on a lost race (with `refund_id` and the `[cancel] refund issued but status changed` log line when a refund already went out). Assign passes `expectedFrom` and, on a lost first-assign race, keeps the assignment row, writes no status, pushes nothing to GNet, logs `[assign] status changed concurrently` and returns 201 with the current status.
- **Completion event and gate (Task 3).** `lib/booking-events.ts` exports `emitBookingCompleted` / `BookingCompletedEvent` (ids-only log line, no PII, no amount, no payment provider). The service schedules it in `after()` only when the compare-and-set to `completed` applied. `tests/status-writers-gate.test.ts` walks `app/` and `lib/`, flags `bookings` updates carrying a status key (literal or identifier payload), checks the four-entry reasoned allowlist for staleness and reason length, and pins `lib/booking-status-service.ts` as the only caller of the RPC.

## Task Commits

1. **Task 1 (tracer): admin PATCH -> service -> RPC, 409 on lost race** - `331e1631` (security)
2. **Task 2: cancel and assign on the same CAS** - `b64cd3d1` (security)
3. **Task 3: completion event + status writers gate** - `4b0371c1` (security)

Tracer gate: the tracer `<verify>` (service, PATCH and GNet suites, scoped tsc) was green and the task carries no `blocking-human` gate, so expansion proceeded.

## Handoff to Phase 88/89

This phase builds no money path; the obligations below are written for the Phase 88 and 89 planners (also in the header comment of `lib/booking-events.ts`).

**Consumer seam**
- `emitBookingCompleted(event)` in `lib/booking-events.ts`, called from `after()` in `lib/booking-status-service.ts` exactly when an applied compare-and-set moved a booking to `completed`, for any actor (admin PATCH `source: 'admin_patch'`, driver `source: 'driver_trip'` from 87-08).
- `BookingCompletedEvent = { bookingId, completedAt, partner, actorType, source }`. `partner` is `isPartnerBooking(booking)`, true for `booking_source = 'gnet'`. Phase 88 extends this function with its capture consumer; it must not add a second completion hook.

**assertMoneyEligible obligation (D-05)** - `assertMoneyEligible(booking)` from `lib/booking-status.ts` throws `PartnerBookingMoneyError` for partner bookings and MUST be called BEFORE acting by:
- Phase 88 hold entry point (pre-trip authorisation / hold)
- Phase 88 capture entry point (the consumer of `emitBookingCompleted`, and the sweeper below)
- Phase 89 no-show charge entry point
Nothing in Phase 87 enforces this; it is a planning obligation. The writers gate does not cover money code.

**completed_at sweep** - the in-process event runs in `after()` and can be lost. The durable facts are `bookings.completed_at` (set by the RPC only on the applying call) and the unique `completed` row in `booking_status_log`. Phase 88 MUST sweep rows with `completed_at IS NOT NULL` that were never captured so a lost `after()` never loses a capture. `completed_at` is NULL on historic completed rows (unknown, not not-completed).

## Files Created/Modified

- `lib/booking-status-service.ts` - RPC compare-and-set, `expectedFrom`, conflict/not_found/db_error mapping, completion emission
- `lib/booking-events.ts` - completion hook and the Phase 88/89 handoff header
- `app/api/admin/bookings/route.ts` - `BOOKING_STATUSES`-derived `KNOWN_STATUSES` and zod enum, `expected_status`
- `app/api/admin/bookings/cancel/route.ts` - `expectedFrom`, `no_show` terminal, 409 bodies, refund-issued log line
- `app/api/admin/bookings/[id]/assign/route.ts` - `expectedFrom`, lost-race handling, reported status
- `tests/status-writers-gate.test.ts` - new gate
- `tests/booking-status-service.test.ts`, `tests/admin-bookings.test.ts`, `tests/gnet-status-push.test.ts`, `tests/admin-assignment.test.ts`, `tests/admin-bookings-cancel.test.ts` - mocks moved from update chains to an `rpc` stub, plus the new behaviour cases

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cancel/assign mock updates landed in Task 1, not Task 2**
- **Found during:** Task 1
- **Issue:** The Task 1 verify runs `tests/admin-bookings.test.ts`, which contains the whole cancel describe block, and switching the service write to the RPC breaks every update-chain mock for cancel and assign. Leaving `tests/admin-bookings-cancel.test.ts` and `tests/admin-assignment.test.ts` red at the Task 1 commit would have broken the "green at every commit" rule.
- **Fix:** Task 1 moved the mocks of all five suites to the `rpc` stub with unchanged response assertions (assign Test A/C call numbering shifted by one because the first-assign write is no longer a `from()` call). Task 2 then added only the new behaviour cases and the route changes.
- **Commits:** 331e1631, b64cd3d1

**2. [Rule 1 - Bug, test-side] Test 8 of the PATCH block lost its update chain**
- A scripted edit of the Test 3..12 region also removed the `updateFn` declaration of Test 8 (operator_notes-only PATCH, which still uses `update().eq()`); caught by the first run and restored in the same task.

No production-code deviations. The pre-existing PATCH, GNet and assignment assertions on responses were kept as they were; only their mock mechanism changed.

**Total deviations:** 1 ordering deviation (Rule 3), 1 test-side slip fixed in-task. **Impact:** none on behaviour.

## Issues Encountered

- Full `npx vitest run` in this worktree: 300 files pass; the 9 failing files are not caused by this plan. Five (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`) fail only on next-intl server modules through the `node_modules` symlink; `stats-migration` and `stats-customers-b2b-migration` need the untracked phase 85 directory; `route-metadata-seo` is the pre-existing failure; `BookingWizard.test.tsx` failed once under full-suite load and passes alone (9 passed). The orchestrator should re-run the full suite on the main checkout.
- The shell tool in this worktree refuses commands that mix `[id]` paths with git or compound constructs; worked around with separate plain commands and directory-level eslint.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema; `expected_status` is a zod-validated enum on an existing admin route. Mitigations: T-87-09 (CAS in the RPC, loser 409 and no side effects; tests plus the 084 live smoke), T-87-10 (event only on applied CAS to completed; completed is terminal; unique log row in 084), T-87-11 (writers gate), T-87-12 (409 carries `refund_id` and the route logs the refund-issued line).

## Next Phase Readiness

Ready for 87-05 (admin UI: handle 409 `status_conflict` with `currentStatus`, send `expected_status`) and 87-08 (driver route: reuse `advanceBookingStatus` unchanged with `actor: { type: 'driver', id }`, `source: 'driver_trip'`, `profile: 'full'`). 87-07 still replaces only the inside of `pushGnetForTransition`. The GNet farm-in cancel, Stripe webhook, payment-link route and `lib/supabase.ts` reconcilers remain direct system writers by design (allowlisted).

## Self-Check: PASSED

- Files exist: lib/booking-events.ts, tests/status-writers-gate.test.ts, lib/booking-status-service.ts
- Commits exist: 331e1631, b64cd3d1, 4b0371c1
- Verification: six-suite vitest run green (225 tests), scoped tsc clean, eslint clean on the changed source and routes; `grep -rln "rpc('advance_booking_status'" app lib` prints only lib/booking-status-service.ts; STATE.md and ROADMAP.md untouched.
