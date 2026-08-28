---
phase: 65-dispatch-future-first-bookings-list
plan: 02
subsystem: api
tags: [nextjs, supabase, vitest, zod, rpc]

# Dependency graph
requires:
  - phase: 65-01
    provides: "lib/prague-date.ts (getPragueTodayISO, shiftIsoDate), pricing_globals dispatch-horizon columns, admin_search_bookings p_sort 8-arg RPC signature — all live on Supabase project rideprestigo"
provides:
  - "GET /api/admin/bookings horizon/horizonDays query params with a KNOWN_HORIZONS whitelist and a full future/past/all/last_n_days resolver"
  - "D-07 manual-date precedence: an explicit startDate/endDate suppresses the horizon branch entirely (sort stays created_desc, manual bound used as-is)"
  - "p_sort (and the already-missing p_status) added to admin_search_bookings Args in types/database.types.ts so the .rpc() call type-checks"
  - "BookingsTable ephemeral horizon state (default 'future') wired into fetchBookings, proving the future-first tracer end-to-end"
affects: [65-03, 65-04]

actuals:
  tokens: 3793
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "GET query-param whitelist via a Set (KNOWN_HORIZONS) mirroring the existing KNOWN_STATUSES pattern — any value not in the set is treated as 'no override', never forwarded raw to the RPC"
    - "Horizon resolution only overrides the manual startDate/endDate base when BOTH are absent (D-07) — resolvedStartDate/resolvedEndDate/sort are seeded from the manual params first, then the horizon branch conditionally overwrites them"

key-files:
  created: []
  modified:
    - app/api/admin/bookings/route.ts
    - types/database.types.ts
    - components/admin/BookingsTable.tsx
    - tests/admin-bookings.test.ts

key-decisions:
  - "Implemented the RESEARCH-corrected D-07 precedence (manual dates win, horizon skipped) instead of the PATTERNS/RESEARCH Pattern 2 snippet where horizon overrides manual dates — per the plan's explicit <research_correction>"
  - "BookingsTable's horizon state is a plain useState with no setter exposed yet ([horizon] = useState('future')) — intentionally read-only until Plan 65-04 adds the segmented control; NEVER PATCHes /api/admin/settings"
  - "Tracer feedback gate treated as an autonomous pass: task 1's <verify> (tsc + vitest) is fully automated and passed immediately after the task-1 commit, so execution proceeded straight into task 2 (expansion) per the plan's autonomous: true frontmatter and the orchestrator's non-interactive run mode, rather than pausing for a human-verify checkpoint"

patterns-established:
  - "Per-horizon RPC-arg test map: computing expected dates in tests via the REAL getPragueTodayISO()/shiftIsoDate() helpers (not mocked/frozen) keeps assertions deterministic against whatever 'today' the route handler resolves at test-run time, without needing fake timers"

requirements-completed: [DISP-01, DISP-03]

