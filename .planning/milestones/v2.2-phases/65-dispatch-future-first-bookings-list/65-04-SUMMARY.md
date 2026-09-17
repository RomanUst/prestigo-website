---
phase: 65-dispatch-future-first-bookings-list
plan: 04
subsystem: admin-ui
tags: [nextjs, react-client-component, vitest, admin-bookings, settings]

# Dependency graph
requires:
  - phase: 65-02
    provides: "GET /api/admin/bookings horizon/horizonDays resolver + KNOWN_HORIZONS whitelist; BookingsTable's ephemeral (then read-only) horizon state"
  - phase: 65-03
    provides: "/api/admin/settings GET/PATCH extended with dispatch_default_horizon/dispatch_horizon_days on pricing_globals"
provides:
  - "BookingsTable Future/Past/All segmented control — ephemeral in-session override seeded from a persisted-default prop, never PATCHes /api/admin/settings (DISP-03, D-04)"
  - "Horizon-aware empty states in both mobile-card and desktop-table renders (E2), a distinct refetch-error state (E2 backstop), and D-07 Date-Range precedence graying"
  - "bookings/page.tsx reads /api/admin/settings on mount and passes defaultHorizon/horizonDays into BookingsTable (DISP-02 read side)"
  - "tests/admin-bookings-kpi-decoupling.test.tsx — the concrete D-05/DISP-04 guard proving the KPI counters never route through the list horizon"
affects: []

actuals:
  tokens: 6509
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "TWO state slots for a persisted-default + ephemeral-override control: the persisted default is the prop itself (never re-stored, never mutated), the ephemeral override is a useState seeded from that prop — a remount (fresh props) naturally re-seeds from the persisted default rather than resuming a prior session's override"
    - "D-07 precedence implemented as an omission, not an override: fetchBookings only appends horizon/horizonDays to the query string when neither startDate nor endDate is explicitly set; the segmented control's active-highlight computation independently checks the same condition to gray all three segments"
    - "Distinct refetch-error state (fetchFailed) tracked alongside loading/bookings — set on !res.ok or catch, cleared only on a successful response — so a legitimately-empty Future view is never rendered as though the fetch had failed"

key-files:
  created:
    - tests/admin-bookings-kpi-decoupling.test.tsx
  modified:
    - components/admin/BookingsTable.tsx
    - tests/BookingsTable.test.tsx
    - app/admin/(dashboard)/bookings/page.tsx

key-decisions:
  - "'last_n_days' (persisted-default-only, not a segment) displays as its nearest visible peer 'Future' per UI-SPEC — the segmented control's active-highlight uses a displayHorizon derivation (horizon === 'last_n_days' ? 'future' : horizon) while the real fetch param stays 'last_n_days' until the admin explicitly clicks a segment"
  - "D-07 grayed-segment styling reuses the existing inactive-chip style verbatim (no separate 'grayed' visual token) — UI-SPEC's grayed spec (border var(--anthracite-light), color var(--warmgrey)) is byte-identical to the existing inactive state, so dateRangeActive simply forces isActive=false for all three segments rather than introducing a third visual state"
  - "Segmented control rendered as direct children of the existing filter-bar flex container (12px gap already applied there) rather than a wrapper div, matching the existing filterChips.map direct-children pattern exactly"
  - "bookings/page.tsx's settings fetch is a THIRD independent useEffect/fetch, deliberately separate from both KPI fetches — enforces D-05 structurally, not just by test coverage"

patterns-established:
  - "KPI-decoupling guard test pattern: distinguish KPI vs. list fetch calls by exact query-string suffix (&limit=1 / &limit=100 vs. list's &limit=20), assert call-count stability across a UI interaction rather than just asserting absence of a specific param — catches both 'gained a horizon param' and 'fired an extra fetch' failure modes"

requirements-completed: [DISP-02, DISP-03, DISP-04]

