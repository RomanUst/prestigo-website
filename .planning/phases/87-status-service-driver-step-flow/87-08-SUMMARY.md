---
phase: 87-status-service-driver-step-flow
plan: 08
subsystem: api, driver-trip
tags: [driver-steps, status-service, start-gate, compare-and-set, strict-schema, token-gated-route, dst, vitest]
status: complete

requires:
  - phase: 87-03
    provides: advanceBookingStatus compare-and-set (expectedFrom, actor driver, source driver_trip, profile full), 409 status_conflict contract
  - phase: 87-04
    provides: pickupInstantMs in lib/prague-date.ts
  - phase: 87-02
    provides: DRIVER_STEPS, DRIVER_STEP_TARGET, DRIVER_STEP_TRIP_PROGRESS, nextStepFor, TERMINAL_BOOKING_STATUSES
provides:
  - "lib/driver-trip-step.ts: driverTripRequestSchema, loadDriverTripForStep, hasTripIdentity, driverTripStep, driverTripNote, buildTripView, TripStepResponse"
  - "lib/start-gate.ts: getStartGate, startUnlockAtMs, travelMinutesFromCentre, fallbackTravelMinutes, PRAGUE_CENTRE, CENTRE_RADIUS_KM"
  - "app/api/driver/trip/[token]/progress/route.ts rebuilt as a thin token-gated wrapper (never touches bookings)"
  - "HTTP contract for 87-10/87-11: 200 applied or replay, 400 invalid_token / Invalid payload / Invalid JSON, 409 step_conflict / too_early, 429, 500 update_failed"
affects: [87-09 no-show request, 87-10 driver UI, 87-11 driver UI, 87-13, 88, 89]

tech-stack:
  added: []
  patterns:
    - "Thin route + server module: the route guards and parses, lib/driver-trip-step.ts decides, the status service writes"
    - "Replay check before the terminal check, so a retried final step answers 200 instead of invalid_token"
    - "Injectable gate/fetch for time- and network-dependent logic; module-level bounded cache"

key-files:
  created:
    - lib/driver-trip-step.ts
    - lib/start-gate.ts
    - tests/driver-trip-step.test.ts
    - tests/start-gate.test.ts
  modified:
    - "app/api/driver/trip/[token]/progress/route.ts"
    - tests/driver-trip-progress.test.ts

key-decisions:
  - "Identity (driver match, not declined) is checked by the route and again inside driverTripStep / driverTripNote (defence in depth); terminal handling stays separate so a replay of the final step is still a 200"
  - "A service not_found maps to invalid_token and invalid_transition to step_conflict with the status the driver read; neither can look like success"
  - "A failed trip_progress mirror is logged and ignored: the booking status is the source of truth and the step already applied"
  - "Both the Maps result and the haversine fallback are cached per bookingId:lat:lng (max 500, oldest evicted) so the unlock instant does not flip between page loads and a Maps outage costs at most one 3 s wait per booking"
  - "The Routes API duration is parsed as a float seconds string ('1500.5s') and rounded up; the fallback and the Maps result are both capped at 240 minutes"
  - "Invalid payload answers carry no zod details (uniform { error: 'Invalid payload' })"

requirements-completed: [DRV-01, DRV-02, DRV-03, DRV-04, DRV-05]

commits: 3
plan_head_before: ac6714b7ae80e9eadebf71336a9c9edfaf9b6cca
plan_head_after: 4fe9683698288e0c2aa8f91f04f0514c9dbab048
actuals:
  tokens: 16900
  tasks: 3
  commits: 3

