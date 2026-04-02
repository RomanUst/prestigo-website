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
  duration: "~30m"
  completed: "2026-04-02"
  tasks_completed: 2
  files_changed: 2
---

# Phase 12 Plan 02: Route Handler DB Wiring + Zone Check Summary

**Wired `/api/calculate-price` to DB-backed pricing via `getPricingConfig()` and added Turf.js geographic zone enforcement for transfer trips — smoke tested against live seed values (Business 165 EUR/3h, FC 255, Van 210 hourly; Business 640, FC 960, Van 800 for 2-day daily).**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-02
- **Completed:** 2026-04-02
- **Tasks:** 2 (Task 1: auto TDD, Task 2: checkpoint:human-verify — approved)
- **Files modified:** 2

## Accomplishments

- Route handler reads pricing rates from Supabase `pricing_config` table via cached `getPricingConfig()` — no more hardcoded constants in the live pricing path
- Turf.js geographic zone enforcement added: transfer trips with origin/destination outside all active `coverage_zones` return `quoteMode: true`; hourly and daily trips skip zone check entirely
- Smoke test approved: prices match pre-migration seed values across all trip types; zone check correctly skipped when `coverage_zones` table is empty

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED):** `9b088c0` — test(12-02): add zone check tests for isOutsideAllZones helper
2. **Task 1 (GREEN):** `dce5c40` — feat(12-02): wire route.ts to DB rates and add Turf.js zone check
3. **Task 1 fix — create-payment-intent:** `11c7e5e` — fix(12-02): wire create-payment-intent to getPricingConfig

**Plan metadata:** `37f89cd` — docs(12-02): complete route handler DB wiring + zone check (checkpoint)

## Files Created/Modified

- `prestigo/app/api/calculate-price/route.ts` — DB rates injection via getPricingConfig(), isOutsideAllZones() helper, zone query, DEBUG log removal
- `prestigo/tests/calculate-price.test.ts` — 5 real isOutsideAllZones tests replacing it.todo stubs
- `prestigo/app/api/create-payment-intent/route.ts` — also wired to getPricingConfig() (deviation fix)

## Decisions Made

- `isOutsideAllZones` inlined in route.ts (not extracted to lib/) — single use, co-located with zone query
- Zone check placed after origin/destination null check but before Google Routes API call — avoids unnecessary API calls when zone fails
- DB error in `getPricingConfig()` returns `quoteMode: true` (not HTTP 500) — graceful degradation keeps UX intact
- `create-payment-intent` also wired to DB rates as a deviation fix (Rule 1 — bug: it still used hardcoded constants)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wired create-payment-intent to getPricingConfig()**
- **Found during:** Task 1 execution
- **Issue:** `prestigo/app/api/create-payment-intent/route.ts` still imported hardcoded `RATE_PER_KM` constants after route.ts was switched to DB-loaded rates. Would have caused price mismatch between price calculation and payment intent.
- **Fix:** Replaced hardcoded constant imports with `getPricingConfig()` call and passed `rates` to `buildPriceMap()`
- **Files modified:** `prestigo/app/api/create-payment-intent/route.ts`
- **Verification:** Tests pass; smoke test confirmed consistent pricing
- **Committed in:** `11c7e5e`

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Fix was necessary for data consistency between the two pricing API routes. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviation above.

## Smoke Test Results (Task 2 — Human Approved)

Human verification confirmed:
- Business hourly: 165 EUR/3h — matches seed
- First Class hourly: 255 EUR/3h — matches seed
- Business Van hourly: 210 EUR/3h — matches seed
- Business daily (2-day): 640 EUR — matches seed
- First Class daily (2-day): 960 EUR — matches seed
- Business Van daily (2-day): 800 EUR — matches seed
- Zone check: skipped correctly when `coverage_zones` is empty (quoteMode: false)
- Transfer without Google Maps API key: quoteMode: true (same-as-before behavior)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 12 complete: booking wizard pricing is fully DB-driven and zone-aware
- Phase 13 (Admin Auth + Login UI) can begin — core flow is stable
- When `coverage_zones` are populated via Phase 16 admin UI, zone enforcement will activate automatically
- No blockers

## Self-Check

### Files exist
- `prestigo/app/api/calculate-price/route.ts` — FOUND (modified)
- `prestigo/tests/calculate-price.test.ts` — FOUND (modified)
- `prestigo/app/api/create-payment-intent/route.ts` — FOUND (modified)

### Test results
- `npx vitest run` — 57 passed, 10 skipped (full suite, no regressions) — 2026-04-02

## Self-Check: PASSED

---
*Phase: 12-core-booking-flow-update*
*Completed: 2026-04-02*
