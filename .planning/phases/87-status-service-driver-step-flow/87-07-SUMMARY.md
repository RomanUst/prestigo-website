---
phase: 87-status-service-driver-step-flow
plan: 07
subsystem: api, gnet
tags: [gnet, idempotency, conditional-claim, status-push, vitest]
status: complete

requires:
  - phase: 87-01
    provides: lib/gnet-push.ts pushGnetForTransition (single GNet push)
  - phase: 87-03
    provides: CAS winner is the only pusher per transition
provides:
  - "lib/gnet-push.ts: claim-then-push, one GNet request per status per booking, failed push retried once on the next call"
  - "tests/gnet-push.test.ts: stateful-row unit tests (claim, retap, failed-push retry, missing row, unmapped status, claim error)"
  - "D-22 and Pitfall 7 pins in tests/gnet-client.test.ts and tests/gnet-farmin.test.ts"
affects: [87-08 driver trip route (replay of an applied step calls pushGnetForTransition), 87-13]

key-files:
  created:
    - tests/gnet-push.test.ts
  modified:
    - lib/gnet-push.ts
    - tests/gnet-status-push.test.ts
    - tests/booking-status-service.test.ts
    - tests/admin-assignment.test.ts
    - tests/gnet-client.test.ts
    - tests/gnet-farmin.test.ts

key-decisions:
  - "Existence check after a zero-row claim uses maybeSingle(), so a missing gnet_bookings row is data null without a PostgREST single() error"
  - "Claim errors (db error on the conditional update) are logged as '<tag> claim failed' and the push is skipped; the whole body is wrapped so nothing throws into after()"
  - "On push failure only last_push_error is written (by row id); last_push_status stays X so the next call re-claims via the 'error not null' branch"

requirements-completed: [DRV-05]

plan_head_before: ac6714b7ae80e9eadebf71336a9c9edfaf9b6cca
plan_head_after: 0d9eb30facb77943dbe4659d403218c02d74f97c
commits: 2
actuals:
  tokens: 14000
  tasks: 2
  commits: 2

coverage:
  - id: D1
    description: "A gnet booking's status reaches GNet once per status; a retap sends nothing; a failed push is retried once then quiet"
    requirement: "DRV-05"
    verification:
      - kind: unit
        ref: "tests/gnet-push.test.ts"
        status: pass
      - kind: integration
        ref: "tests/gnet-status-push.test.ts, tests/booking-status-service.test.ts, tests/admin-assignment.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "on_board and no_show map to null (nothing pushed); the six existing mappings unchanged"
    requirement: "DRV-05"
    verification:
      - kind: unit
        ref: "tests/gnet-client.test.ts#prestigoToGnetStatus"
        status: pass
    human_judgment: false
  - id: D3
    description: "A GNet-originated cancel through /api/gnet/farmin never pushes CANCEL back and never calls the status service"
    requirement: "DRV-05"
    verification:
      - kind: unit
        ref: "tests/gnet-farmin.test.ts#POST /api/gnet/farmin cancellation"
        status: pass
    human_judgment: false

completed: 2026-11-03
---

# Phase 87 Plan 07: Idempotent GNet status push Summary

**`pushGnetForTransition` now claims each push with one conditional update on `gnet_bookings` (`last_push_status IS NULL OR <> X OR last_push_error IS NOT NULL`) and calls GNet only when it won the claim, so a retap or replay sends nothing and a failed push is retried exactly once; on_board and no_show are pinned as unpushed and the farm-in cancel is pinned as never echoed.**

## Accomplishments

