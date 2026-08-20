---
phase: 47
plan: 02
subsystem: gnet-integration
tags: [tdd, vehicle-map, gnet, CLIENT-03]
dependency_graph:
  requires: []
  provides: [lib/gnet-vehicle-map.ts, CLIENT-03]
  affects: [Phase 49 farmin endpoint]
tech_stack:
  added: []
  patterns: [TDD red-green, Object.freeze, toUpperCase lookup]
key_files:
  created:
    - lib/gnet-vehicle-map.ts
    - tests/gnet-vehicle-map.test.ts
  modified:
    - tests/gnet-farmin.test.ts
decisions:
  - "option-a: use authoritative GRDD codes from dashboard (SEDAN, SEDAN_LUX, VAN_MINI_LUXURY)"
  - "mapGnetVehicle returns null on unknown codes (never throws) — GNet retries on non-2xx, so rejection is HTTP 200 success:false"
  - "GNET_VEHICLE_MAP is Object.frozen at runtime (T-47-08 mitigation)"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-04"
  tasks: 3
  files: 3
requirements:
  - CLIENT-03
---

# Phase 47 Plan 02: GNet Vehicle Map — Summary

**One-liner:** Pure `mapGnetVehicle` function with frozen lookup table mapping 3 authoritative GRDD codes to Prestigo VehicleClass, TDD red-green cycle complete.

## Resolved Mapping Table

Task 1 resolved as **option-a** — authoritative GRDD vehicle codes confirmed from GRDD Connect dashboard:

| GRDD Code (GNet payload) | Prestigo VehicleClass | Vehicle |
|--------------------------|----------------------|---------|
| `SEDAN` | `business` | Mercedes-Benz E-Class |
| `SEDAN_LUX` | `first_class` | Mercedes-Benz S-Class |
| `VAN_MINI_LUXURY` | `business_van` | Mercedes-Benz V-Class |

Keys are UPPERCASE in `GNET_VEHICLE_MAP`; `mapGnetVehicle` applies `.toUpperCase()` before lookup (case-insensitive).

## Tasks Completed

| Task | Type | Description | Commit |
|------|------|-------------|--------|
| 1 | checkpoint:decision (pre-resolved) | Confirmed authoritative GRDD mapping (option-a) | — |
| 2 | auto / TDD RED | Failing tests for CLIENT-03 with 3 GRDD codes | 19db06f |
| 3 | auto / TDD GREEN | Working implementation; all 5 tests pass | 88f698d |

## Verification

- `npx vitest run tests/gnet-vehicle-map.test.ts` — 5 tests passed
- `npx vitest run` — 749 tests passed, 0 failures (full suite)
- `npx tsc --noEmit` — 0 errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Updated gnet-farmin.test.ts: VAN_CORP → VAN_MINI_LUXURY**
- **Found during:** Task 3 full suite run
- **Issue:** `gnet-farmin.test.ts` used `VAN_CORP` as vehicle type in pricing test, but new authoritative map only contains `VAN_MINI_LUXURY`; test was asserting `undefined` === `'297.00'`
- **Fix:** Replaced `preferredVehicleType: 'VAN_CORP'` with `preferredVehicleType: 'VAN_MINI_LUXURY'` in one test case
- **Files modified:** `tests/gnet-farmin.test.ts`
- **Commit:** 88f698d

### Test count

Plan specified 4 `it()` blocks; implementation uses 5 (added assertion that `GNET_VEHICLE_MAP` has exactly 3 entries to enforce no stale placeholder codes). This exceeds the minimum acceptance criteria (at least 4).

## Threat Model Coverage

| Threat ID | Mitigation |
|-----------|-----------|
| T-47-06 | `mapGnetVehicle` returns `null` on empty string and unknown codes — never throws |
| T-47-08 | `Object.freeze(GNET_VEHICLE_MAP)` prevents runtime mutation |

## Known Stubs

None — all 3 VehicleClass values are mapped to real GRDD codes confirmed from dashboard.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- [x] `lib/gnet-vehicle-map.ts` exists with `Object.freeze`, `toUpperCase`, `?? null`, no `throw`
- [x] `tests/gnet-vehicle-map.test.ts` exists with `describe('CLIENT-03: mapGnetVehicle'`
- [x] Commit `19db06f` exists (RED)
- [x] Commit `88f698d` exists (GREEN)
- [x] 5 tests pass in vehicle-map suite
- [x] Full suite 749 passed, 0 failures