coverage:
  - id: D1
    description: "GET /api/admin/bookings resolves horizon=future to p_start_date=Prague-today, p_end_date=null, p_sort=pickup_asc (the future-first tracer path, end-to-end)"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts#GET /api/admin/bookings — horizon resolution (Phase 65 Plan 02) > horizon=future -> p_start_date=Prague-today, p_end_date=null, p_sort=pickup_asc"
        status: pass
    human_judgment: false
  - id: D2
    description: "horizon=past/all/last_n_days each resolve to the correct date bound + adaptive sort (D-02, D-06 open-ended last_n_days)"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts#GET /api/admin/bookings — horizon resolution (Phase 65 Plan 02) [past/all/last_n_days cases]"
        status: pass
    human_judgment: false
  - id: D3
    description: "Explicit manual startDate/endDate takes session precedence over horizon — horizon branch skipped, sort stays created_desc (D-07)"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts#GET /api/admin/bookings — horizon resolution (Phase 65 Plan 02) [D-07 cases]"
        status: pass
    human_judgment: false
  - id: D4
    description: "horizon is whitelisted via KNOWN_HORIZONS; unknown values and non-positive/garbage horizonDays are rejected/clamped (default 7), never forwarded raw to the RPC (V5 DoS/input-validation mitigation)"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts#GET /api/admin/bookings — horizon resolution (Phase 65 Plan 02) [clamp + bogus-value cases]"
        status: pass
    human_judgment: false
  - id: D5
    description: "types/database.types.ts admin_search_bookings Args carries p_sort/p_status so the .rpc() call type-checks; full project npx tsc --noEmit stays green (no new errors)"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (0 errors attributable to route.ts/database.types.ts/BookingsTable.tsx/admin-bookings.test.ts)"
        status: pass
    human_judgment: false
  - id: D6
    description: "BookingsTable defaults its ephemeral horizon state to 'future' and appends horizon (+horizonDays for last_n_days) to fetchBookings's query string and useCallback deps — the fresh-load UI actually renders future-only, soonest-first"
    requirement: DISP-01
    verification:
      - kind: manual_procedural
        ref: "Deferred to phase-level UAT — plan's own <verification> lists 'load the admin bookings page, default view shows only upcoming trips' as a manual/UAT check, not a Task 1/2 automated gate"
        status: unknown
    human_judgment: true
    rationale: "Requires visually loading the live admin bookings page with real booking rows to confirm the rendered order; no automated browser check exists in this plan, and the plan's own <verification> section explicitly defers this to Manual/UAT rather than an automated task check."

duration: ~7min
completed: 2026-08-28
status: complete
---

# Phase 65 Plan 02: Dispatch Future-First Resolution Tracer Summary

**GET /api/admin/bookings gains a horizon-resolution layer (future/past/all/last_n_days -> p_start_date/p_end_date/p_sort) with D-07 manual-date precedence, wired end-to-end through a typed admin_search_bookings RPC call and BookingsTable's default 'future' fetch.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-08-28T15:19:00Z (session start, after reading 65-01 SUMMARY/PATTERNS)
- **Completed:** 2026-08-28T15:26:57Z (Task 2 commit)
- **Tasks:** 2 completed
- **Files modified:** 4 (app/api/admin/bookings/route.ts, types/database.types.ts, components/admin/BookingsTable.tsx, tests/admin-bookings.test.ts)

## Accomplishments
- `app/api/admin/bookings/route.ts` GET handler now resolves the `horizon` query param (whitelisted via `KNOWN_HORIZONS`, mirroring `KNOWN_STATUSES`) into `p_start_date`/`p_end_date`/`p_sort`, honoring the D-07-corrected precedence: the horizon branch runs ONLY when neither `startDate` nor `endDate` is explicitly present
- `future` resolves to `p_start_date = getPragueTodayISO()`, `sort = 'pickup_asc'`; `past` resolves `p_end_date = shiftIsoDate(today, -1)`, `sort = 'pickup_desc'`; `last_n_days` resolves `p_start_date = shiftIsoDate(today, -horizonDays)` with the end date left open (D-06, future-inclusive); `all` leaves both dates unbound with `sort = 'pickup_desc'`
- `horizonDays` is defensively `parseInt`'d and clamped to a positive integer, defaulting to 7 on missing/garbage/negative input (T-65-03 DoS mitigation)
- `types/database.types.ts`'s `admin_search_bookings` Args gained `p_sort?: string` and the already-missing `p_status?: string`, so the `.rpc('admin_search_bookings', {...})` call in route.ts type-checks with no `any`/`@ts-expect-error` escape hatch
- `components/admin/BookingsTable.tsx` gained an ephemeral `horizon` state defaulting to `'future'` (no setter yet — the switchable segmented control is deferred to Plan 65-04); `fetchBookings` now appends `horizon` (and `horizonDays` when `horizon === 'last_n_days'`) to its query string and lists both in its `useCallback` deps array
- `tests/admin-bookings.test.ts` gained an 11-test `describe` block (`GET /api/admin/bookings — horizon resolution`) covering every horizon, the two D-07 precedence cases (explicit startDate and explicit endDate), three clamp cases (missing/garbage/negative `horizonDays`), the `KNOWN_HORIZONS` rejection case, and the no-param backward-compatible default — all asserting against the real `.rpc()` call args
- Resolution sits entirely behind the existing `getAdminUser()` 401/403 guard, added no new auth surface (V4)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end future-first resolution — one path wired, then expanded** - `f1e3bb2` (feat)
2. **Task 2: Per-horizon resolution test map (all four horizons + precedence + clamps)** - `ed5fec8` (test)

