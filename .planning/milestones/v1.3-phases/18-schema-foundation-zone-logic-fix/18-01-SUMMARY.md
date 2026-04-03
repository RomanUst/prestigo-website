---
phase: 18-schema-foundation-zone-logic-fix
plan: 01
subsystem: api
tags: [turf, geojson, zones, pricing, vitest, tdd]

# Dependency graph
requires: []
provides:
  - "lib/zones.ts — isInAnyZone helper as single source of truth for coverage zone checks"
  - "ZONES-06 OR-logic fix — calculate-price route now shows prices when pickup OR dropoff is in a zone"
  - "4-case TDD test matrix for zone logic (both-in, outside-all, OR-logic, empty-array)"
affects: [calculate-price, coverage_zones, pricing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zone helper extracted to lib/zones.ts — route.ts and tests both import from single source"
    - "TDD: tests written before implementation to confirm RED before GREEN"

key-files:
  created:
    - prestigo/lib/zones.ts
  modified:
    - prestigo/app/api/calculate-price/route.ts
    - prestigo/tests/calculate-price.test.ts

key-decisions:
  - "isInAnyZone returns true when ANY zone contains the point (OR semantics); empty array returns false (no restriction)"
  - "quoteMode triggers only when BOTH origin AND destination are outside all active zones"
  - "turf imports moved exclusively to lib/zones.ts — removed from route.ts and test file"

patterns-established:
  - "Zone geometry helpers live in lib/zones.ts, not inline in API routes or test files"

requirements-completed: [ZONES-06]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 18 Plan 01: Zone OR-Logic Fix (ZONES-06) Summary

**Extracted zone check into lib/zones.ts with isInAnyZone helper and fixed the AND/OR logic bug so calculate-price returns prices when pickup OR dropoff is in a coverage zone**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T10:47:08Z
- **Completed:** 2026-04-03T10:50:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `lib/zones.ts` with `isInAnyZone` as the single exported helper — inverted semantics from old `isOutsideAllZones`
- Replaced 5-test inline `isOutsideAllZones` describe block with 4-case `isInAnyZone helper (ZONES-06)` TDD matrix
- Fixed route.ts: `originOutside || destOutside` (quoteMode if either outside) replaced with `!originInZone && !destInZone` (quoteMode only when both outside)
- Removed duplicate turf imports from route.ts and test file — turf is now used exclusively inside lib/zones.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/zones.ts and write 4-case unit tests (TDD red-green)** - `e13ab78` (feat)
2. **Task 2: Update route.ts to import from lib/zones.ts and fix OR-logic bug** - `1f69f4a` (fix)

**Plan metadata:** see final docs commit

_Note: TDD task had RED (failing test run confirmed before GREEN implementation)_

## Files Created/Modified
- `prestigo/lib/zones.ts` — New helper: `isInAnyZone(lat, lng, zones)` using turf booleanPointInPolygon
- `prestigo/app/api/calculate-price/route.ts` — Removed inline `isOutsideAllZones` + turf imports; added `isInAnyZone` import; fixed zone check condition
- `prestigo/tests/calculate-price.test.ts` — Replaced inline helper + turf imports with `import { isInAnyZone } from '@/lib/zones'`; replaced old describe block with 4-case ZONES-06 matrix

## Decisions Made
- Zone helper extracted to lib/zones.ts rather than keeping it inline in route.ts — enables test file to import the real implementation instead of duplicating it
- `isInAnyZone` returns `false` on empty zones array (consistent with prior behaviour: no zones = no restriction)
- TDD: wrote tests before implementation to confirm they fail first, then created lib/zones.ts for green

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- `npx` was not on the default PATH in the bash shell. Used `node node_modules/.bin/vitest` with node v22.22.1 from nvm. All tests passed correctly.
- Full suite shows 8 pre-existing failures in `submit-quote.test.ts`, `admin-pricing.test.ts`, and `BookingWidget.test.tsx` — none are related to changes in this plan (confirmed by scope: only calculate-price.test.ts and lib/zones.ts were touched). Logged as out-of-scope.

## Next Phase Readiness
- Plan 18-02 (schema foundation) can proceed — zone OR-logic is now correct and tested
- Pre-existing test failures in other test files are out of scope for this plan; should be addressed in a dedicated cleanup phase

## Self-Check: PASSED

- lib/zones.ts: FOUND
- app/api/calculate-price/route.ts: FOUND
- tests/calculate-price.test.ts: FOUND
- Commit e13ab78 (feat): FOUND
- Commit 1f69f4a (fix): FOUND
- Commit d640fc7 (docs): FOUND

---
*Phase: 18-schema-foundation-zone-logic-fix*
*Completed: 2026-04-03*