coverage:
  - id: D1
    description: "Clicking a segment updates the horizon fetch param and issues NO PATCH to /api/admin/settings"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#clicking the Past segment updates the horizon fetch param and issues NO PATCH to /api/admin/settings"
        status: pass
    human_judgment: false
  - id: D2
    description: "Remounting BookingsTable with the same defaultHorizon prop resets the active segment to the persisted default, not the last-used override (D-04)"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#remounting with the same defaultHorizon prop resets the active segment to the persisted default, not the last-used override (D-04)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Future segment + zero rows renders 'No upcoming trips' + body; Past/All + zero rows renders 'No bookings found.' — distinct strings"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#Future segment + zero rows renders \"No upcoming trips\" distinct from Past/All's \"No bookings found.\""
        status: pass
    human_judgment: false
  - id: D4
    description: "Explicit startDate/endDate omits the horizon param from fetchBookings and grays the active segment to the inactive style (D-07)"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#D-07: explicit startDate/endDate omits the horizon param and grays the active segment to the inactive style"
        status: pass
    human_judgment: false
  - id: D5
    description: "A mocked failed fetch renders the distinct refetch-error copy, not the empty-state copy (E2 backstop)"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#a mocked failed fetch renders the distinct refetch-error copy (not the empty-state copy)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The active-segment style uses the correct current-brand copper tint rgba(191,160,106,0.09) + var(--copper), not the stale rgb(184,115,51) literal"
    requirement: DISP-03
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#the active-segment style uses the current brand copper tint and border"
        status: pass
      - kind: other
        ref: "grep -c 'rgba(191,160,106,0.09)' components/admin/BookingsTable.tsx == 1"
        status: pass
    human_judgment: false
  - id: D7
    description: "bookings/page.tsx fetches /api/admin/settings on mount and passes dispatch_default_horizon/dispatch_horizon_days to BookingsTable as defaultHorizon/horizonDays"
    requirement: DISP-02
    verification:
      - kind: unit
        ref: "tests/admin-bookings-kpi-decoupling.test.tsx#bookings/page.tsx fetches /api/admin/settings on mount and passes defaultHorizon/horizonDays to BookingsTable"
        status: pass
    human_judgment: false
  - id: D8
    description: "The two KPI fetches (TODAY count, THIS WEEK revenue) never carry a horizon param and stay decoupled from the list's active horizon (DISP-04, D-05)"
    requirement: DISP-04
    verification:
      - kind: unit
        ref: "tests/admin-bookings-kpi-decoupling.test.tsx#the two KPI fetches never carry a horizon param"
        status: pass
      - kind: unit
        ref: "tests/admin-bookings-kpi-decoupling.test.tsx#toggling the segmented control issues exactly one additional list fetch and ZERO additional KPI fetches; todayCount/weekRevenue stay unchanged"
        status: pass
    human_judgment: false
  - id: D9
    description: "Full project vitest suite stays green after all Phase 65 Plan 04 changes (no regressions)"
    requirement: DISP-01
    verification:
      - kind: unit
        ref: "npx vitest run — 100 files passed, 5 skipped, 1099 passed / 10 skipped / 139 todo tests, 0 failed"
        status: pass
    human_judgment: false
  - id: D10
    description: "Default load shows future-first; switching to Past then reloading resets to the saved default; KPI numbers stay identical while toggling — end-to-end on the live admin UI"
    requirement: "DISP-01, DISP-04"
    verification:
      - kind: manual_procedural
        ref: "Deferred to phase-level UAT — the plan's own <verification> section lists this as a Manual/UAT check ('load the admin bookings page...'), not a Task 1/2 automated gate"
        status: unknown
    human_judgment: true
    rationale: "Requires visually loading the live admin bookings page against real Supabase data to confirm rendered order and the exact click-through UX; no browser automation exists in this plan — component/page-level fetch-mock tests cover every stated acceptance criterion, but the live end-to-end render is explicitly deferred to phase UAT per the plan's own verification section."

duration: ~15min
completed: 2026-08-28
status: complete
---

# Phase 65 Plan 04: Dispatcher UX — Segmented Control + KPI Decoupling Guard Summary

**Added the Future/Past/All segmented control to BookingsTable (two state slots: persisted default via props + ephemeral in-session override), horizon-aware empty/error/precedence states, wired bookings/page.tsx to read the persisted default from /api/admin/settings, and locked the D-05 KPI-decoupling guard-rail with a dedicated test.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-28T19:29:24+02:00 (Task 2 commit)
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `BookingsTable` now accepts `defaultHorizon`/`horizonDays` props (the persisted default from Settings, DISP-02) and keeps an ephemeral `horizon`/`horizonDays` override `useState` seeded from them — the segmented control only ever calls `setHorizon`, never `PATCH /api/admin/settings` (D-03/D-04)
- A Future/Past/All segmented control renders at the top of the filter bar (12px gap, 32px height, matching the existing chip conventions); the active segment uses the current-brand copper tint `rgba(191,160,106,0.09)` + `border: 1px solid var(--copper)` (not the stale `rgb(184,115,51)` literal elsewhere in the file)
- `'last_n_days'` (a persisted-default-only option, not a segment) displays with Future highlighted as its nearest visible peer, per UI-SPEC — the real fetch param is untouched until the admin explicitly clicks a segment
- Both the mobile-card and desktop-table empty states are now horizon-aware: Future + zero rows renders `No upcoming trips` + the explanatory body sentence; Past/All + zero rows keeps the existing `No bookings found.` verbatim — proven as two visually distinct strings
- D-07 precedence: when the manual Date Range picker holds explicit `startDate`/`endDate`, `fetchBookings` omits the `horizon` param entirely (the manual bound drives the query untouched) and all three segments gray to the inactive-chip style
- A distinct refetch-error state (`fetchFailed`) is tracked in `fetchBookings` (set on `!res.ok`/catch, cleared on success) and rendered in the `#f87171` error-text convention, in both the mobile and desktop render paths, so a legitimately-empty Future view is never confused with a silent failure
- `bookings/page.tsx` gained a third, independent `useEffect`/fetch to `/api/admin/settings` on mount, reading `dispatch_default_horizon`/`dispatch_horizon_days` (fallback `'future'`/`7` on failure) and passing them as `defaultHorizon`/`horizonDays` props into `<BookingsTable>` — the two existing KPI fetches were left byte-for-byte unchanged
- New `tests/admin-bookings-kpi-decoupling.test.tsx` is the concrete D-05/DISP-04 guard: asserts the settings fetch wires the persisted default into `BookingsTable`, that the two KPI fetch URLs never carry a `horizon` param, and that toggling Future→Past fires exactly one additional list fetch and zero additional KPI fetches while `todayCount`/`weekRevenue` render values stay unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Future/Past/All segmented control + empty/error/precedence states** - `63d4a79` (feat)
2. **Task 2: Settings-driven default in bookings/page.tsx + KPI decoupling guard (D-05)** - `77e7d9e` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `components/admin/BookingsTable.tsx` - `BookingsTableProps` (`defaultHorizon`, `horizonDays`); ephemeral `horizon`/`setHorizon` state seeded from the prop; `fetchFailed` state; segmented control JSX in the filter bar; D-07 `dateRangeActive`/`displayHorizon`/`isFutureEmpty` derivations; horizon-aware + error-aware empty states in both mobile and desktop renders
- `tests/BookingsTable.test.tsx` - new `describe` block (7 tests): segment click → fetch param + no settings PATCH, remount-resets-to-persisted-default (D-04), distinct empty copy per segment, D-07 precedence + graying, refetch-error copy, active-segment brand-copper style
- `app/admin/(dashboard)/bookings/page.tsx` - new `defaultHorizon`/`defaultHorizonDays` state + a third independent settings-fetch `useEffect`; `<BookingsTable>` now receives `defaultHorizon`/`horizonDays` props; the two KPI fetches are unmodified
- `tests/admin-bookings-kpi-decoupling.test.tsx` (new) - the D-05/DISP-04 KPI-decoupling guard (3 tests)

