---
phase: 86-admin-shell
plan: 05
subsystem: ui
tags: [admin, theme, design-tokens, booking, wcag]
status: complete

requires:
  - phase: 86-01
    provides: admin-theme.css token sheet (--admin-*, --status-*), colour guard with per-plan pending ledger
provides:
  - booking detail sub-panels (flight status, driver assignment, dispatch default, change history) on theme tokens
  - manual-booking modal and new-booking wizard drawer as token-driven sheets (D-12)
  - on-accent text on copper-filled primary buttons (ManualBookingForm, AdminStep6Create)
affects: [86-11, 86-12, 86-13]

plan_head_before: 043b2d1bc9377767de2c8bc4c3c36e8077470d54
plan_head_after: 2c965157
actuals:
  tokens: 1500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Status colour maps expressed as var(--status-*) strings so one map serves both themes"

key-files:
  created: []
  modified:
    - components/admin/FlightStatusBlock.tsx
    - components/admin/DriverAssignmentSection.tsx
    - components/admin/DispatchDefault.tsx
    - components/admin/BookingChangeHistory.tsx
    - components/admin/ManualBookingForm.tsx
    - components/admin/AdminBookingWizard.tsx
    - components/admin/AdminStep6Create.tsx
  deleted:
    - tests/fixtures/admin-color-pending/86-05.json

key-decisions:
  - "Wizard sticky header background moved to var(--admin-surface) together with the drawer so the header stays opaque and identical to the drawer in both themes"
  - "ManualBookingForm panel padding switched to var(--admin-sheet-padding) (24px in dark, 32px in light) because the existing value was 24px"

requirements-completed: [ADM-03]

coverage:
  - id: D1
    description: "FlightStatusBlock, DriverAssignmentSection, DispatchDefault and BookingChangeHistory hold no hex/rgba literal; flight status maps to status/accent tokens"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/FlightStatusBlock.test.tsx, tests/DriverAssignmentSection.test.tsx, tests/booking-change-history.test.tsx, tests/admin-no-hardcoded-colors.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Manual-booking modal and wizard drawer are token-driven sheets; copper primary buttons use --admin-on-accent; errors use --status-danger-fg; ledger 86-05.json removed"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/manual-booking-channel.test.tsx, tests/manual-booking-form-send-confirmation.test.tsx, tests/admin-theme-css.test.ts, tests/admin-no-hardcoded-colors.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Visual result of the sheets and flight status chips in light and dark in a real browser"
    verification: []
    human_judgment: true
    rationale: "Authenticated admin screens cannot be reached on localhost (fail-closed limiter); owner UAT on production at phase closeout."

duration: 6min
completed: 2026-11-02
---

# Phase 86 Plan 05: Booking sub-panels, manual booking and wizard on tokens Summary

**Seven booking-group admin components converted to `--admin-*` / `--status-*` tokens: flight status chips on status tokens, manual-booking modal and wizard drawer as scrim/surface/shadow sheets, and copper buttons with `--admin-on-accent` text.**

## Performance

- **Duration:** about 6 minutes
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 7 modified, 1 deleted (pending ledger)

## Accomplishments

- Tracer: `FlightStatusBlock` status map now reads scheduled/active from accent text on `--admin-accent-tint-strong`, landed/delayed/cancelled/diverted from the `--status-ok|warn|danger` fg/bg pairs and unknown from `--admin-text-muted` on transparent. Existing FlightStatusBlock, DriverAssignmentSection and change-history tests plus the guard stayed green before expansion.
- `DriverAssignmentSection` (2) and `BookingChangeHistory` (1) red text literals became `var(--status-danger-fg)`. `DispatchDefault` lost all four literals including both `var()` hex fallbacks (panel `--admin-surface`, input well `--admin-input-bg`, error `--status-danger-fg`, active segment `--admin-accent-tint`).
- `ManualBookingForm` overlay uses `--admin-scrim`; the panel uses `--admin-surface`, `--admin-border`, `--admin-radius-lg`, `--admin-shadow-sheet` and `--admin-sheet-padding`; its three red literals and the submit button text moved to tokens. Internal scrolling (`maxHeight: 90vh; overflowY: auto`) untouched.
- `AdminBookingWizard` backdrop uses `--admin-scrim`, drawer and sticky header use `--admin-surface`, drawer gets `--admin-shadow-sheet`; sticky header, copper accent line and drawer scrolling unchanged (UI-SPEC E6).
- `AdminStep6Create` error line and create button text moved to `--status-danger-fg` / `--admin-on-accent`.
- `tests/fixtures/admin-color-pending/86-05.json` deleted; the colour guard stays green without it.

## Task Commits

1. **Task 1 (tracer): booking detail sub-panels on status tokens** - `393f88db` (feat)
2. **Task 2: manual booking and wizard sheets on tokens** - `2c965157` (feat)

## Verification Results

- Task 1: `npx vitest run` on FlightStatusBlock, DriverAssignmentSection, booking-change-history, admin-no-hardcoded-colors, admin-theme-css: 5 files, 75 tests passed. Literal grep over the four files prints 0.
- Task 2: manual-booking-channel, manual-booking-form-send-confirmation, admin-no-hardcoded-colors, admin-theme-css: 4 files, 55 tests passed.
- `tsc --noEmit` shows no errors in any of the seven files; `eslint --quiet` clean on the edited files.
- Acceptance greps: `--admin-on-accent` 1 in each of ManualBookingForm and AdminStep6Create; `--admin-scrim` 1 in each of ManualBookingForm and AdminBookingWizard; ledger file absent.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- No tokens were added and `admin-theme.css` was not touched.
- The per-plan commit ledger in the git dir was not used (sandbox refuses commands naming the worktree git dir); the base SHA from the spawn-time HEAD assertion was used for `plan_head_before`, and `commits: 2` is measured with `git rev-list --count` from it.
- `node_modules` is a symlink to the main checkout's and is gitignored.

## Known Stubs

None.

## Threat Flags

None. T-86-22 mitigated: primary actions use `--admin-on-accent` and errors `--status-danger-fg`, both covered by the 86-01 contrast test.

## Next Phase Readiness

Plan 86-11 (shared public booking steps rendered by the wizard) is unaffected. The remaining entries in the pending ledgers belong to other plans.

## Self-Check: PASSED

- All seven modified files present; `tests/fixtures/admin-color-pending/86-05.json` absent as required.
- Commits `393f88db` and `2c965157` exist in `git log 043b2d1b..HEAD`.
- STATE.md and ROADMAP.md not modified.
