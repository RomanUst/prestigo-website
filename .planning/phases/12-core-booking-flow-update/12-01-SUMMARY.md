---
phase: 12-core-booking-flow-update
plan: 01
subsystem: pricing
tags: [pricing, cache, supabase, tdd, refactor]
requirements: [PRICING-05, PRICING-06]

dependency_graph:
  requires:
    - "11-01: pricing_config table in Supabase (with seed rows)"
  provides:
    - "getPricingConfig(): DB loader wrapped in unstable_cache with tag 'pricing-config'"
    - "calculatePrice() with injected rates param"
    - "buildPriceMap() with injected rates param"
    - "Rates interface exported from lib/pricing.ts"
  affects:
    - "All callers of calculatePrice() and buildPriceMap() must now pass rates"
    - "Phase 14: admin PUT route can invalidate 'pricing-config' cache tag"

tech_stack:
  added:
    - "next/cache unstable_cache for DB-backed rate caching"
  patterns:
    - "Dependency injection: rates passed as last parameter instead of module-level constants"
    - "Cache-aside: getPricingConfig wraps DB fetch in unstable_cache"
    - "NUMERIC-to-number cast: Number(r.rate_per_km) prevents string arithmetic bugs"

key_files:
  created:
    - "prestigo/lib/pricing-config.ts — getPricingConfig() cached DB loader, PricingRates type"
  modified:
    - "prestigo/lib/pricing.ts — Rates interface added; RATE_PER_KM/HOURLY_RATE/DAILY_RATE unexported; calculatePrice/buildPriceMap gain rates param"
    - "prestigo/tests/pricing.test.ts — all it.todo stubs replaced with real tests using testRates fixture"

decisions:
  - "Rates interface uses Record<string, number> (not Record<VehicleClass, number>) to stay compatible with DB-loaded data which uses plain strings"
  - "Internal constants (RATE_PER_KM etc.) kept in pricing.ts as seed reference documentation but not exported"
  - "unstable_cache key array is ['pricing-config'] matching the tag — enables targeted revalidation"

metrics:
  duration: "2m 29s"
  completed: "2026-04-02"
  tasks_completed: 2
  files_changed: 3
---

# Phase 12 Plan 01: Pricing Data Layer Summary

Introduced a cached DB loader for pricing rates and decoupled `calculatePrice()` from hardcoded module-level constants by injecting rates as a parameter.

## What Was Built

**lib/pricing-config.ts (new):** `getPricingConfig()` wrapped in `unstable_cache` fetches all rows from the `pricing_config` Supabase table (seeded with business/first_class/business_van rates). Caches under tag `'pricing-config'` so the Phase 14 admin PUT route can invalidate it without a deploy. Supabase returns `NUMERIC` columns as strings — `Number()` cast applied to prevent arithmetic bugs.

**lib/pricing.ts (refactored):** Added `export interface Rates` with `ratePerKm`, `hourlyRate`, `dailyRate` as `Record<string, number>`. Removed `export` from `RATE_PER_KM`, `HOURLY_RATE`, `DAILY_RATE` (now internal-only). Added `rates: Rates` as the last parameter to `calculatePrice()` and `buildPriceMap()`, replacing all references to module-level constants with `rates.*` lookups.

**tests/pricing.test.ts (implemented):** Replaced all `it.todo` stubs with 14 real tests. Defines `testRates` fixture matching DB seed values. Covers transfer/hourly/daily pricing for all 3 vehicle classes, error case (null distance for transfer), `buildPriceMap` structure, and `dateDiffDays` edge cases.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | f88a21a | test(12-01): add failing tests for calculatePrice with injected rates |
| Task 2 | 4e3bac9 | feat(12-01): create pricing-config.ts and refactor pricing.ts with rates param |

## Self-Check

### Files exist
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/lib/pricing-config.ts` — FOUND
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/lib/pricing.ts` — FOUND (modified)
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/tests/pricing.test.ts` — FOUND (modified)

### Commits exist
- f88a21a — FOUND
- 4e3bac9 — FOUND

### Test results
- `npx vitest run tests/pricing.test.ts` — 14/14 passed
- `npx vitest run` — 52/52 passed (full suite, no regressions)

## Self-Check: PASSED
