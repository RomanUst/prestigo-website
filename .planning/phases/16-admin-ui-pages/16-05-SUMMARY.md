---
phase: 16-admin-ui-pages
plan: 05
subsystem: ui
tags: [recharts, stats, admin, bar-chart, aggregation, supabase]

# Dependency graph
requires:
  - phase: 16-01
    provides: KPICard component and admin layout infrastructure
  - phase: 14-admin-api-routes
    provides: auth guard pattern, createSupabaseServiceClient, bookings table schema

provides:
  - /api/admin/stats aggregation route (counts, revenue, breakdowns, 12-month)
  - RevenueBarChart and GroupedBarChart recharts components
  - /admin/stats stats dashboard page with KPI cards and 3 charts

affects: [future admin UI phases needing charts or stats patterns]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stats API returns aggregated data via 8 parallel Promise.all queries"
    - "recharts components wrapped in ChartCard with 280px explicit height for ResponsiveContainer"
    - "Date helpers inline in route file for ISO date range calculations"
    - "API array to recharts grouped format: [{name:'Revenue', key1: val, key2: val}]"

key-files:
  created:
    - prestigo/app/api/admin/stats/route.ts
    - prestigo/components/admin/StatsChart.tsx
    - prestigo/app/admin/(dashboard)/stats/page.tsx
  modified: []

key-decisions:
  - "8 parallel Supabase queries via Promise.all for booking counts, revenue, breakdowns, 12-month data"
  - "12-month array always has 12 entries — missing months filled with revenue: 0 using getLast12Months() helper"
  - "recharts Tooltip formatter uses ValueType guard (typeof value === 'number') instead of number annotation — recharts v3 Formatter type is wide"
  - "Grouped chart data shape: single [{name:'Revenue', class1: n, class2: n}] row — recharts reads all Bar dataKeys from same object"
  - "Stats page is 'use client' with fetch-on-mount — matches existing bookings/pricing page pattern"

patterns-established:
  - "ChartCard: shared chart container with 280px height div, 11px uppercase copper title"
  - "CHART_COLORS constants: copper #B87333, copperLight #D4924A, copperPale #E8B87A"
  - "AXIS_STYLE/TOOLTIP_STYLE/GRID_STYLE constants for consistent dark-theme chart styling"

requirements-completed: [STATS-01, STATS-02, STATS-03, STATS-04, STATS-05]

# Metrics
duration: 25min
completed: 2026-04-02
---

# Phase 16 Plan 05: Stats Dashboard Summary

**Stats API with 8 parallel aggregation queries + recharts bar charts (RevenueBarChart, GroupedBarChart) on dark-theme stats page with 4 KPI cards**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-02
- **Completed:** 2026-04-02
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- /api/admin/stats returns booking counts (today/week/month), current+previous month revenue, vehicle class and trip type breakdowns, and 12-month revenue trend with all months guaranteed present
- StatsChart.tsx exports RevenueBarChart (single-series) and GroupedBarChart (multi-series) with consistent copper color palette, dark tooltip, and 280px height container
- Stats dashboard page renders 4 KPI cards and 3 bar charts fetched from the stats API on mount

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /api/admin/stats route** - `4db9021` (feat)
2. **Task 2: Create StatsChart components and stats page** - `9fdfefc` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `prestigo/app/api/admin/stats/route.ts` - Aggregation endpoint: counts, revenue, breakdowns, 12-month
- `prestigo/components/admin/StatsChart.tsx` - RevenueBarChart and GroupedBarChart recharts components
- `prestigo/app/admin/(dashboard)/stats/page.tsx` - Stats dashboard with KPI cards and chart grid

## Decisions Made
- 8 parallel Supabase queries via Promise.all: 3 count queries + current/previous month revenue + vehicle class breakdown + trip type breakdown + 12-month raw
- 12-month array always has exactly 12 entries — getLast12Months() builds ordered label array, missing months filled with 0
- recharts v3 Tooltip formatter takes ValueType (not number) — used typeof guard for type safety
- Grouped chart data uses single object row per category set: `[{name:'Revenue', business: n, first_class: n, business_van: n}]`
- Stats page uses 'use client' + fetch on mount — consistent with other admin pages (bookings, pricing)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed recharts Tooltip formatter TypeScript error**
- **Found during:** Task 2 (StatsChart.tsx creation)
- **Issue:** `formatter={(value: number) => [...]}` — recharts v3 Formatter type is `ValueType` (string|number|Array), not `number`; caused TS2322 compile error
- **Fix:** Changed to `formatter={(value) => [typeof value === 'number' ? ... : String(value), 'label']}` with runtime guard
- **Files modified:** `prestigo/components/admin/StatsChart.tsx`
- **Verification:** `npx tsc --noEmit --skipLibCheck` shows zero errors on new files
- **Committed in:** `9fdfefc` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 type bug)
**Impact on plan:** Necessary for TypeScript correctness. No scope creep.

## Issues Encountered
- Pre-existing `revalidateTag` signature error in `pricing/route.ts` causes build failure — confirmed pre-existing and explicitly deferred in STATE.md Phase 16 Plan 01 decisions. Out of scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 complete — all 5 admin UI pages implemented (pricing editor, zones map, bookings table, stats dashboard + shared components)
- Milestone v1.2 Operator Dashboard complete
- Build blocked by pre-existing pricing route revalidateTag error — needs fix before deployment

---
*Phase: 16-admin-ui-pages*
*Completed: 2026-04-02*

## Self-Check: PASSED

- FOUND: prestigo/app/api/admin/stats/route.ts
- FOUND: prestigo/components/admin/StatsChart.tsx
- FOUND: prestigo/app/admin/(dashboard)/stats/page.tsx
- FOUND: .planning/phases/16-admin-ui-pages/16-05-SUMMARY.md
- FOUND commit: 4db9021 (Task 1)
- FOUND commit: 9fdfefc (Task 2)
