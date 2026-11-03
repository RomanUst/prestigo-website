---
phase: 87-status-service-driver-step-flow
plan: 09
subsystem: api, driver-trip, no-show
tags: [no-show, driver-request, operator-alert, status-service, settings, outbox, token-gated-route]
status: complete

requires:
  - phase: 87-02
    provides: set_no_show_request RPC, bookings.no_show_requested_at, booking_status_log, pricing_globals.noshow_wait_city_min / airport_min (migration 084, live)
  - phase: 87-03
    provides: advanceBookingStatus (CAS), advanceResultToResponse
  - phase: 87-06
    provides: alert.no_show outbox event, noShowAlertKey, Chatwoot private-note handler (dispatcher only)
  - phase: 87-08
    provides: driverTripRequestSchema, loadDriverTripForStep, hasTripIdentity, TripStepResponse, thin driver route
provides:
  - "lib/no-show.ts: isAirportPickup, getNoShowThresholds, noShowAvailableAtMs, getNoShowView, requestNoShowForDriver, clearNoShowRequest, confirmNoShow, NoShowBody"
  - "lib/airport.ts: PRG_LAT, PRG_LNG, PRG_RADIUS_DEG, isNearAirport (moved from calculate-price)"
  - "lib/email.ts: sendNoShowRequestAlert (MANAGER_EMAIL, no client data)"
  - "driver route third strict member { action: 'request_no_show' } with the 200 / 400 / 409 step_conflict / 409 too_early / 500 contract"
  - "app/api/admin/bookings/[id]/no-show/route.ts: GET state, POST confirm / dismiss"
  - "/api/admin/settings noshow_wait_city_min / noshow_wait_airport_min (int 1..240)"
affects: [87-10 driver UI, 87-11 admin UI, 87-13 go-live, 89 no-show charge, 91]

tech-stack:
  added: []
  patterns:
    - "Server-owned waiting time: availability = max(pickup instant, latest on_location log row) + threshold, computed from DB facts on every request; client timer is display only"
    - "Single RPC caller helper (callSetNoShowRequest) so the set_no_show_request call exists once in the codebase"
    - "Alerts after the write: email dedupe by logEmail per request second, outbox row keyed by noShowAlertKey; each wrapped so a failure never fails the request"

key-files:
  created:
    - lib/no-show.ts
    - lib/airport.ts
    - "app/api/admin/bookings/[id]/no-show/route.ts"
    - tests/driver-no-show.test.ts
    - tests/admin-no-show.test.ts
  modified:
    - lib/driver-trip-step.ts
    - "app/api/driver/trip/[token]/progress/route.ts"
    - lib/email.ts
    - app/api/admin/settings/route.ts
    - app/api/calculate-price/route.ts
    - tests/admin-settings.test.ts

key-decisions:
  - "Order in requestNoShowForDriver: identity, terminal (invalid_token), status must be on_location (else 409 step_conflict), open request replay (200, no RPC, no alert), server waiting time (409 too_early with noShowAvailableAt), RPC, alerts"
  - "A failing on_location log read answers 500 update_failed (the waiting time cannot be proven); a missing log row falls back to the pickup instant; when neither a pickup instant nor a log row exists the gate fails open, like the start gate, because the operator still decides"
  - "RPC applied=false is resolved from the returned row: still on_location with a request set = 200 replay without alerts, otherwise 409 step_conflict with the real status"
  - "Driver name and booking reference for the email are read after the RPC (best effort) inside lib/no-show.ts, so the driver step loader and the 87-08 route stay untouched"
  - "The driver route calls requestNoShowForDriver directly instead of via lib/driver-trip-step.ts, avoiding a runtime import cycle (no-show imports hasTripIdentity from the step module)"
  - "Dismiss reports 500 only when the RPC itself fails; no open request is a normal 200 (idempotent). Confirm leaves no_show_requested_at set as history for Phase 89"
  - "clearNoShowRequest returns { applied, ok } (plan interface was { applied }) so the admin route can tell an RPC failure from a no-op"

requirements-completed: [DRV-01, DRV-02]

commits: 3
plan_head_before: 14c34330c8c81c5cdf04bd67fcfa5e8cf29107ed
plan_head_after: 19e9629c90c704c3d26ab6f18dbd2bca935ea0f3
actuals:
  tokens: 26000
  tasks: 3
  commits: 3