## Decisions Made

- The persisted default is represented purely by the incoming prop (never re-stored in its own state slot) — the ephemeral override `useState` is seeded from it once on mount, so a component remount with the same prop naturally re-seeds from the persisted default rather than resuming a prior session's clicked segment (satisfies D-04 without needing a second explicit "persisted" state variable).
- `'last_n_days'` maps to the Future segment for highlighting purposes only (`displayHorizon`); the actual `horizon` fetch param stays `'last_n_days'` (with `horizonDays`) until the admin clicks a real segment, per the plan's explicit "nearest visible peer" instruction.
- D-07's "grayed" segment styling is implemented by simply forcing `isActive = false` for all three segments while `dateRangeActive` is true — the UI-SPEC's grayed-state tokens are byte-identical to the existing inactive-chip tokens, so no new visual state was introduced.
- The settings fetch in `bookings/page.tsx` is its own separate `useEffect`, not merged into the existing KPI-fetch `useEffect` — this makes the D-05 decoupling structural (three independent fetch call-sites) rather than relying solely on test coverage to catch an accidental merge.

## Deviations from Plan

None — plan executed exactly as written. Both tasks matched their `<action>` specs; all `<verify>` commands and `<acceptance_criteria>` passed as specified. One in-test correction (not a plan deviation): jsdom's `HTMLElement.style` serialization normalizes `rgba(191,160,106,0.09)` to `rgba(191, 160, 106, 0.09)` (spaces after commas) — the two style-assertion tests were adjusted to match jsdom's normalized form; the source file itself still contains the literal unspaced string (verified via `grep -c`).

## Issues Encountered

None.

## User Setup Required

None — this plan builds entirely on the already-live 65-01/65-02/65-03 schema and API surface; no new external configuration.

## Next Phase Readiness

Phase 65 (Dispatch — Future-First Bookings List) is now feature-complete across all four plans: DISP-01 (future-first resolution + sort, 65-02), DISP-02 (persisted default setting, 65-03 backend + 65-04 read-side wiring), DISP-03 (in-session segmented control, 65-04), and DISP-04 (KPI decoupling guard, 65-04). Full project vitest suite is green (100 files passed, 5 skipped, 1099 tests passed / 10 skipped / 139 todo, 0 failed) — no regressions from this plan. The plan's own Manual/UAT item ("load the admin bookings page, switch segments, confirm KPI numbers stay identical") remains open for phase-level verification, matching the pattern already noted in 65-02's SUMMARY. No blockers for Phase 65 milestone-level closure or for Phase 66 (Driver Trip Portal), which is independent of this phase's admin-bookings-list work.

---
*Phase: 65-dispatch-future-first-bookings-list*
*Completed: 2026-08-28*

## Self-Check: PASSED

All modified/created files (components/admin/BookingsTable.tsx, tests/BookingsTable.test.tsx,
app/admin/(dashboard)/bookings/page.tsx, tests/admin-bookings-kpi-decoupling.test.tsx, this
SUMMARY.md) and both task commit hashes (63d4a79, 77e7d9e) verified present on disk / in git log.
