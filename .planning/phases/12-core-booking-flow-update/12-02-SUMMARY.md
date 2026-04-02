---
phase: 12-core-booking-flow-update
plan: 02
subsystem: pricing
tags: [pricing, zones, turf, supabase, tdd, route-handler]
requirements: [PRICING-05, PRICING-06, ZONES-04, ZONES-05]

dependency_graph:
  requires:
    - "12-01: getPricingConfig() cached DB loader"
    - "11-01: coverage_zones table in Supabase"
  provides:
    - "Route handler reading DB rates via getPricingConfig()"
    - "isOutsideAllZones() helper using Turf.js for geographic zone enforcement"
    - "Zone check for transfer trips: quoteMode when origin/destination outside active zones"
  affects:
    - "Booking wizard pricing: now DB-driven (cached) instead of hardcoded constants"
    - "Transfer trips: geographic zone check against coverage_zones table"

tech_stack:
  added:
    - "@turf/boolean-point-in-polygon — point-in-polygon geographic check"
    - "@turf/helpers — point() GeoJSON helper"
  patterns:
    - "Zone check: query active coverage_zones, use Turf.js booleanPointInPolygon per zone"
    - "GeoJSON coordinate order: [longitude, latitude] — longitude first"
    - "DB error fallback: getPricingConfig() failure returns quoteMode: true (graceful degradation)"
    - "Trip type guard: hourly/daily return before zone check — zone check only for transfer"

key_files:
  created: []
  modified:
    - "prestigo/app/api/calculate-price/route.ts — DB rates injection, zone check, DEBUG log removal"
    - "prestigo/tests/calculate-price.test.ts — 5 real isOutsideAllZones tests replacing it.todo stubs"

decisions:
  - "isOutsideAllZones inlined in route.ts (not extracted to lib/) — single use, co-located with zone query"
  - "Zone check placed after origin/destination null check but before Google Routes API call — avoids unnecessary API calls"
  - "DB error in getPricingConfig() returns quoteMode: true (not HTTP 500) — graceful degradation keeps UX intact"

metrics:
  duration: "2m 0s"
  completed: "2026-04-02"
  tasks_completed: 1
  files_changed: 2
---

# Phase 12 Plan 02: Route Handler DB Wiring + Zone Check Summary

Wired the `/api/calculate-price` endpoint to read pricing rates from the Supabase `pricing_config` table (cached) and added Turf.js geographic zone enforcement for transfer trips.

## What Was Built

**app/api/calculate-price/route.ts (modified):** The route handler now calls `getPricingConfig()` at the start of every request, loading cached DB rates. All three `buildPriceMap()` calls (hourly, daily, transfer) receive `rates` as the last argument. A new `isOutsideAllZones()` helper uses `@turf/boolean-point-in-polygon` to check whether origin or destination falls outside all active coverage zones — if so, `quoteMode: true` is returned instead of prices. The zone check only fires for transfer trips (hourly and daily return before reaching it). DB errors in `getPricingConfig()` are caught and return `quoteMode: true` (graceful degradation). DEBUG `console.error` statements from the original were removed.

**tests/calculate-price.test.ts (implemented):** Five real tests replaced the `it.todo` stubs. The test file inlines the same `isOutsideAllZones` logic as the route handler and defines a Prague polygon fixture. Tests cover: point inside zone, point outside zone, empty zones array (ZONES-05), point inside one of multiple zones, point outside all multiple zones. The API route `it.todo` tests were converted to `it.skip` since they require a running Next.js server.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 (RED) | 9b088c0 | test(12-02): add zone check tests for isOutsideAllZones helper |
| Task 1 (GREEN) | dce5c40 | feat(12-02): wire route.ts to DB rates and add Turf.js zone check |

## Checkpoint Status

Task 2 (Smoke test live endpoint) is a `checkpoint:human-verify` gate — awaiting human verification.

## Self-Check

### Files exist
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/app/api/calculate-price/route.ts` — FOUND (modified)
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/tests/calculate-price.test.ts` — FOUND (modified)

### Commits exist
- 9b088c0 — FOUND
- dce5c40 — FOUND

### Test results
- `npx vitest run tests/calculate-price.test.ts` — 5 passed, 10 skipped
- `npx vitest run` — 57/57 passed (full suite, no regressions)

## Self-Check: PASSED