coverage:
  - id: D1
    description: "A driver request is accepted only at or after max(pickup, on_location time) + threshold (30 city / 60 airport, from settings, defaults on read failure); earlier is 409 too_early with noShowAvailableAt and no RPC"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/driver-no-show.test.ts#requestNoShowForDriver (city, airport coords and address, settings values, pickup-before-arrival, no log row, DST wall clock, settings failure)"
        status: pass
    human_judgment: false
  - id: D2
    description: "An accepted request sets no_show_requested_at via set_no_show_request (actor driver), never changes status (advanceBookingStatus not called), charges nothing; repeats are 200 replays without new alerts"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/driver-no-show.test.ts#city pickup at the threshold; open-request replay; lost race"
        status: pass
    human_judgment: false
  - id: D3
    description: "Operator email (logEmail-deduped, MANAGER_EMAIL) and alert.no_show outbox row keyed by noShowAlertKey are raised per request; email or outbox failures never fail the request"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/driver-no-show.test.ts#email and outbox failures never fail the request; deduped email; failed enqueue"
        status: pass
    human_judgment: false
  - id: D4
    description: "Admin GET returns { status, noShowRequestedAt, driverName }; POST confirm moves on_location to no_show through the status service (admin_no_show, expected_status CAS, 409 / 422 mapping); dismiss clears the request idempotently"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/admin-no-show.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The driver route accepts no status value: { action: 'request_no_show', status } and { action: 'no_show' } are 400 Invalid payload before any lookup; status-writers gate and isolation guard stay green"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/driver-no-show.test.ts#driverTripRequestSchema, driver route; tests/status-writers-gate.test.ts; tests/infra-vps-isolation-guard.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Settings API returns and accepts both thresholds as integers 1..240; calculate-price behaves as before with isNearAirport from lib/airport.ts"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/admin-settings.test.ts (Phase 87 D-15 block), tests/calculate-price.test.ts, tests/calculate-price-intercity.test.ts"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-11-03
---

# Phase 87 Plan 09: Driver no-show request, operator response, thresholds Summary

**A driver at the pickup point can ask for a no-show only after a server-computed free waiting time (30 min city, 60 min airport, admin-configurable); the request alerts the operator by email and a Chatwoot private note through the outbox without touching status or money, and only the operator's confirm (through the status service) or dismiss resolves it.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (1 tracer, 2 auto/tdd)
- **Files:** 11 (5 created, 6 modified)

## Accomplishments

- **Tracer (Task 1).** `POST { action: 'request_no_show' }` on the driver route runs `requestNoShowForDriver`: identity, terminal, on_location, replay, waiting time from DB facts (`pickupInstantMs`, latest `booking_status_log` row `status_change -> on_location`, `pricing_globals` thresholds, airport by coordinates or address), then `set_no_show_request` (`p_action: 'request'`, actor driver), then `raiseAlerts` (logEmail `no_show_request:<epoch seconds>` to `MANAGER_EMAIL`, `sendNoShowRequestAlert` in `after()`, `enqueueOutboxEvent` `alert.no_show` + `dispatchAfterResponse`). The route imports no Chatwoot client; `lib/no-show.ts` has no Chatwoot reference.
- **Admin response (Task 2).** GET `{ status, noShowRequestedAt, driverName }`; POST `confirm` -> `advanceBookingStatus` to `no_show` (`source: 'admin_no_show'`, profile `full`, optional `expected_status` CAS) with the shared 404 / 409 / 422 / 500 mapping; POST `dismiss` -> RPC `clear` (idempotent). Guard order: `enforceMaxBody(2_000)` -> `getAdminUser` -> uuid -> JSON -> zod strict -> action.
- **Settings and airport helper (Task 3).** `noshow_wait_city_min` / `noshow_wait_airport_min` in GET and PATCH (int 1..240, update builder only touches present keys); `isNearAirport` and the PRG constants live in `lib/airport.ts` and `calculate-price` imports it.

## Task Commits

1. **Task 1 (tracer): driver no-show request with server threshold, operator email and outbox alert** - `bc0a3755` (security)
2. **Task 2: admin no-show confirm and dismiss route** - `49bf5000` (security)
3. **Task 3: no-show waiting thresholds in settings API; shared airport helper** - `19e9629c` (security)

Tracer gate: the tracer `<verify>` (driver-no-show, driver-trip-step, driver-trip-progress suites, scoped tsc) was green and the task carries no `blocking-human` gate, so expansion proceeded.

## Handoff to 87-10 / 87-11 (UI) and Phase 89

