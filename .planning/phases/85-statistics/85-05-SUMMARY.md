---
phase: 85-statistics
plan: 05
subsystem: admin-ui
tags: [stats, admin, tabs, url-state, b2b, period-selector]
requires:
  - phase: 85-02
    provides: lib/admin-stats.ts (periodSchema, presets, formatters, b2bStatsSchema) and GET /api/admin/stats/b2b
provides:
  - /admin/stats tab shell (Overview, B2B) with ?tab&from&to URL state
  - B2B tab (revenue share, bookings, per-account table with links)
  - PeriodSelector (presets + custom range), StatsTable/StatsNote shared by plan 85-06
affects: [85-06]
tech-stack:
  added: []
  patterns:
    - "URL state read from window.location after mount, written with history.replaceState(history.state, ...) (no useSearchParams)"
    - "Result keyed by period (key = from|to) so a stale or mismatched response reads as Loading; AbortController per request"
key-files:
  created:
    - components/admin/stats/OverviewTab.tsx
    - components/admin/stats/StatsTable.tsx
    - components/admin/stats/B2BTab.tsx
    - components/admin/stats/PeriodSelector.tsx
    - tests/stats-page.test.tsx
  modified:
    - app/(internal)/admin/(dashboard)/stats/page.tsx
key-decisions:
  - "TABS is a module-local const in page.tsx (not exported): a Next.js page file may only export its default component, so exporting TABS would break next build. StatsTab type is exported (erased at build)."
  - "B2BTab stores {key, data} and derives loading from key mismatch instead of calling setState inside the effect; combined with abort in cleanup this covers stale responses without an extra gap fix."
status: complete
commits: 2
plan_head_before: 542f7733074efb070195f4b74bd7f45644cf912b
plan_head_after: 6ad492fe1fade5136878f72b9ba6d183fe04fa70
actuals:
  tokens: 8900
  tasks: 2
  commits: 2
completed: 2026-10-31
---

# Phase 85 Plan 05: Stats tab shell + B2B tab Summary

`/admin/stats` is now a tabbed page whose tab and period live in a shareable URL, the Overview is moved unchanged into its own component, and the B2B tab shows B2B revenue/bookings and a per-corporate-account table linking to the account pages, with a preset + custom-range period selector.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Tab shell + URL state + B2B tab, Overview moved unchanged | b23d1436 |
| 2 | Period selector (presets + custom range) wired to the URL, stale-response protection | 6ad492fe |

(The commit count in the frontmatter covers the two task commits; the SUMMARY commit follows.)

## What was built

- `app/(internal)/admin/(dashboard)/stats/page.tsx`: client tab shell. Reads `tab`/`from`/`to` once after mount (invalid tab -> overview, invalid or missing period -> `defaultPeriod(new Date())`), rewrites the URL with `window.history.replaceState(window.history.state, ...)` on every tab/period change, renders the tab content only after the URL was read (nothing is fetched earlier). Tab bar uses `role="tab"` / `aria-selected`.
- `components/admin/stats/OverviewTab.tsx`: the former page body verbatim (same endpoint `/api/admin/stats`, KPI labels, CZK charts, loading/error/empty texts); only the `Stats` heading moved to the shell. `app/api/admin/stats/route.ts` untouched.
- `components/admin/stats/StatsTable.tsx`: `StatsTable` (accounts-table markup, hover rows, optional total row, empty text) and `StatsNote`.
- `components/admin/stats/B2BTab.tsx`: fetches `/api/admin/stats/b2b?from&to` with an AbortController, validates with `b2bStatsSchema`; KPIs B2B REVENUE (formatEur + formatPct share, `n/a` for 0 total), B2B BOOKINGS, CORPORATE ACCOUNTS; table Account / Bookings / Revenue (EUR) / Avg booking (EUR) / Last trip in RPC order, name -> `/admin/accounts/<user_id>` with fallback company_name -> full_name -> email -> `Corporate account`; empty text `No B2B trips in this period.`; group-payment note when any `without_amount > 0`; definition note.
- `components/admin/stats/PeriodSelector.tsx`: five preset buttons (`aria-pressed` via `matchPreset`), From/To date inputs with Apply validated by `periodSchema`, `Invalid date range` (role alert) with no change on failure, active range line. Shown on every tab except Overview.
- `tests/stats-page.test.tsx`: 22 tests (shell, Overview, B2B tab, URL handling, presets, custom range, invalid ranges, stale response).

## Verification

- `npx vitest run tests/stats-page.test.tsx tests/admin-stats-period.test.ts tests/admin-stats-routes.test.ts`: 95 passed.
- `npx tsc --noEmit`: no errors outside `tests/` (8 baseline test errors unchanged).
- `npx eslint --quiet` on the stats page, `components/admin/stats/`, and the test: clean.
- Acceptance greps: OverviewTab keeps `fetch('/api/admin/stats')`, `MONTHLY REVENUE`, `REVENUE BY TRIP TYPE`; page has one `replaceState(window.history.state`; no `useSearchParams`; no `€` in any new file.
- Not browser-verified (executor has no preview tools); the orchestrator verifies visually.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TABS not exported from the page file**
- **Found during:** Task 1
- **Issue:** The plan's artifact list names `TABS` as a page export, but a Next.js `page.tsx` may only export its default component (and route config); a named const export fails `next build` type validation.
- **Fix:** `TABS` is module-local; only the `StatsTab` type is exported. Plan 85-06 edits the same file to register its tabs.
- **Files modified:** `app/(internal)/admin/(dashboard)/stats/page.tsx`
- **Commit:** b23d1436

Otherwise the plan was executed as written. The B2BTab abort/stale handling needed no adjustment after the Task 2 stale-response test.

## Tracer gate

Tracer verified end-to-end by the page test (URL -> shell -> B2B fetch -> KPIs + linked table) before expanding to Task 2.

## Known Stubs

None.

## Threat Flags

None. T-85-17 (tab checked against registered ids, period via `periodSchema`) and T-85-18 (names/emails rendered as React text, links built from the RPC `user_id`) are implemented as planned.

## Next

Plan 85-06 adds the Conversion and Customers tabs to the same shell (register them in `TABS` in the page and reuse `StatsTable`/`StatsNote`/`PeriodSelector`).
