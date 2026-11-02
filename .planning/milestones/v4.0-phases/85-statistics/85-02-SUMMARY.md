---
phase: 85-statistics
plan: 02
subsystem: admin-api
tags: [admin, stats, api, zod, europe-prague]
requires: []
provides:
  - "GET /api/admin/stats/conversion, /customers, /b2b (admin-guarded, period-validated, schema-checked RPC readers)"
  - "lib/admin-stats.ts: client-safe period contract, Prague presets, labels, response schemas, formatters"
affects: [85-03, 85-04, 85-05]
tech-stack:
  added: []
  patterns: ["auth -> validate -> RPC -> zod-check -> generic 500", "client-safe shared module importing only zod"]
key-files:
  created:
    - lib/admin-stats.ts
    - app/api/admin/stats/b2b/route.ts
    - app/api/admin/stats/conversion/route.ts
    - app/api/admin/stats/customers/route.ts
    - tests/admin-stats-routes.test.ts
    - tests/admin-stats-period.test.ts
  modified: []
key-decisions:
  - "Presets end on the Prague today (D-13 lists presets but not their end day)"
  - "Three routes kept structurally identical, no shared wrapper, so the guard stays visible to the verify skill"
status: complete
commits: 2
plan_head_before: 4af55a40599bfcc1c499497b12473f0c2d20272a
plan_head_after: 6d894cd258c1459cb8c3f338754dfab5e604129c
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
requirements-completed: [STAT-01, STAT-02, STAT-03]
---

# Phase 85 Plan 02: Admin stats API routes and shared period module Summary

Three admin GET endpoints (conversion, customers, B2B) that validate a Prague-calendar period, call the matching `stats_*` RPC and return zod-checked JSON, plus `lib/admin-stats.ts`, a zod-only module the client tabs can import for period handling, Prague presets, labels and EUR/percent formatting.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | B2B route + period contract + b2b schema | b08f39b4 | lib/admin-stats.ts, app/api/admin/stats/b2b/route.ts, both tests |
| 2 | conversion + customers routes, presets, labels, formatters | 6d894cd2 | lib/admin-stats.ts, conversion/route.ts, customers/route.ts, both tests |

## Verification

- `npx vitest run tests/admin-stats-routes.test.ts tests/admin-stats-period.test.ts`: 2 files, 73 tests passed.
- `npx tsc --noEmit`: no errors in lib/admin-stats.ts, app/api/admin/stats/* or the two new tests.
- `npx eslint --quiet` on the 4 source files and both tests: clean.
- Acceptance greps: one `getAdminUser()` per route, 0 `€` in lib/admin-stats.ts, `Europe/Prague` present, no supabase/node imports in lib/admin-stats.ts, `app/api/admin/stats/route.ts` unchanged.
- Tracer gate: b2b slice passed end-to-end (route matrix with mocked rpc) before the expansion task.
- The `verify` skill was not invoked as a separate full run; its relevant checks (auth-guard order, price rule, scoped tsc/eslint, tests) were executed directly as listed above.

## Deviations from Plan

None - plan executed exactly as written. Tests use mocked `rpc` only; no live RPC or DB call was made (migrations 081/082 are applied by other plans).

## Notes for the orchestrator

- The worktree used a symlinked `node_modules`; all tests passed with it, nothing to re-run for symlink reasons.
- Routes answer 500 until migrations 081 and 082 are applied; no deployed page calls them yet.
- The tracer ledger file was not created before the first commit; `commits` was measured against the dispatch base 4af55a40 (EXPECTED_BASE), which equals the worktree HEAD at start.

## Known Stubs

None.

## Threat Flags

None - the new endpoints are exactly the surface covered by the plan's threat model (T-85-06..09).

## Self-Check: PASSED

- FOUND: lib/admin-stats.ts, app/api/admin/stats/{b2b,conversion,customers}/route.ts, tests/admin-stats-routes.test.ts, tests/admin-stats-period.test.ts
- FOUND commits: b08f39b4, 6d894cd2