- **Driver response contract** (POST `{ action: 'request_no_show' }`): 200 `{ ok: true, status: 'on_location', nextStep: 'on_board', noShowRequestedAt, replay? }`; 409 `{ ok: false, error: 'too_early', status, nextStep, noShowAvailableAt }`; 409 `{ ok: false, error: 'step_conflict', status, nextStep }`; 400 `{ error: 'invalid_token' }` / `{ error: 'Invalid payload' }`; 429; 500 `{ ok: false, error: 'update_failed', ... }`.
- **Page data:** `getNoShowView({ supabase, booking, nowMs })` returns `{ noShowAvailableAt, noShowRequestedAt }` for the server-rendered driver page (availability only while on_location; two small reads: log row and settings).
- **Admin banner:** GET `/api/admin/bookings/{id}/no-show`; actions `confirm` (send `expected_status: 'on_location'`, handle 409 `status_conflict` with `currentStatus`) and `dismiss` ("Client found").
- **Phase 89:** `no_show_requested_at` stays set after a confirm; `isAirportPickup` and `getNoShowThresholds` are exported for reuse. `assertMoneyEligible` obligation (87-03) still applies before any no-show charge.
- **Owner go-live (87-13):** `MANAGER_EMAIL` must be set in Vercel for the operator email (the request still succeeds without it); `CHATWOOT_OPS_CONVERSATION_ID` is optional (see 87-06).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Failing on_location log read must not open the gate**
- **Found during:** Task 1
- **Issue:** the plan says "no on_location log row: base is the pickup instant", but a read error is not an absent row; treating it as absent could let a driver ask before the real arrival-based time.
- **Fix:** a log read error answers 500 `update_failed` and writes nothing; only a successful empty read falls back to the pickup instant (tested).
- **Files modified:** lib/no-show.ts, tests/driver-no-show.test.ts
- **Commit:** bc0a3755

**2. [Plan interface] `clearNoShowRequest` returns `{ applied, ok }`**
- The plan listed `{ applied }`. The extra `ok` flag lets the admin route answer 500 on an RPC failure while a plain no-op stays 200. Additive.

**3. [Plan interface] `requestNoShowForDriver` result also has a 400 `invalid_token` member**
- The identity rule (reassigned or declined link, terminal booking) must answer the same uniform `invalid_token` as the step route, so the union gained `{ httpStatus: 400, body: { error: 'invalid_token' } }`.

**Total deviations:** 1 auto-fixed (Rule 2), 2 additive interface adjustments. **Impact:** none on the stated contract.

## Issues Encountered

- The Task 2 route file was written before the test file was run (the test file was written first but not run red); the suite passes and covers every behavior line. RED was observed for Tasks 1 and 3.
- Not run here: the full suite (parallel plan 87-10 runs concurrently; the orchestrator re-runs it on merge). Targeted: the eight plan suites (243 passed, 10 skipped pre-existing) green; scoped tsc and eslint clean on all changed files.
- The shell tool refuses compound git commands in this worktree, so the plan head ledger was written with a plain redirect; `commits: 3` was measured with `git rev-list --count 14c34330..HEAD`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. Mitigations: T-87-28 (strict schema has no status field; request path never calls the status service, test asserts it; only the admin route reaches no_show), T-87-29 (server threshold, one open request, replay sends nothing, logEmail dedupe per request, outbox key per request, route keeps the 20/min limiter), T-87-30 (waiting time from DB facts, client timer display only), T-87-31 (email body has no client name, email, phone or amount; goes to MANAGER_EMAIL only), T-87-32 (zod int 1..240, matches the 084 CHECK, admin route under strict Origin CSRF). No package installs.

## Self-Check: PASSED

- Files exist: lib/no-show.ts, lib/airport.ts, app/api/admin/bookings/[id]/no-show/route.ts, tests/driver-no-show.test.ts, tests/admin-no-show.test.ts, this SUMMARY
- Commits exist: bc0a3755, 49bf5000, 19e9629c
- Acceptance greps: `rpc('set_no_show_request'` only in lib/no-show.ts (1 hit); `advanceBookingStatus` in lib/no-show.ts (confirmNoShow); 0 Chatwoot references in lib/no-show.ts; `sendNoShowRequestAlert` exported once; `noshow_wait_city_min` 6 hits in settings route; `function isNearAirport` 0 and `@/lib/airport` 1 in calculate-price
- STATE.md and ROADMAP.md untouched
