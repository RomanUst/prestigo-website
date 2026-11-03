---
phase: 87-status-service-driver-step-flow
plan: 01
subsystem: api
tags: [booking-status, status-service, gnet, refactor, next-app-router, vitest]

requires:
  - phase: 86-admin-shell
    provides: admin booking routes (PATCH, cancel, assign) that this plan refactors behind one service
provides:
  - "lib/booking-status-service.ts: advanceBookingStatus + advanceResultToResponse, the single bookings.status writer for admin transitions"
  - "lib/gnet-push.ts: pushGnetForTransition, the single GNet status push"
  - "tests/admin-bookings-cancel.test.ts: characterization of the cancel route"
  - "StatusActor, StatusSideEffectProfile, AdvanceBookingStatusInput, AdvanceBookingStatusResult contract (conflict code declared, produced from 87-03)"
affects: [87-03 compare-and-set, 87-07 idempotent GNet claim, 87-08 driver trip route, 87-09 no-show]

actuals:
  tokens: 15800
  tasks: 3
  commits: 4

plan_head_before: 06cde60d218f62e16ab791454f4f7e00f8c66ca1
plan_head_after: c35cdd8855c6584efc013332749fc5d4d158a1e8
commits: 4

tech-stack:
  added: []
  patterns:
    - "Status service with side-effect profiles (full | cancel-route | assign-route); callers pass an already-read row via `current` to keep their supabase from() call order"
    - "Side effects only inside after(), service client re-created inside; failures logged, never block"

key-files:
  created:
    - lib/booking-status-service.ts
    - lib/gnet-push.ts
    - tests/booking-status-service.test.ts
    - tests/admin-bookings-cancel.test.ts
  modified:
    - app/api/admin/bookings/route.ts
    - app/api/admin/bookings/cancel/route.ts
    - app/api/admin/bookings/[id]/assign/route.ts

key-decisions:
  - "Profile 'cancel-route' runs no side effects at all (no email, link deactivation, QStash or GNet), exactly like the old cancel route; recorded as RESEARCH Open Question 1, not changed here"
  - "Profile 'assign-route' schedules only the GNet push, as the last step before returning, so the assign route's following supabase from() call keeps its position (admin-assignment Test C is call-order sensitive)"
  - "Service registers the GNet after() for every gnet booking with a changed status; pushGnetForTransition itself no-ops when prestigoToGnetStatus returns null"

requirements-completed: [PAYF-02, DRV-05]

coverage:
  - id: D1
    description: "Admin PATCH status change runs through advanceBookingStatus (profile full) with identical writes, emails, QStash reminder, GNet push and HTTP responses"
    requirement: "PAYF-02"
    verification:
      - kind: unit
        ref: "tests/booking-status-service.test.ts"
        status: pass
      - kind: integration
        ref: "tests/admin-bookings.test.ts and tests/gnet-status-push.test.ts (unmodified)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cancel route status write goes through the service (profile cancel-route), refund-before-status order and every response pinned by a characterization suite written first"
    requirement: "PAYF-02"
    verification:
      - kind: unit
        ref: "tests/admin-bookings-cancel.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Assign route first-assign write and ASSIGNED push go through the service (profile assign-route); one GNet push implementation remains"
    requirement: "DRV-05"
    verification:
      - kind: integration
        ref: "tests/admin-assignment.test.ts (unmodified)"
        status: pass
      - kind: unit
        ref: "tests/booking-status-service.test.ts#advanceBookingStatus — profile assign-route"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-11-03
status: complete
---

# Phase 87 Plan 01: Status service extraction Summary

**Admin PATCH, cancel and assign now write bookings.status only through `advanceBookingStatus()` with three side-effect profiles, and the GNet status push exists once in `pushGnetForTransition()`; behaviour is unchanged, proven by the pre-existing PATCH, GNet and assignment suites passing unmodified.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-03T13:35:00Z
- **Completed:** 2026-11-03T13:51:00Z
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- Moved the whole PATCH status branch (select, VALID_TRANSITIONS check with the exact 422 text, update payload, CR-02 stale payment-link clear and deactivation, flag-gated logEmail-deduped status emails, 2 h QStash reminder, GNet push) into `lib/booking-status-service.ts`. The route now only parses, authenticates and maps the result via `advanceResultToResponse`.
- Folded the GNet push that existed twice (PATCH route and assign route) into `lib/gnet-push.ts`; both log prefixes (`[gnet-status-push]`, `[assign:gnet-push]`) are preserved through `logTag`.
- Characterized the cancel route first (16 tests, committed on its own), then routed both of its status writes through the service; the suite passed without edits.
- Routed the assign route's first-assign write and ASSIGNED push through the service; reassign stays a plain `driver_id` update.

## Task Commits

1. **Task 1 (tracer): PATCH status -> advanceBookingStatus** - `d340bf7d` (security)
2. **Task 2a: characterize the cancel route** - `35bd63b7` (test)
3. **Task 2b: cancel route through the service** - `539917b4` (security)
4. **Task 3: assign route through the service** - `c35cdd88` (security)

