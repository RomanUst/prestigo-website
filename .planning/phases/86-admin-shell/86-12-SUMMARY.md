---
phase: 86-admin-shell
plan: 12
subsystem: admin-ui
tags: [admin, stats, letter-case, d-10, kpi]
requires:
  - phase: 86-03
    provides: converted stats colours (OverviewTab, StatsChart)
provides:
  - sentence-case KPI labels and chart titles on the stats screen and bookings KPI row
affects: [86-08 light safety net]
tech-stack:
  added: []
  patterns: [sentence-case source + inline text-transform uppercase in KPICard/ChartCard]
key-files:
  created: []
  modified:
    - components/admin/stats/OverviewTab.tsx
    - components/admin/StatsChart.tsx
    - components/admin/stats/CustomersTab.tsx
    - components/admin/stats/B2BTab.tsx
    - "app/(internal)/admin/(dashboard)/bookings/page.tsx"
    - tests/stats-page.test.tsx
    - tests/stats-customers-tab.test.tsx
key-decisions:
  - "Case-only edits; KPICard label span and ChartCard title span keep inline textTransform uppercase, so dark still renders capitals"
requirements-completed: [ADM-03]
duration: 5min
completed: 2026-11-02
status: complete
actuals:
  tokens: 2500
  tasks: 2
  commits: 2
plan_head_before: 9bf6cf45e1dbb6f56925e6a1d8d5a9f36d191018
plan_head_after: 8972116d6c7dc55a449a0a696ea56bcee6403868
---

# Phase 86 Plan 12: Sentence-case stats and bookings KPI labels Summary

Stats screen and bookings KPI row now carry sentence-case label text in source (D-10); dark theme still shows capitals through the existing inline `text-transform: uppercase` of KPICard's label span and ChartCard's title span, and light theme shows sentence case.

## Changes (before -> after, case only)

OverviewTab.tsx (Task 1, commit 79555698):
- TODAY -> Today
- THIS WEEK -> This week
- THIS MONTH -> This month
- MONTHLY REVENUE -> Monthly revenue
- REVENUE BY CLASS -> Revenue by class
- REVENUE BY TRIP TYPE -> Revenue by trip type

StatsChart.tsx (Task 1):
- 12-MONTH REVENUE -> 12-month revenue

tests/stats-page.test.tsx: queries updated to Today, This week, This month, Monthly revenue.

CustomersTab.tsx (Task 2, commit 8972116d):
- REPEAT RATE -> Repeat rate
- REPEAT REVENUE SHARE -> Repeat revenue share
- REPEAT CUSTOMERS -> Repeat customers

B2BTab.tsx:
- B2B REVENUE -> B2B revenue
- B2B BOOKINGS -> B2B bookings
- CORPORATE ACCOUNTS -> Corporate accounts

bookings/page.tsx KPI row:
- TODAY -> Today
- THIS WEEK -> This week

tests/stats-customers-tab.test.tsx: queries updated to Repeat rate, Repeat revenue share, Repeat customers.

Values, subLabels (bookings, CZK) and data fetching untouched. Verified KPICard.tsx (line 28) and StatsChart ChartCard (line 39) keep `textTransform: 'uppercase'`.

## Verification

- `npx vitest run tests/stats-page.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 51 passed
- `npx vitest run tests/stats-customers-tab.test.tsx tests/stats-conversion-tab.test.tsx tests/stats-page.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx`: 55 passed (kpi-decoupling unchanged)
- `node scripts/qa/admin-caps-scan.mjs` on all five source files: exit 0
- scoped `tsc --noEmit`: no errors in this plan's files
- Tests ran through the node_modules symlink in the worktree without ERR_MODULE_NOT_FOUND.

## Deviations from Plan

None - plan executed exactly as written. The colour-guard ledger step mentioned by the orchestrator was not applicable (ledger dir already gone).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Both task commits (79555698, 8972116d) exist; all seven listed files modified; no STATE.md/ROADMAP.md changes.