**Plan metadata:** (this commit, docs)

_Note: Task 1 is a `type="tracer"` task whose `<verify>` (`npx tsc --noEmit && npx vitest run tests/admin-bookings.test.ts`) is fully automated and passed immediately after the commit — see "Deviations from Plan" for how the tracer feedback gate was handled._

## Files Created/Modified
- `app/api/admin/bookings/route.ts` - `KNOWN_HORIZONS` whitelist Set; horizon-to-date-range/sort resolver seeded from the manual `startDate`/`endDate` base (D-07); `p_sort` added to the `.rpc('admin_search_bookings', {...})` call alongside the now-resolved `p_start_date`/`p_end_date`
- `types/database.types.ts` - `admin_search_bookings` Args gains `p_sort?: string` and `p_status?: string`
- `components/admin/BookingsTable.tsx` - ephemeral `horizon`/`horizonDays` state (default `'future'`/`7`); `fetchBookings` appends `horizon` (+`horizonDays` for `last_n_days`) to the fetch query string and its `useCallback` deps array
- `tests/admin-bookings.test.ts` - new `GET /api/admin/bookings — horizon resolution (Phase 65 Plan 02)` describe block (11 tests); imports `getPragueTodayISO`/`shiftIsoDate` from `@/lib/prague-date` to compute deterministic expected dates against the same real "today" the route handler resolves

## Decisions Made
- Implemented the plan's `<research_correction>` verbatim: D-07 (manual dates win over horizon) rather than the RESEARCH Pattern 2 / PATTERNS snippet where horizon overrides manual dates — the horizon branch is gated on `!startDate && !endDate`.
- BookingsTable's `horizon` state is intentionally a read-only `useState` (`const [horizon] = useState('future')`) with no setter wired yet — the switchable segmented control lands in Plan 65-04, per the plan's explicit scope split.
- The tracer feedback gate (execute-plan.md's `type="tracer"` protocol) was resolved as an autonomous pass: Task 1's `<verify>` is fully automated (tsc + vitest, no browser/UI check), it passed immediately after the Task 1 commit, and the plan's own frontmatter is `autonomous: true` with the orchestrator explicitly directing a non-interactive "execute to SUMMARY.md" run. Execution proceeded straight into Task 2 rather than emitting a `checkpoint:human-verify` for a purely-automated verify that had already passed.

## Deviations from Plan

None — plan executed exactly as written (task actions matched the `<action>` blocks; all acceptance criteria met; no Rule 1-4 fixes were needed).

## Issues Encountered
None.

## User Setup Required
None — this plan builds entirely on the already-live 065-01 schema (migrations 058/059) and introduces no new external configuration.

## Next Phase Readiness
The horizon resolver, typed RPC args, and BookingsTable's default-future wiring are all live in the working tree and covered by 88 passing tests in `tests/admin-bookings.test.ts` (full project suite: 1083 passed, 0 failed, no regressions). Plan 65-03 (settings backend for the persisted `dispatch_default_horizon`/`dispatch_horizon_days`) and Plan 65-04 (segmented control UI + KPI-decoupling guard) can build directly on this resolver — the `horizon`/`horizonDays` query-param contract and the `KNOWN_HORIZONS` whitelist are now the stable interface those plans extend. No blockers. The plan's own Manual/UAT item ("load the admin bookings page, default view shows only upcoming trips") remains open for phase-level verification once 65-04's UI lands.

---
*Phase: 65-dispatch-future-first-bookings-list*
*Completed: 2026-08-28*

## Self-Check: PASSED

All modified files (app/api/admin/bookings/route.ts, types/database.types.ts,
components/admin/BookingsTable.tsx, tests/admin-bookings.test.ts, this SUMMARY.md)
and all commit hashes (f1e3bb2, ed5fec8) verified present on disk / in git log.
