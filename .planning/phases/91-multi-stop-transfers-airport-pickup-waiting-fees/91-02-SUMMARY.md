---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 02
subsystem: pricing
tags: [stops, waiting-fee, google-routes, calculate-price, security]
requires: []
provides:
  - lib/stops.ts pure stop and waiting rules
  - lib/route-distance.ts server Google Routes distance through stops
  - isAirportTrip in lib/airport.ts
  - PricingRates.waitingRate from admin
  - prices[vc].waitingEur and waitingUnavailable in POST /api/calculate-price
affects: [91-04 checkout, 91-08 extra charge, 91-09 UI]
tech-stack:
  added: []
  patterns: [typed never-throw server fetch module, waiting added after pricing adjustments]
key-files:
  created:
    - lib/stops.ts
    - lib/route-distance.ts
    - tests/stops-fee.test.ts
    - tests/route-distance.test.ts
    - tests/calculate-price-stops.test.ts
  modified:
    - lib/airport.ts
    - lib/pricing-config.ts
    - lib/pricing-helpers.ts
    - app/api/calculate-price/route.ts
    - tests/calculate-price-intercity.test.ts
    - tests/pricing-helpers.test.ts
key-decisions:
  - "Waiting is folded into prices[vc].base and total and also returned as waitingEur, so client totals that sum base + extras include it unchanged"
  - "waitingEur and waitingUnavailable exist only when the request has at least one stop (D-03 byte-identical shape otherwise)"
  - "A class with a wait over 15 minutes and no admin rate gets waitingEur null, nothing added, and is listed in waitingUnavailable"
  - "The isAirport body field is still accepted by the schema but never read"
requirements-completed: [STOP-02, STOP-03]
status: complete
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
plan_head_before: 314895a9cdde2df330b014c5c854c544aebba44d
plan_head_after: 2999f4ded9d1830835cd09b4a296126bc66c35b7
completed: 2026-11-11
---

# Phase 91 Plan 02: Quote with stops and waiting Summary

POST /api/calculate-price now prices a transfer with stops per km on the Google Routes distance through every stop in the client's order, and adds per-class paid waiting from the admin rate; trips without stops return exactly the old JSON.

## What was built

- **lib/stops.ts** (pure, client-safe): `MAX_STOPS` 5, free 15 minutes per stop (never pooled), 15-minute blocks, `waitingBlocks`, `totalWaitingBlocks`, `waitingFeeEur` (one `Math.round` per booking), `priceStops`, `waitingTotalEur`, `isValidStopWait`, and the D-16 extra-charge helpers `extraWaitingBlocks` / `extraWaitingAmountMinor`.
- **lib/route-distance.ts** (server): `computeRouteDistance` extracted from the route. Body is only origin, destination, travelMode DRIVE and intermediates; field mask `routes.distanceMeters,routes.duration`; 8 s `AbortSignal.timeout`; input validated before any fetch (finite and in range, max 5 stops); typed failures `no_key | invalid_input | http_error | no_route | timeout | network`; never throws; logs a status or reason only.
- **lib/pricing-config.ts**: `waiting_rate_per_15min` is selected and mapped to `waitingRate` (only positive rates; NULL means not offered); fallback `{}`.
- **calculate-price route**: stop items carry `waitMinutes` (integer 0..120, multiple of 15, default 0); fixed route price is skipped when stops exist (D-01); `extraStops` and `EXTRA_STOP_PRICE` removed (D-02); waiting added after `applyGlobals` and child-seat extras (D-14); `waitingEur` per class and `waitingUnavailable` only when stops exist (D-03); airport flag from `isAirportTrip(origin, destination)` only (T-91-05).

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 (tracer) | f022f594 | stops and route-distance modules, waitingRate config, quote through one stop with waiting |
| 2 | 349ab705 | D-01/D-02/D-03/D-14, limits, flat per-stop fee removed, old tests updated |
| 3 | 2999f4de | `isAirportTrip`, client airport flag ignored |

## Deviations from Plan

- **Task ordering:** the route-distance hardening listed under Task 3 (Essentials-only body, timeout, typed failures, input validation, log hygiene) was written in Task 1 while extracting the module, with its tests in `tests/route-distance.test.ts`. Task 3's commit therefore only adds `isAirportTrip` and the airport tests. No behaviour difference from the plan.
- **Commit ledger:** the per-plan HEAD ledger file under the git dir could not be written from the sandbox (path outside the worktree), so `commits` was measured against the known base SHA with `git rev-list --count 314895a9..HEAD` (3 task commits).
- The `verify` skill was not invoked; its checks were run by hand per commit: `npx tsc --noEmit` (only the 8 baseline errors in `tests/`), `npx eslint --quiet` on touched files (clean), related vitest files, no hard-coded prices or secrets.

## Verification

- `npx vitest run` on stops-fee, route-distance, calculate-price-stops, calculate-price, calculate-price-intercity, pricing-helpers: 110 passed, 10 skipped (pre-existing skips).
- 16 other test files touching pricing-config, airport, checkout and jsonld: 375 passed.
- `grep EXTRA_STOP_PRICE|extraStops` in app, lib, components: nothing.

## Notes for the orchestrator

- `getPricingConfig` now selects `waiting_rate_per_15min` from `pricing_config`. That column comes from migration 089 (plan 91-01). The migration must be applied before this code reaches an environment with a real database, otherwise the select errors and the quote falls back to manual quote mode.
- The return-leg price on a round trip still reuses the outbound `distanceKm` (now through the stops) and carries no waiting; unchanged semantics from before, flagged for 91-04/91-09.
- No `windows` ledger entries; no stubs.

## Threat Flags

None beyond the plan's threat model (T-91-05..08 mitigated and tested).

## Self-Check: PASSED

Created files exist (lib/stops.ts, lib/route-distance.ts, three new test files); commits f022f594, 349ab705, 2999f4de present.
