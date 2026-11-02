---
phase: 86-admin-shell
plan: 11
subsystem: ui
tags: [admin, theme, css-custom-properties, booking, public-parity, oq1]
status: complete

requires:
  - phase: 86-01
    provides: --status-danger-fg / --status-warn-fg / --status-ok-fg tokens for both admin themes, undefined outside .admin-shell
provides:
  - four public booking files whose colour literals are var(--status-*-fg, <original literal>)
affects: [86-admin-wizard, AdminBookingWizard]

plan_head_before: 043b2d1bc9377767de2c8bc4c3c36e8077470d54
plan_head_after: 5b52a2baa9d9ead1e59e1286542daf829ae16ceb

actuals:
  tokens: 1500   # chars/4 over the diff of 4 files (23 one-line wraps)
  tasks: 2
  commits: 2     # measured: git rev-list --count 043b2d1b..HEAD before the SUMMARY commit

tech-stack:
  added: []
  patterns:
    - "Public-component theming via var(--token, original literal): token undefined outside .admin-shell, so the public site is byte-identical"

key-files:
  created: []
  modified:
    - components/booking/steps/Step5Passenger.tsx
    - components/booking/steps/Step1TripType.tsx
    - components/booking/steps/Step2DateTime.tsx
    - components/booking/AddressInput.tsx

key-decisions:
  - "Followed OQ1 literally: only wrap, never recolour; fallback keeps the exact original literal"

requirements-completed: [ADM-03]

coverage:
  - id: D1
    description: "23 colour literals in the four shared booking files are wrapped as var(--status-*-fg, <same literal>); inside the admin wizard they resolve to the theme's status colour, outside .admin-shell they fall back to the original value"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/Step5Passenger.test.tsx, tests/AddressInput.test.tsx, tests/Step1TripType.test.tsx, tests/Step2DateTime.test.tsx"
        status: pass
      - kind: integration
        ref: "tests/book-page-render.test.tsx, fleet-page-render, route-page-render, routes-hub-render, multi-day-page-render, nav-locale-render-parity (golden snapshots, unedited)"
        status: pass
      - kind: unit
        ref: "tests/admin-theme-css.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Visual readability of the passenger-step errors inside the light admin wizard"
    verification: []
    human_judgment: true
    rationale: "Authenticated admin pages are not reachable on localhost (fail-closed limiter); contrast of --status-danger-fg on cream is covered by the 86-01 WCAG test, the real render is owner UAT on production."

duration: 6min
completed: 2026-11-02
---

# Phase 86 Plan 11: Admin-themable colours in shared booking steps Summary

**Wrapped all 23 colour literals in Step5Passenger, Step1TripType, Step2DateTime and AddressInput as `var(--status-*-fg, <original literal>)` so the admin new-booking wizard themes them while the public site renders unchanged.**

## Performance

- **Duration:** about 6 minutes
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 4 modified, 0 created; 23 lines changed (one-line replacements)

## Accomplishments

- Tracer (Step5Passenger): 16 x `#f87171` -> `var(--status-danger-fg, #f87171)`, 2 x `#E67E22` -> `var(--status-warn-fg, #E67E22)`, 1 x `#27AE60` -> `var(--status-ok-fg, #27AE60)`. Tracer verify (Step5 unit test, book-page golden snapshot, CSS completeness test) green before expansion.
- Step1TripType `#ff8a7a` -> danger token, Step2DateTime `#25D366` -> ok token, AddressInput 2 x `#C0392B` -> danger token.
- The `&#10003;` entity, layout, copy, i18n and logic untouched.

## Task Commits

1. **Task 1 (tracer): Step5Passenger** - `20641a75` (feat)
2. **Task 2: Step1TripType, Step2DateTime, AddressInput** - `5b52a2ba` (feat)

## Verification Results

- Task 1 verify: 3 files, 48 tests passed; 19 wrapped literals counted in Step5Passenger.
- Task 2 verify: 11 files, 112 tests passed (52 todo), no snapshot written or obsolete.
- Count gate: 23 wrapped literals across the four files.
- No-unwrapped-form gate: after stripping the wrapped tokens, no hex, rgba, hsla, oklch or color-mix remains in the four files (prints nothing).
- Added-line gate: every added line in `components/booking` matches one of the six inventoried fallbacks (0 non-matching), diffed against the spawn base `043b2d1b`.
- `git diff --stat 043b2d1b -- tests/__snapshots__` is empty.

## Deviations from Plan

None - plan executed exactly as written.

Environment notes (not plan deviations):
- The plan's diff gates reference `git merge-base HEAD origin/main`; the worktree base is the milestone branch, so the gates were run against the spawn base `043b2d1b` instead (same intent: only this plan's changes are measured).
- BSD `sed -i -E` created a stray `Step5Passenger.tsx-E` backup file in the tracer; it was removed before staging and never committed.
- `node_modules` is a symlink to the main checkout's and was not committed.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file-access surface; T-86-13 mitigations (count gate, added-line gate, no-unwrapped gate, unedited snapshots) all hold.

## Notes for the orchestrator

- All three tokens (`--status-danger-fg`, `--status-warn-fg`, `--status-ok-fg`) already exist in `app/(internal)/admin/admin-theme.css` for both themes; no missing token to report. `admin-theme.css` was not edited.

## Next Phase Readiness

The wizard's shared public steps are theme-ready. Remaining colour work for `AdminBookingWizard` itself belongs to its own plan.

## Self-Check: PASSED

- 4 modified files present; commits `20641a75` and `5b52a2ba` exist in `git log 043b2d1b..HEAD`.
- STATE.md and ROADMAP.md not modified.
