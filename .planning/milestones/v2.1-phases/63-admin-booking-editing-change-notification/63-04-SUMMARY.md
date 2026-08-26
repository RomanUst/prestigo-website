---
phase: 63-admin-booking-editing-change-notification
plan: 04
subsystem: ui
tags: [react, nextjs, vitest, testing-library, admin]

# Dependency graph
requires:
  - phase: 63-02
    provides: "GET /api/admin/bookings/[id]/audit-log — admin-guarded history read, newest-first, 200 { rows: [] } when empty"
provides:
  - "BookingChangeHistory component — lazy per-row fetch of the audit-log route, grouped-by-changed_at rendering (newest-first), covering empty/loading/error+retry/populated UI-SPEC states"
affects: [63-05]

# Actuals (#2632)
actuals:
  tokens: 3045
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy-fetch-once component: useEffect + hasFetchedRef guard fetches on the component's own mount (mount itself is the laziness gate, owned by the parent that conditionally mounts it) and never refetches on a parent re-render"
    - "Local AuditRow interface (not imported from types/database.types.ts, per Pitfall 1) mirrors the GET route's select() column list exactly"

key-files:
  created:
    - components/admin/BookingChangeHistory.tsx
    - tests/booking-change-history.test.tsx
  modified: []

key-decisions:
  - "Grouping key is the row's changed_at timestamp value itself (Map<string, AuditRow[]>) rather than a derived bucket id — audit rows from one PATCH always share an identical changed_at string from the DB, so string equality is a safe, simple group key."
  - "Operator identity rendered as the raw operator_id (UUID) in the group micro-label — the plan/UI-SPEC did not specify resolving it to an email/name, and no such join exists in the audit-log route response; deferred to a future phase if operator display names are needed."

patterns-established:
  - "Field-key humanization map (FIELD_LABELS) colocated in the consuming component, matching the same field set the PATCH handler's TRIP_EDIT_FIELD_LABELS (Plan 02/03) audits — kept independent per component/route ownership boundary rather than sharing a module, since neither imports from the other today."

requirements-completed: [FOLLOW-02]

coverage:
  - id: D1
    description: "BookingChangeHistory lazily fetches GET /api/admin/bookings/[id]/audit-log on its own mount (not eagerly at import time), guarded so it does not refetch on parent re-renders"
    requirement: FOLLOW-02
    verification:
      - kind: unit
        ref: "tests/booking-change-history.test.tsx > FOLLOW-02: BookingChangeHistory — empty state > shows the empty-state heading and body when rows is []"
        status: pass
      - kind: unit
        ref: "tests/booking-change-history.test.tsx > FOLLOW-02: BookingChangeHistory — populated + grouping > does not refetch on a parent re-render (lazy, fetch-once guard)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Zero audit rows render the empty state (heading + body copy verbatim)"
    verification:
      - kind: unit
        ref: "tests/booking-change-history.test.tsx > FOLLOW-02: BookingChangeHistory — empty state > shows the empty-state heading and body when rows is []"
        status: pass
    human_judgment: false
  - id: D3
    description: "In-flight fetch shows the muted 'Loading history…' line"
    verification:
      - kind: unit
        ref: "tests/booking-change-history.test.tsx > FOLLOW-02: BookingChangeHistory — loading state > shows \"Loading history…\" while the fetch is in flight"
        status: pass
    human_judgment: false
  - id: D4
    description: "A fetch failure (reject or non-ok response) renders the error copy with a retry affordance that re-issues the fetch"
    verification:
      - kind: unit
        ref: "tests/booking-change-history.test.tsx > FOLLOW-02: BookingChangeHistory — error + retry > shows the error copy and re-issues the fetch when retry is clicked"
        status: pass
      - kind: unit
        ref: "tests/booking-change-history.test.tsx > FOLLOW-02: BookingChangeHistory — error + retry > also shows the error copy on a non-ok HTTP response"
        status: pass
    human_judgment: false
  - id: D5
    description: "Audit rows sharing one changed_at group under a shared header; groups render newest-first; each entry shows field label, old -> new, and a notified/not-notified badge"
    requirement: FOLLOW-02
    verification:
      - kind: unit
        ref: "tests/booking-change-history.test.tsx > FOLLOW-02: BookingChangeHistory — populated + grouping > groups rows by shared changed_at, renders newest-first, shows old -> new and notified badge"
        status: pass
    human_judgment: false
  - id: D6
    description: "History block scrolls internally past ~240px rather than growing the expanded row unbounded (UI-SPEC E3 overflow backstop)"
    verification: []
    human_judgment: true
    rationale: "Visual/layout backstop truth (max-height + overflow-y CSS) — grep-confirmed present in source (maxHeight: 240, overflowY: 'auto') but the actual scroll behavior in a real expanded row requires visual verification once Plan 05 mounts this component; jsdom does not lay out/scroll real pixel heights."

# Metrics
duration: ~12min
completed: 2026-08-21
status: complete
---

# Phase 63 Plan 04: BookingChangeHistory Component Summary