coverage:
  - id: D1
    description: "A driver step moves the booking exactly one strict step through the status service (actor driver, source driver_trip, CAS expectedFrom); skipped or stale steps are 409 step_conflict with the current status and next step and write nothing"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/driver-trip-step.test.ts#driverTripStep: accepted steps / strict order and conflicts"
        status: pass
      - kind: integration
        ref: "tests/driver-trip-step.test.ts#POST /api/driver/trip/[token]/progress: tracer end to end"
        status: pass
    human_judgment: false
  - id: D2
    description: "Repeats are harmless: a step already applied (including completed after the link became terminal) is a 200 replay with no service call, no write; a gnet replay re-offers pushGnetForTransition for the applied status"
    requirement: "DRV-04"
    verification:
      - kind: unit
        ref: "tests/driver-trip-step.test.ts#driverTripStep: replay"
        status: pass
    human_judgment: false
  - id: D3
    description: "Admin/driver race: a status change between the driver's read and write gives the driver 409 step_conflict carrying the admin's status and no mirror write"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/driver-trip-step.test.ts#an admin change between read and write"
        status: pass
    human_judgment: false
  - id: D4
    description: "Start gate: en_route is 409 too_early with unlocksAt before pickup - (120 min + travel); central pickups unlock exactly 120 min before the DST-safe pickup instant; Maps failures fall back to haversine, never block"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/start-gate.test.ts (DST 2027-03-28, 2027-10-31, 2026-03-29; Maps, cache, fallbacks)"
        status: pass
      - kind: unit
        ref: "tests/driver-trip-step.test.ts#start gate (D-14)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The driver can never send an amount, price or status: the request schema is strict { step } or { note }"
    requirement: "DRV-03"
    verification:
      - kind: unit
        ref: "tests/driver-trip-progress.test.ts#strict request schema; tests/driver-trip-step.test.ts#driverTripRequestSchema"
        status: pass
    human_judgment: false
  - id: D6
    description: "Security gates rewritten, not removed: route imports the step module and never queries bookings; CSRF prefix, rate-limit key, uniform invalid_token and 429 short-circuit asserted"
    requirement: "DRV-05"
    verification:
      - kind: unit
        ref: "tests/driver-trip-progress.test.ts (ISOLATION x3, source gate, CSRF/rate-limit)"
        status: pass
      - kind: unit
        ref: "tests/status-writers-gate.test.ts, tests/infra-vps-isolation-guard.test.ts"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-11-03
---

# Phase 87 Plan 08: Driver step route over the status service, start gate, rewritten gates Summary

**The token-gated driver route is now a thin wrapper over `advanceBookingStatus`: a driver advances a trip one strict step at a time (assigned -> en_route -> on_site -> on_board -> completed) with a compare-and-set, replays are 200 no-ops, skipped or raced steps get a 409 carrying the current state, and the first step is locked server-side until pickup minus 2 h minus the Prague-centre travel time.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 3 (1 tracer, 2 auto/tdd)
- **Files:** 6 (4 created, 2 modified)

## Accomplishments

- **Tracer (Task 1).** `lib/driver-trip-step.ts` holds the strict `{ step } | { note }` schema, the read-only loader (one `driver_assignments` select with the booking embedded), the identity rule, and `driverTripStep` in the stated order: identity, replay, terminal, strict next step, start gate, `advanceBookingStatus` (actor driver id, `source: 'driver_trip'`, `profile: 'full'`, `expectedFrom` = the validated status), then the `trip_progress` mirror (`on_site -> 'arrived'`) only after the compare-and-set won. A conflict from the service becomes 409 `step_conflict` with the winner's status and its next step; `db_error` becomes 500 `update_failed`. The route is a thin wrapper (size guard, `checkRateLimit('/api/driver/trip/progress')`, uuid, JSON, strict zod, lookup, step or note) with a new header comment stating the invariant: the route never touches the bookings table.
- **Start gate (Task 2).** `lib/start-gate.ts`: Old Town Square centre (50.0875, 14.4208), 5 km radius (no travel time inside), Routes API `computeRoutes` with field mask `routes.duration` and a 3 s abort timeout, haversine x 1.4 at 45 km/h fallback for any failure including a missing key, cap 240 min, bounded cache. The unlock instant comes from `pickupInstantMs`, so it is exact across DST (tests: 2026-11-12, 2027-03-28, 2026-03-29, repeated hour 2027-10-31). `driverTripStep` consults the gate only for `en_route` (409 `too_early` with `unlocksAt`); `buildTripView` returns `lockReason` `'waiting'` (confirmed/pending/unpaid) or `'too_early'` plus `unlocksAt`, and calls Maps only while the next step is `en_route`.
- **Gates (Task 3).** `tests/driver-trip-progress.test.ts` rewritten in place: the three ISOLATION tests now assert the new invariant (valid step calls the service once and never queries `bookings`; terminal step never reaches the service; note never calls the service), plus a source gate (route imports `@/lib/driver-trip-step`, no GNet/Chatwoot/EspoCRM import, no `.from('bookings')`, no `.update(`; step module imports the status service and has no bookings query), the middleware CSRF prefix and the `LIMITS` key read from source, the literal rate-limit key, 429 before Supabase, and ten strict-schema rejections.

