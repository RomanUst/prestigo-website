---
phase: 86-admin-shell
plan: 03
subsystem: ui
tags: [admin, theme, design-tokens, status-badge, modal, recharts, vitest]
status: complete

requires:
  - phase: 86-01
    provides: admin-theme.css token sheet (--admin-*, --status-*) and the ADM-03 colour guard with per-plan ledger
provides:
  - StatusBadge with exported STATUS_FAMILY (14 variants -> 7 families) rendering only var(--status-*)
  - token-driven Modal sheet with pinned header, lucide X close and scrolling admin-modal-body
  - token-only adminFieldStyles, KPICard, HealthBanner
  - StatsChart / OverviewTab on --admin-chart-1/2/3 and admin text/border tokens
  - ZoneMapInner with its two danger literals on var(--status-danger-fg)
affects: [86-08, every admin screen using StatusBadge, Modal, adminFieldStyles, KPICard, charts]

plan_head_before: 043b2d1bc9377767de2c8bc4c3c36e8077470d54
plan_head_after: 4c1979534266ea82b35d894658abcfdccd5ed8da

actuals:
  tokens: 9000    # chars/4 over the 10 files changed
  tasks: 3
  commits: 3      # measured: git rev-list --count 043b2d1b..HEAD (before this SUMMARY commit)

tech-stack:
  added: []
  patterns:
    - "Variant -> family lookup (STATUS_FAMILY) so chips never carry colour literals"
    - "Chart series colours passed as var(--admin-chart-N) strings, never resolved to hex in TS"

key-files:
  created:
    - tests/StatusBadge.test.tsx
  modified:
    - components/admin/StatusBadge.tsx
    - components/admin/Modal.tsx
    - components/admin/adminFieldStyles.ts
    - components/admin/KPICard.tsx
    - components/admin/HealthBanner.tsx
    - components/admin/StatsChart.tsx
    - components/admin/stats/OverviewTab.tsx
    - components/admin/ZoneMapInner.tsx
  deleted:
    - tests/fixtures/admin-color-pending/86-03.json

key-decisions:
  - "ChartCard title colour moved from legacy var(--copper) to var(--admin-kpi-label) (same role as the KPI label, token exists in both themes)"
  - "Modal close icon is lucide X size 20 aria-hidden; Esc, focus return and backdrop close untouched"

requirements-completed: [ADM-03]

coverage:
  - id: D1
    description: "Every StatusBadge variant renders its label and only var(--status-F-fg|bg|border) of its family; no hex/rgb in any rendered style; nowrap chip with ellipsis label"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/StatusBadge.test.tsx (17 tests, 14 variant cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Modal, field styles, KPICard and HealthBanner hold no colour literal and use the D-11/D-12 tokens; existing consumer pages still pass"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/identities-page, erasure-page, outbox-admin-page, stats-page, admin-bookings-kpi-decoupling, admin-no-hardcoded-colors, admin-theme-css"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stats charts use chart/text/border tokens; ZoneMapInner diff is exactly 2 lines vs merge-base and has no colorScheme option; ledger 86-03.json deleted"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/stats-page, stats-customers-tab, stats-conversion-tab, admin-no-hardcoded-colors"
        status: pass
      - kind: other
        ref: "git diff --numstat b2bccc78 -- components/admin/ZoneMapInner.tsx = 2 2"
        status: pass
    human_judgment: false
  - id: D4
    description: "Visual result of chips, modal sheet, cards and charts in a real browser in both themes"
    verification: []
    human_judgment: true
    rationale: "Authenticated admin screens are not reachable on localhost (fail-closed limiter); owner UAT on production at phase closeout."

duration: 8min
completed: 2026-11-02
---

# Phase 86 Plan 03: Shared admin primitives, charts and map on theme tokens Summary

**StatusBadge, Modal, field styles, KPICard, HealthBanner and the stats charts now read only `--admin-*` / `--status-*` tokens (STATUS_FAMILY lookup for 14 chip variants), and the zones map changes by exactly two danger-colour lines.**

## Accomplishments

- Tracer: `StatusBadge` variant -> `STATUS_FAMILY` -> `var(--status-F-*)` -> the 86-01 token sheet, proven by a new 17-test component file (14 variant cases) plus the CSS completeness test, before expansion.
- Chips keep their label text in every variant, are `nowrap` / `max-width: 100%`, and the label sits in an ellipsis span; dot is 6px in the family fg colour.
- Modal: sheet on `--admin-surface` with `--admin-shadow-sheet`, `--admin-radius-lg`, `--admin-sheet-padding`, heading in `--admin-font-heading`, 44x44 close button with lucide `X`, `--admin-scrim` overlay; header row `flexShrink: 0` while `div.admin-modal-body` scrolls (`overflowY: auto`, `flex: 1`, `minHeight: 0`).
- KPICard: flat card (no shadow), `--admin-card-hover-border` on hover, `--admin-kpi-label` label, 28px display value token.
- StatsChart: `CHART_COLORS` renamed series1..3 (`var(--admin-chart-1|2|3)`), axis / grid / tooltip / legend on admin tokens; OverviewTab's six series colours replaced in place.
- ZoneMapInner: only the delete-confirm "Yes" colour and the trash-icon hover colour changed to `var(--status-danger-fg)`; no colorScheme, no theme-bound key, no attribution-related option.
- Ledger `tests/fixtures/admin-color-pending/86-03.json` deleted; colour guard passes with no 86-03 entries.

## Task Commits

1. **Task 1 (tracer): StatusBadge on status tokens** - `1eae720d`
2. **Task 2: Modal, field styles, KPI card, health banner** - `b6401196`
3. **Task 3: stats charts and zones map literals** - `4c197953`

## Verification Results

- Plan verification set (11 test files, 212 tests): all pass (`StatusBadge`, `DriverAssignmentSection`, identities, erasure, outbox, stats x3, kpi-decoupling, colour guard, theme CSS).
- `tsc --noEmit`: no errors under `components/admin/`. `eslint --quiet` clean on all touched TS/TSX.
- Acceptance greps: no hex/rgba in Modal / adminFieldStyles / HealthBanner / StatusBadge; `admin-modal-body` x1, `--admin-shadow-sheet` x1, `--admin-card-hover-border` x1, `--admin-focus` x1; `colorScheme` absent from ZoneMapInner.
- ZoneMapInner `git diff --numstat` against `git merge-base HEAD origin/main` (b2bccc78) = `2 2`.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- No exact token existed for a few old literals; nearest listed tokens were used (label font weight 400 -> `--admin-fw-strong`, which is 400 in dark and 500 in light; KPICard label 11px -> `--admin-fs-label`; input font size 13px -> `--admin-fs-body`). All match the plan's prescribed mapping.
- The `ChartCard` title and the stats chart titles are still typed in capitals (`12-MONTH REVENUE`, etc.) and StatusBadge/labelStyle/KPICard keep inline `textTransform: uppercase`; the D-10 capital-label cleanup and the 86-08 light safety net own that, not this plan.
- `node_modules` is a symlink to the main checkout's and is gitignored; not committed.

## Known Stubs

None.

## Threat Flags

None. T-86-10 mitigated (two-line ZoneMapInner diff, no map option added); T-86-11 mitigated (label rendered for all 14 variants, tested); T-86-SC: no package installs.

## Self-Check: PASSED

- Created/changed files present: tests/StatusBadge.test.tsx and the eight component files; `86-03.json` absent.
- Commits `1eae720d`, `b6401196`, `4c197953` exist in `git log 043b2d1b..HEAD`.
- STATE.md and ROADMAP.md not modified; admin-theme.css not modified.