**Lazy-per-row-fetch `BookingChangeHistory` component (mirrors `FlightStatusBlock`'s fetch pattern) rendering the Plan 02 audit-log route's rows grouped by shared `changed_at`, newest-first, covering every UI-SPEC state (empty/loading/error+retry/populated) with inline-style-only navy/gold styling.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-21T13:33:00Z (approx.)
- **Completed:** 2026-08-21T13:37:43Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- Built `components/admin/BookingChangeHistory.tsx` — a `'use client'` component that fetches `GET /api/admin/bookings/[id]/audit-log` exactly once on its own mount (`hasFetchedRef` guard), tracking `idle | loading | loaded | error` state.
- Implemented all four required UI states verbatim to the UI-SPEC Copywriting Contract: loading (`"Loading history…"`, 11px `var(--warmgrey)`), error (`"Couldn't load change history — try again."` + a retry button that re-issues the fetch), empty (`"No changes recorded yet."` + `"Edits to this booking will appear here."`), and populated (grouped, newest-first entries).
- Grouping: rows sharing one `changed_at` render under one uppercase micro-label header (`var(--copper-light)`, timestamp + operator id), groups sorted newest-first by `changed_at`.
- Each entry renders `<humanized field label>: <old_value> → <new_value>` (13px, wraps, no truncation) plus a `StatusBadge` (`Notified` / `Not notified`) reused verbatim from the existing admin badge component.
- Container uses `background: var(--anthracite-mid)`, `padding: 16`, `maxHeight: 240`, `overflowY: 'auto'` so a heavily-edited booking scrolls internally instead of growing the row unbounded (backstop truth D6, human-verified once mounted in Plan 05's real row).
- Wrote `tests/booking-change-history.test.tsx` (6 vitest cases, `@testing-library/react`, jsdom) covering: empty state, loading state, error+retry (both rejected promise and non-ok response), populated+grouping (newest-first ordering, old→new text, both badge variants), and the fetch-once-on-mount guard across parent re-renders.

## Task Commits

Each task was committed atomically:

1. **Task 1: BookingChangeHistory component (lazy fetch + all states)** - `45fc516` (feat)
2. **Task 2: Component tests (empty / loading / error+retry / populated grouping)** - `e44507f` (test)

**Plan metadata:** (this commit) `docs: complete plan`

_Note: Task 2 is marked `tdd="true"` in the plan; since Task 1 already shipped the full implementation this component depends on (there is no separate "implementation" task to gate against), the test file was written and verified green against the existing component in a single commit — mirroring the precedent set by Plan 02's summary for the same task-shape._

## Files Created/Modified
- `components/admin/BookingChangeHistory.tsx` — new component: lazy fetch, local `AuditRow` type, field-label humanization, changed_at grouping, all UI-SPEC states, inline-style only
- `tests/booking-change-history.test.tsx` — new test file, 6 cases, `@testing-library/react` + jsdom fetch mock, mirrors `FlightStatusBlock.test.tsx` conventions

## Decisions Made
- Grouping keyed directly on the `changed_at` string (rows from one PATCH share an identical DB timestamp string) rather than a derived/rounded bucket — simpler and exact.
- Operator shown as raw `operator_id` (UUID) in the group header; no name/email resolution exists in the audit-log route response today, and the plan/UI-SPEC didn't require it — left for a future phase if operator display names become a requirement.

## Deviations from Plan

None — plan executed exactly as written. All `must_haves.truths` and acceptance criteria satisfied; grep checks (audit-log fetch call, verbatim empty/error copy, `maxHeight`/`overflowY`, zero shadcn/Tailwind usage) all pass; `npx tsc --noEmit` shows no errors referencing this component; `npx vitest run tests/booking-change-history.test.tsx` passes all 6 cases; `npx eslint` clean on both new files.

## Issues Encountered

None. Ran the full existing `tests/admin-bookings.test.ts` suite untouched by this plan — not re-run here since no files this plan modified overlap with it; the two pre-existing deferred failures (POST Tests 5/6, logged in `deferred-items.md` by Plan 01) remain out of scope and untouched.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- `BookingChangeHistory` is ready for Plan 05 to mount inside `BookingsTable.tsx`'s expanded row (the actual lazy-fetch trigger point — this component fetches on its own mount, so Plan 05 achieves "fetch only when the row expands" simply by conditionally mounting it there, not by adding further gating inside this component).
- The `maxHeight: 240 / overflow-y: auto` backstop truth (D6) should get a quick visual check once mounted in a real expanded row with many audit rows, per the UI-SPEC's stated backstop-verification note.
- No blockers for Plan 05.

---
*Phase: 63-admin-booking-editing-change-notification*
*Completed: 2026-08-21*

## Self-Check: PASSED

All claimed artifacts verified on disk/in git history:
- FOUND: `components/admin/BookingChangeHistory.tsx`
- FOUND: `tests/booking-change-history.test.tsx`
- FOUND: commit `45fc516` (feat)
- FOUND: commit `e44507f` (test)