- **Tracer (Task 1).** Rewrote the inside of `pushGnetForTransition` (signature unchanged): claim update with `.eq('booking_id').or(...).select('id, gnet_res_no')`; zero rows claimed means either already pushed (silent) or no row (`no gnet_bookings row for` log, via `maybeSingle`); on a push throw only `last_push_error` is written by row id (status stays X, STATUS-03), so the next call re-claims and retries. The X in the or-filter comes only from the fixed `PRESTIGO_TO_GNET_STATUS` map. All errors are caught and logged; the helper never throws into `after()`.
- **Tests.** New `tests/gnet-push.test.ts` (11 tests) models `gnet_bookings` as one stateful row and evaluates the claim predicate, so the retap and fail-then-retry-then-quiet sequences are real, not recorded. The three older suites that mocked the old select/update chain were moved to the claim chain with their assertions about which status is pushed and which errors are recorded kept (`gnet-status-push` still has all 17 `it(` titles).
- **D-22 / Pitfall 7 (Task 2).** `prestigoToGnetStatus('on_board')` and `('no_show')` are `null`; a farm-in CANCEL test mocks `@/lib/gnet-client`, `@/lib/gnet-push` and `@/lib/booking-status-service` and asserts none is called while the booking still goes to `cancelled`. No source change in `lib/gnet-client.ts` or `app/api/gnet/farmin/route.ts` (verified `git diff --quiet HEAD`).
- D-05: no hold, capture or charge call exists on the GNet path (status only).

## Task Commits

1. **Task 1 (tracer): idempotent claim-then-push** - `87b2a49e` (security)
2. **Task 2: D-22 and no-echo pins** - `0d9eb30f` (test)

Tracer gate: the tracer `<verify>` (push, status-push and service suites plus scoped tsc) was green and the task carries no `blocking-human` gate, so expansion proceeded.

## Known limitations

- **Delivery is at-most-once across a crash (D-04).** The claim commits before the GNet call. A process that dies after the claim and before the GNet call returns or its error is recorded (for example an `after()` timeout) leaves `last_push_status = X` with `last_push_error` null, so that status is never retried. The booking's next status still reaches GNet. Accepted deliberately: the reverse order (push, then record) duplicates on retry, which D-04 forbids, and the window is a single outbound call. Not fixed here; carried to 87-13 as planned. The limitation is also stated in the `lib/gnet-push.ts` doc comment.
- The claim is per booking and status value, not per transition event: if a booking legitimately returns to a status already marked pushed, GNet is not told again. The transition graph has no such loop for mapped statuses.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two extra test files moved to the claim chain**
- **Found during:** Task 1 verify run
- **Issue:** `tests/booking-status-service.test.ts` (two GNet cases) and `tests/admin-assignment.test.ts` (Test C, call-order sensitive: call 4 is now the claim `update().eq().or().select()` instead of `select().eq().single()`) mocked the old select/update chain and failed once the helper changed. They are not in the plan's `files_modified`.
- **Fix:** mocks adapted to the claim chain; the assertions that the right status is pushed, once, with the right log prefix and error are kept (the failure-path audit assertion now checks claim payload first, then `{ last_push_error }` second).
- **Files modified:** tests/booking-status-service.test.ts, tests/admin-assignment.test.ts
- **Commit:** 87b2a49e

**Total deviations:** 1 (Rule 3, test-only). **Impact:** none on production behaviour beyond the planned idempotency.

## Issues Encountered

- `npx eslint` reports four errors in `tests/gnet-client.test.ts` (line 237 `@ts-expect-error` description) and `tests/gnet-farmin.test.ts` (three `no-explicit-any`); all sit in lines this plan did not touch and predate it. Left alone per scope boundary.
- Scoped `tsc` is clean for the changed files; the shell tool refuses compound git commands in this worktree, so the plan ledger read used separate plain commands.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or schema. T-87-20 mitigated (conditional claim, tests prove one request per status and one retry after failure); T-87-21 mitigated (farm-in stays a direct allowlisted writer, test asserts no push and no service call); T-87-SC: no package installs.

## Next Phase Readiness

Ready for 87-08: a driver replay of an already-applied step can call `pushGnetForTransition` again; a failed push is retried and a successful one is not repeated.

## Self-Check: PASSED

- Files exist: lib/gnet-push.ts, tests/gnet-push.test.ts, tests/gnet-client.test.ts, tests/gnet-farmin.test.ts
- Commits exist: 87b2a49e, 0d9eb30f
- Verification: gnet-push, gnet-status-push, booking-status-service, admin-assignment, admin-bookings, admin-bookings-cancel, status-writers-gate (236 tests) and gnet-client, gnet-farmin (43 tests) green; `grep -c "last_push_error.not.is.null" lib/gnet-push.ts` prints 1; `grep -c 'at-most-once'` on this file is at least 1; STATE.md and ROADMAP.md untouched.
