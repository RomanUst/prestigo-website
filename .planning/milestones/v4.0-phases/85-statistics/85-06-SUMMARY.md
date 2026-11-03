---
phase: 85-statistics
plan: 06
subsystem: admin-ui
tags: [stats, admin, conversion, customers, deep-link, security]
requires:
  - phase: 85-02
    provides: lib/admin-stats.ts (sources, labels, schemas, formatters) and GET /api/admin/stats/{conversion,customers}
  - phase: 85-05
    provides: stats tab shell, StatsTable/StatsNote, PeriodSelector, B2BTab fetch pattern
provides:
  - Conversion tab (funnel per inquiry source + direct bookings table)
  - Customers tab (repeat rate, repeat revenue share, top 10 repeat customers linked to their bookings)
  - BookingsTable deep link accepting a strict email (?search=<email>)
affects: []
tech-stack:
  added: []
  patterns:
    - "Same fetch/AbortController/zod-parse/result-keyed-by-period pattern as B2BTab in both new tabs"
    - "Every percentage printed next to its counts; 'n/a' for a zero denominator"
key-files:
  created:
    - components/admin/stats/ConversionTab.tsx
    - components/admin/stats/CustomersTab.tsx
    - tests/stats-conversion-tab.test.tsx
    - tests/stats-customers-tab.test.tsx
  modified:
    - app/(internal)/admin/(dashboard)/stats/page.tsx
    - tests/stats-page.test.tsx
    - components/admin/BookingsTable.tsx
    - tests/BookingsTable.test.tsx
key-decisions:
  - "Funnel total row renders funnel_total (distinct converting bookings), never the sum of the row revenues; its Conversion cell uses the same '<pct> (<converted> of <inquiries>)' format."
  - "A top-customer row with an email but no name links with the email as its text; a row without email renders the name as plain text."
  - "Window note pluralises: '1 inquiry is still inside ...' / 'N inquiries are still inside their 90-day window'."
  - "Email deep link is a second strict regex next to the unchanged reference regex, plus an explicit length <= 254 check."
status: complete
commits: 3
plan_head_before: 9365fe1e17cca30f6f3a5767077f915d3682b5e2
plan_head_after: 4d4e60483e9a90d5a32ce32157da7b6dd7b41c50
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
completed: 2026-10-31
---

# Phase 85 Plan 06: Conversion and Customers tabs + email deep link Summary

`/admin/stats` now shows Overview, Conversion, Customers and B2B tabs; the Conversion tab gives inquiries to paid bookings per source with counts beside every percentage, the Customers tab gives the repeat rate, revenue share and top 10 repeat customers, each linked to their bookings through a new strict-email deep link in the bookings table.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Conversion tab: funnel table, funnel_total row, window note, direct bookings table | 2898eb20 |
| 2 | Customers tab: KPIs, top 10 table with encoded bookings links | 62e757e2 |
| 3 | `security:` strict email in `readBookingDeepLink` | 4d4e6048 |

(The frontmatter commit count covers the three task commits; the SUMMARY commit follows.)

## What was built

- `ConversionTab`: fetches only `/api/admin/stats/conversion?from&to`. Funnel `StatsTable` (Source, Inquiries, Converted, Conversion, Revenue (EUR)) with one row per `FUNNEL_SOURCES` entry; `chat_other` only when it has inquiries; Conversion cell `33.3% (1 of 3)` or `n/a`. Total row from `funnel_total`. Notes: open-window count (only when > 0) and the paid-booking / 90-day / marked-converted definition. Second table "Direct bookings (no recorded inquiry)" in `DIRECT_SOURCES` order with `direct_total`, no Conversion column.
- `CustomersTab`: fetches only `/api/admin/stats/customers?from&to`. KPIs REPEAT RATE, REPEAT REVENUE SHARE (both with counts/amounts), REPEAT CUSTOMERS (all time). "Top repeat customers (all-time revenue)" table (Name, Email, Trips, Revenue (EUR), First trip, Last trip) in RPC order; name links to `/admin/bookings?search=` + `encodeURIComponent(email)`; empty text `No repeat customers yet.`; D-12 note.
- Stats page: `TABS` is now Overview, Conversion, Customers, B2B (still module-local, not exported).
- `readBookingDeepLink`: reference regex `^[A-Za-z0-9-]{1,40}$` unchanged; additionally a trimmed value of at most 254 characters matching `^[^\s@<>"'`]{1,64}@[^\s@<>"'`]+\.[^\s@<>"'`]+$` is accepted. Everything else still returns `''`. Comment updated.

## Verification

- `npx vitest run tests/stats-conversion-tab.test.tsx tests/stats-customers-tab.test.tsx tests/stats-page.test.tsx tests/BookingsTable.test.tsx tests/admin-stats-routes.test.ts tests/admin-stats-period.test.ts`: 168 passed (6 files).
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (nav-auth, i18n-translate-dnt, passenger-actions); nothing in changed files.
- `npx eslint --quiet` on all changed source and test files: clean.
- Price invariant: no `€` in `components/admin/stats/`, `BookingsTable.tsx` or the stats page.
- Verify skill (default mode, steps 1-5): Types OK, Lint OK, Tests OK (related tests found by basename grep: the two tab tests and BookingsTable.test.tsx, plus the stats page/route/period tests), Invariants OK (no prices, no secrets, no middleware/messages change), i18n n/a (no `messages/*` change). Browser check skipped: the executor does not start a dev server; the orchestrator verifies visually. Build step (pre-pr only) not run.
- Not run here: the wider phase-gate list from the plan (migration/backfill/isolation-guard tests and the full suite); left to the orchestrator.

## Deviations from Plan

None - plan executed as written. One test-only correction: the plan-page test initially used `getByText('33.3% (1 of 3)')`, which matched both the source row and the total row (identical numbers); changed to `getAllByText`. The 255-character rejected email in the BookingsTable test is built as `a@` + 249 `b` + `.com` so that only the length cap rejects it.

## Tracer gate

Tracer verified end-to-end before expanding: page test (URL `?tab=conversion` -> shell -> conversion fetch -> funnel with counts) green, tsc and eslint clean on the stats files.

## Known Stubs

None.

## Threat Flags

None. T-85-20 (strict reference-or-email allowlist, 254 cap, hostile-value tests), T-85-21 (names and emails as React text, href via `encodeURIComponent`, a test confirms an `<img onerror>` name stays text) and T-85-22 (counts beside every percentage, `n/a` for zero denominators) are implemented as planned.

## Next

Phase 85 plan work is complete. Remaining before the phase is closed: orchestrator-side phase gate (full suite, verify skill pre-pr, browser check of `/admin/stats` all four tabs and a top-customer link) and the pending 85-04 owner channel backfill.
