---
phase: 14-admin-api-routes
plan: "02"
subsystem: api
tags: [nextjs, supabase, zod, vitest, admin, geojson, pagination]

# Dependency graph
requires:
  - phase: 14-admin-api-routes/14-01
    provides: Admin auth guard pattern (getAdminUser) and createSupabaseServiceClient pattern
  - phase: 11-database-schema
    provides: coverage_zones and bookings table schemas
provides:
  - GET/POST/DELETE/PATCH /api/admin/zones — CRUD for named GeoJSON coverage zones
  - GET /api/admin/bookings — paginated booking list with date range, trip type, and search filters
affects: [phase-16-admin-ui, phase-15-admin-ui-setup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Zod GeoJSON Polygon schema validation with z.literal('Polygon') and coordinate array shape
    - Supabase query builder with chainable conditional filters (gte/lte/eq/or) before .range()
    - Limit clamping with Math.min/Math.max for safe pagination parameters

key-files:
  created:
    - prestigo/app/api/admin/zones/route.ts
    - prestigo/app/api/admin/bookings/route.ts
    - prestigo/tests/admin-zones.test.ts
    - prestigo/tests/admin-bookings.test.ts
  modified: []

key-decisions:
  - "Zod z.literal('Polygon') enforces GeoJSON geometry type at schema level — prevents non-polygon shapes from being inserted as zones"
  - "Bookings query applies all conditional filters before .range() — ensures pagination is applied to the filtered result set, not the full table"
  - "pickup_date text column uses lexicographic .gte/.lte for date range — ISO YYYY-MM-DD format makes this safe"
  - "limit clamped to 1-100 with Math.min/Math.max — prevents runaway queries while allowing flexible page sizes"
  - "Test UUIDs must be valid RFC 4122 format — zoneToggleSchema uses z.string().uuid() which enforces this"

patterns-established:
  - "Admin route pattern: getAdminUser() inline in every handler file, checking app_metadata.is_admin"
  - "TDD mock pattern: vi.hoisted stubs + separate supabaseAuthStub (for auth.getUser) and supabaseServiceStub (for DB ops)"
  - "Supabase chainable mock: each test sets up its own chain with specific fn references to assert call arguments"

requirements-completed: [ZONES-02, ZONES-03, BOOKINGS-01]

# Metrics
duration: 20min
completed: "2026-04-02"
---

# Phase 14 Plan 02: Admin Zones and Bookings Routes Summary

**Named GeoJSON coverage zone CRUD and paginated bookings list via admin API routes with Zod validation and vitest unit tests**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-02T10:27:27Z
- **Completed:** 2026-04-02T10:31:50Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Zones route with full CRUD: GET lists all zones, POST validates GeoJSON Polygon with Zod and inserts, DELETE removes by id, PATCH toggles active boolean
- Bookings route with paginated GET: page/limit clamping, date range via gte/lte, trip type filter, free-text search via ilike on name and reference fields
- 14 unit tests across 2 test files — all green, full suite 9/9 test files passing with no regressions

## Task Commits

1. **Task 1: Create zones and bookings route unit tests (RED)** - `ea16db5` (test)
2. **Task 2: Create admin zones route handler (GREEN)** - `55be77e` (feat)
3. **Task 3: Create admin bookings route handler (GREEN)** - `d6e2caf` (feat)

_Note: TDD — tests committed before implementation. Task 1 commit = RED (tests fail). Tasks 2-3 = GREEN (tests pass)._

## Files Created/Modified

- `prestigo/tests/admin-zones.test.ts` — 8 unit tests for zones GET/POST/DELETE/PATCH with vi.hoisted mock pattern
- `prestigo/tests/admin-bookings.test.ts` — 6 unit tests for bookings GET covering auth, pagination, search, tripType
- `prestigo/app/api/admin/zones/route.ts` — GET (list), POST (Zod GeoJSON validation + insert), DELETE (by id param), PATCH (toggle active)
- `prestigo/app/api/admin/bookings/route.ts` — GET with page/limit, startDate/endDate, tripType, search query params

## Decisions Made

- Zod `z.literal('Polygon')` enforces GeoJSON geometry type at schema level, preventing non-polygon shapes from being stored as zones
- Bookings route applies all conditional filters before `.range()` — pagination operates on the filtered set
- `pickup_date` text column uses lexicographic `.gte`/`.lte` for date range filtering — safe because ISO `YYYY-MM-DD` format sorts correctly
- `limit` clamped to 1-100 with `Math.min`/`Math.max` — prevents runaway queries while allowing flexible page sizes
- Test UUIDs updated to valid RFC 4122 format — `zoneToggleSchema` uses `z.string().uuid()` which rejected the original non-UUID test value `'zone-uuid-456'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test UUID values to pass Zod uuid() validation**
- **Found during:** Task 2 (zones route GREEN phase)
- **Issue:** Test 7 and Test 8 used non-UUID strings (`'test-uuid-123'`, `'zone-uuid-456'`) but `zoneToggleSchema` declares `id: z.string().uuid()` — Zod rejected them causing 400 responses instead of 200
- **Fix:** Updated both test values to valid RFC 4122 UUIDs (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- **Files modified:** `prestigo/tests/admin-zones.test.ts`
- **Verification:** All 8 zones tests pass after fix
- **Committed in:** `55be77e` (Task 2 commit, included test fix alongside route implementation)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minor test fix — plan specified valid UUID-format ids semantically but test values didn't match UUID format. No scope creep, no architectural changes.

## Issues Encountered

None beyond the test UUID fix documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `/api/admin/zones` ready for Phase 16 zone editor UI (GET to list, POST to create, DELETE to remove, PATCH to toggle)
- `/api/admin/bookings` ready for Phase 16 bookings list UI (paginated table with date/type/search filters)
- All admin routes follow consistent auth guard pattern — Phase 16 can assume 401/403 responses for unauthenticated/non-admin access

---
*Phase: 14-admin-api-routes*
*Completed: 2026-04-02*