## Task Commits

1. **Task 1 (tracer): driver step through the status service** - `0535ad90` (security)
2. **Task 2: start gate, DST-safe with Maps fallback** - `18d69c75` (security)
3. **Task 3: rewrite DTRIP-04 isolation gates** - `4fe96836` (security)

Tracer gate: the tracer `<verify>` (step suite plus scoped tsc) was green and the task carries no `blocking-human` gate, so expansion proceeded.

## Handoff to 87-09 / 87-10 / 87-11

- **Response contract:** `{ ok, status, nextStep, replay?, unlocksAt?, completedAt?, error? }`. 200 step applied or replay; 409 `{ ok: false, error: 'step_conflict', status, nextStep }` (refetch and show "The trip was updated by the office"); 409 `{ ok: false, error: 'too_early', status, nextStep: 'en_route', unlocksAt }`; 400 `{ error: 'invalid_token' }` is the single uniform dead-link answer; 500 `{ ok: false, error: 'update_failed', ... }`.
- **Server-rendered view:** `buildTripView({ booking, nowMs })` for the page; `loadDriverTripForStep` returns the booking fields the page needs (including `no_show_requested_at`). 87-09 adds the third strict union member `{ action: 'request_no_show' }` to `driverTripRequestSchema`.
- **Interim break to know about:** `app/(internal)/driver/trip/[token]/TripProgressClient.tsx` still posts the old `{ progress }` body, which the strict schema now rejects with 400 until 87-10/87-11 replace the UI. Do not merge this phase to `main` before those plans land.

## Files Created/Modified

- `lib/driver-trip-step.ts` - schema, loader, identity rule, step algorithm, note writer, trip view
- `lib/start-gate.ts` - travel estimate, unlock instant, gate
- `app/api/driver/trip/[token]/progress/route.ts` - thin wrapper
- `tests/driver-trip-step.test.ts` (44 + gate cases), `tests/start-gate.test.ts` (23), `tests/driver-trip-progress.test.ts` (rewritten)

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

None. The plan executed as written. Minor interpretation points: `gate` and `fetchImpl` are injectable (the plan's `gate?` input), the Task 1 `buildTripView` shipped without the gate and Task 2 wired it (so the tracer commit had no `start-gate` import), and the pre-existing `TripProgressClient` mismatch above is a UI-plan item, not a deviation.

## Issues Encountered

- The shell tool refuses compound commands that mention git-dir paths in this worktree, so the plan commit ledger file under the git dir could not be written; `plan_head_before` is the known worktree base (`ac6714b7`), and `commits: 3` was measured with `git rev-list --count ac6714b7..HEAD`.
- Not run here: the full suite (parallel plans 87-05 and 87-07 run concurrently; the orchestrator re-runs it on the merge). Targeted runs: the five plan suites (152 tests) and `tests/driver*` (4 files, 119 tests) are green; scoped tsc and eslint on all changed files are clean.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or schema. Mitigations: T-87-22 (identity, strict order, start gate, CAS, no amount input, 20/min limiter), T-87-23 (step must equal the next step or 409; replay writes nothing), T-87-24 (strict union, mass-assignment rejected with 400), T-87-25 (uuid check before DB, uniform invalid_token, limiter before lookup), T-87-26 (CSRF prefix and LIMITS key asserted from source), T-87-27 (3 s timeout, fallback, null pickup opens the gate, Maps only for the en_route step, cached). No package installs.

## Self-Check: PASSED

- Files exist: lib/driver-trip-step.ts, lib/start-gate.ts, tests/driver-trip-step.test.ts, tests/start-gate.test.ts, rewritten tests/driver-trip-progress.test.ts, route.ts
- Commits exist: 0535ad90, 18d69c75, 4fe96836
- Acceptance greps: route has 0 `from('bookings')`, 1 `@/lib/driver-trip-step`, 1 `'/api/driver/trip/progress'`; `advanceBookingStatus(` once in driver-trip-step; start-gate has `50.0875` once and `START_LEAD_MINUTES = 120`; tests cover 2027-10-31 and 2027-03-28; no `console.*apiKey`; ISOLATION appears 5 times, CSRF_PROTECTED_PREFIXES 2 times
- STATE.md and ROADMAP.md untouched