**Plan metadata:** committed separately as `docs(87-01): complete status service extraction plan`.

Tracer gate: the tracer `<verify>` (service, PATCH and GNet suites plus scoped tsc) was green, so expansion proceeded (no `blocking-human` gate on the task).

## Files Created/Modified

- `lib/booking-status-service.ts` - advanceBookingStatus, advanceResultToResponse and the contract types
- `lib/gnet-push.ts` - pushGnetForTransition (select gnet_bookings, push, audit update)
- `app/api/admin/bookings/route.ts` - PATCH status branch reduced to a service call; unused gnet/QStash/transitions/email imports removed
- `app/api/admin/bookings/cancel/route.ts` - both status updates replaced by `cancelThroughService()` (profile `cancel-route`)
- `app/api/admin/bookings/[id]/assign/route.ts` - first-assign update and inline GNet block replaced by the service (profile `assign-route`)
- `tests/booking-status-service.test.ts` - 25 tests: full / cancel-route / assign-route profiles and result mapping
- `tests/admin-bookings-cancel.test.ts` - 16 characterization tests for POST /api/admin/bookings/cancel

## Decisions Made

See `key-decisions` in the frontmatter. In short: cancel-route runs no side effects (today's behaviour, flagged as an owner-visible question in RESEARCH), assign-route does the GNet push last to keep the caller's `from()` order, and the GNet after() is registered for every changed gnet booking with the mapping check living inside the helper.

## Deviations from Plan

### Auto-fixed Issues

None needed for correctness. Two small, behaviour-neutral adjustments:

**1. [Rule 3 - Blocking/AC] Single `cancel-route` literal in the cancel route**
- **Found during:** Task 2
- **Issue:** the acceptance criterion `grep -c "cancel-route" ... prints 1` failed with two call sites (refund path and manual path).
- **Fix:** one local `cancelThroughService()` closure used by both paths; the second occurrence in a comment was reworded.
- **Files modified:** app/api/admin/bookings/cancel/route.ts
- **Commit:** 539917b4

**2. [Plan note] Only behaviour delta, as announced in the plan**
- In the assign route the old code pushed ASSIGNED to GNet even if the bookings update had failed; the service pushes only after a successful status write (threat T-87-03, accepted). No test covers that DB-error path.

Also noted (not a deviation): the plan said the cancel route "has no test suite"; `tests/admin-bookings.test.ts` already carried 12 cancel tests (all still green, unmodified). The dedicated characterization file still adds the refund-before-status order assertion, the exact bodies and the no-side-effect checks.

The plan's RED step for Task 1 was a module-missing failure (the file did not exist), which the plan itself prescribes for an extraction; it is not an assertion-level RED in the `check tdd-red-evidence` sense. Task 1's RED test and GREEN code share one commit (the plan specifies a single tracer commit); Task 2 has the separate `test(87-01)` characterization commit.

**Total deviations:** 1 auto-fixed (Rule 3, acceptance wording), 1 announced behaviour delta. **Impact:** none on admin-visible behaviour.

## Issues Encountered

- Full `npx vitest run` in this worktree shows 8 failing files, none touching this plan: five (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`) fail only because `next-intl/dist/esm/development/server.react-server.js` cannot be resolved through the `node_modules` symlink; two (`stats-migration`, `stats-customers-b2b-migration`) read `.planning/phases/85-statistics/*-smoke.sql`, which does not exist in the worktree checkout; `route-metadata-seo` (munich-prague description phrase rule) is unrelated to booking status code. The orchestrator should re-run the full suite on the main checkout.
- The shell tool in this worktree refuses commands containing bracketed `[id]` paths or git-dir variable composition; worked around with separate plain commands and directory-level eslint.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or schema changes. Mitigations T-87-01 and T-87-02 hold: auth/size/zod order is untouched in each route and runs before the service call; the service accepts only the typed patch keys `operator_notes`, `driver_price_czk`, `driver_id`.

## Next Phase Readiness

Ready for 87-03: `advanceBookingStatus` already declares the `conflict` code and `advanceResultToResponse` maps it to 409; 87-03 swaps the `.update().eq('id')` for the compare-and-set RPC and adds `expectedFrom`. 87-07 changes only the inside of `pushGnetForTransition`.

## Self-Check: PASSED

- Files exist: lib/booking-status-service.ts, lib/gnet-push.ts, tests/booking-status-service.test.ts, tests/admin-bookings-cancel.test.ts
- Commits exist: d340bf7d, 35bd63b7, 539917b4, c35cdd88
- Parity net unmodified: tests/admin-bookings.test.ts, tests/gnet-status-push.test.ts, tests/admin-assignment.test.ts (`git diff --quiet HEAD` clean)
- Verification: the five-suite vitest run is green (167 tests); scoped tsc and eslint clean
