---
phase: 47
plan: 02
subsystem: gnet-client
tags: [gnet, vehicle-map, tdd, pure-function, vitest]
dependency_graph:
  requires: [BookingSource_type]
  provides: [mapGnetVehicle, GNET_VEHICLE_MAP]
  affects:
    - lib/gnet-vehicle-map.ts
    - tests/gnet-vehicle-map.test.ts
tech_stack:
  added: []
  patterns: [tdd-red-green, object-freeze, case-insensitive-lookup]
key_files:
  created:
    - lib/gnet-vehicle-map.ts
    - tests/gnet-vehicle-map.test.ts
  modified: []
decisions:
  - Option-C chosen — placeholder map with real GRDD codes filled in via followup commit feat(47-02) replace placeholder GNet vehicle codes with real GRDD codes
  - Case-insensitive via toUpperCase() lookup into frozen Record
  - Returns null (not throws) for unknown codes — Phase 49 treats null as business failure
  - 14 real GRDD vehicle codes mapped across 3 VehicleClass values
metrics:
  duration: ~20 minutes
  completed: "2026-04-26"
  tasks_completed: 4
  tasks_total: 4
  files_modified: 2
---

# Phase 47 Plan 02: GNet Vehicle Map Summary

**One-liner:** Built and tested `mapGnetVehicle(code) → VehicleClass | null` pure function with 14 real GRDD vehicle codes mapped to `business`/`first_class`/`business_van`, case-insensitive, Object.frozen map, 6 Vitest tests green.

## Resolved Mapping Table (Decision: Option-C → real codes)

| GNet Code | VehicleClass |
|-----------|-------------|
| SEDAN_LUX | first_class |
| SUV_LUX | first_class |
| SEDAN | business |
| SEDAN_CORP | business |
| SEDAN_HYBRID | business |
| SUV | business |
| SUV_CORP | business |
| VAN_CORP | business_van |
| SPRINTER | business_van |
| VAN_MINI | business_van |
| VAN_MINI_LUXURY | business_van |
| VAN_MINI_6 | business_van |
| VAN_MINI_7 | business_van |
| VAN_8 | business_van |
| VAN_12 | business_van |

## Tasks Completed

| Task | Name | Files |
|------|------|-------|
| 1 | Checkpoint: confirm vehicle code mapping (option-c chosen) | (decision) |
| 2 | Wave 0 — Write failing Vitest tests (RED) | tests/gnet-vehicle-map.test.ts, lib/gnet-vehicle-map.ts (stub) |
| 3 | GREEN — Implement mapGnetVehicle | lib/gnet-vehicle-map.ts |
| — | Follow-up: replace placeholder codes with real GRDD codes | lib/gnet-vehicle-map.ts |

## What Was Built

- `lib/gnet-vehicle-map.ts`: Frozen `GNET_VEHICLE_MAP` Record + `mapGnetVehicle(code)` that uppercases input, looks up map, returns `VehicleClass | null`
- `tests/gnet-vehicle-map.test.ts`: 6 `it()` blocks under `describe('CLIENT-03: mapGnetVehicle')` covering luxury, business sedan/SUV, van, unknown codes, case-insensitivity, and frozen object

## Test Results

```
Test Files  1 passed (1)
Tests       6 passed (6)
```

## Deviations from Plan

- Plan specified 4 `it()` blocks; implementation has 6 (luxury and sedan/SUV split into separate tests for clarity — all requirements covered)
- Real GRDD codes applied in follow-up commit rather than at initial implementation (option-c path)

## Threat Model Compliance

- T-47-06: `mapGnetVehicle` never throws — returns null for empty string, unknown codes ✓
- T-47-08: `Object.freeze()` + `Readonly<>` type — runtime mutation is no-op ✓

## Self-Check

- [x] `lib/gnet-vehicle-map.ts` exports both `mapGnetVehicle` and `GNET_VEHICLE_MAP`
- [x] `Object.freeze(` present in implementation
- [x] `toUpperCase()` present (case-insensitive)
- [x] `?? null` present (null fallback)
- [x] No `throw` in implementation
- [x] `import type { VehicleClass } from '@/types/booking'` present
- [x] `tests/gnet-vehicle-map.test.ts` contains `describe('CLIENT-03: mapGnetVehicle'`
- [x] All 6 tests pass: `npx vitest run tests/gnet-vehicle-map.test.ts` → 6/6 ✓
- [x] All VehicleClass values covered: business (5 codes), first_class (2 codes), business_van (8 codes)

## Self-Check: PASSED
