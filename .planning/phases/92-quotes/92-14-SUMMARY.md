---
phase: 92-quotes
plan: 14
subsystem: admin-ui
tags: [quotes, admin-ui, sidebar, void, tdd]
requires: [92-08]
provides:
  - "Quotes entry in AdminSidebar (/admin/quotes)"
  - "app/(internal)/admin/(dashboard)/quotes/page.tsx: quote list with status filter, search and the New quote form"
  - "components/admin/quotes: QuotesTable, QuoteStatusBadge (eight states), QuoteVoidDialog"
affects: [92-15, 92-26]
key-files:
  created:
    - "app/(internal)/admin/(dashboard)/quotes/page.tsx"
    - components/admin/quotes/QuotesTable.tsx
    - components/admin/quotes/QuoteStatusBadge.tsx
    - components/admin/quotes/QuoteVoidDialog.tsx
    - tests/admin-quotes-list.test.tsx
  modified:
    - components/admin/AdminSidebar.tsx
    - tests/AdminSidebar.test.tsx
key-decisions:
  - "Quotes sits directly after Bookings in the sidebar; the 11-item order test became 12 items"
  - "The state badge uses eight different status families (draft neutral, sent info, viewed violet, accepted teal, paid ok, expired warn, voided danger, cancelled amber), pinned by a test"
  - "Cancel quote is a button on draft / sent / viewed / accepted / expired rows, a link to the quote page on paid rows, and absent on voided / cancelled rows"
  - "The lead channel has no default (the operator must choose, like the manual booking form); currency defaults to EUR; an empty phone is omitted from the body"
  - "The void request body is {} (the 92-13 route reads at most 1 000 bytes); the dialog treats any other 409 as busy and any other 422 as refused"
status: complete
completed: 2026-11-14
estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low
actuals:
  tokens: 12700
  tasks: 3
  commits: 3
plan_head_before: 8d56e16b7ddfbc3b68021eecaa9cfacb39cb1853
plan_head_after: da17526369beeff084dbf455e5e5bb85504dd3e4
commits: 3
---

# Phase 92 Plan 14: Admin quote list, New quote and Cancel quote Summary

The operator finds Quotes in the admin sidebar, sees every quote with reference, client, first trip date, total, version and a clear state badge, starts a new draft from a form, and cancels any unpaid quote in two clicks.

## What was built

- **Task 1 (tracer), 08c5449f** - `Quotes` nav item (lucide `FileText`) after Bookings, the quotes page (`'use client'`, promo-codes layout, fetch in an effect with a cancel flag, status select and a debounced search that refetch with `?status=` / `?search=`), `QuotesTable` (row click and reference link open `/admin/quotes/<id>`, totals through `money()` from the API's minor units) and `QuoteStatusBadge` (`BadgeShell`, a Record over the eight effective states, unknown value falls back to neutral).
- **Task 2, 0bccdc30** - New quote form above the list: first name, last name, email, phone, lead channel (whatsapp, phone, email, partner, other), currency (EUR, CZK). Posts to `/api/admin/quotes`, then `router.push('/admin/quotes/<id>')`. Client-side checks only save a round trip; 400 shows the server's field names, 422/network a plain "could not create" line, the input is kept, an in-flight ref and a disabled button give one request.
- **Task 3, da175263** - `QuoteVoidDialog` follows the ExtraChargeModal rules (states "The client's link stops working. Nothing is charged." first, request only from the primary "Cancel quote" button, in-flight ref, no dismiss while running, clean on reopen). 200 turns the row's badge to Voided without a refetch; 409 `deposit_in_flight` and 422 `already_paid` show the planned sentences (already_paid and 404 also refetch the list).

## Mount proof

- Page: `app/(internal)/admin/(dashboard)/quotes/page.tsx` renders `QuotesTable`, which renders `QuoteStatusBadge` and `QuoteVoidDialog`.
- The `(dashboard)` layout (admin gate unchanged) mounts `AdminSidebar`. `tests/admin-quotes-list.test.tsx` calls the REAL `AdminDashboardLayout` (only `createClient` and the sign-out action mocked), renders it with the real quotes page as child, and asserts the Quotes link `href="/admin/quotes"` with `aria-current="page"` and the quotes table in the same tree; it also checks the redirects for a signed-out visitor and a non-admin.
- `tests/AdminSidebar.test.tsx`: Quotes link directly after Bookings; the full-order test is now 12 items.

## Verification

- `npx vitest run tests/admin-quotes-list.test.tsx tests/AdminSidebar.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 3 files, 102 tests passed. `tests/erasure-page.test.tsx` (also reads the sidebar) passes.
- `npx tsc --noEmit`: 8 errors, the old baseline ones in `tests/` only; none in the touched files.
- `npx eslint --quiet` on all source and test files touched: clean.
- Acceptance greps: `/admin/quotes` in AdminSidebar 1x, `AdminSidebar` in the layout 2x, `QuotesTable` in the page 3x, `QuoteVoidDialog` in QuotesTable 4x.
- No new test failed to LOAD through the symlinked `node_modules`.

## Deviations from Plan

None - plan executed as written. Choices beyond the text: the void POST sends `{}` as JSON; the page keeps the `total > shown` note (the list asks for 50 rows); the NewQuoteForm is a non-exported component inside the page file (Next page files may not export extra names).

TDD note: tests were written before each task's implementation; RED runs were not captured separately (missing modules fail the import by construction).

## Known Stubs

None. The `/admin/quotes/<id>` page the rows and the New quote form open belongs to plan 92-15 (builder); until it lands those navigations 404.

## Threat Flags

None. T-92-45 (double-submitted void) mitigated: in-flight ref plus a test that a double click sends one request; T-92-46 and T-92-SC accepted as planned (no package installed, nothing logged by the components).

## Notes for the orchestrator

- The void route (`POST /api/admin/quotes/[id]/void`) is plan 92-13; here it is a fetch mock. Contract used: 200, 409 `{ error: 'deposit_in_flight' }`, 422 `{ reason: 'already_paid' }`.
- A paid row's "Cancel quote" link needs the quote page of 92-15 / the refund flow of 92-26.

## Self-Check: PASSED

- Files exist: page.tsx, QuotesTable.tsx, QuoteStatusBadge.tsx, QuoteVoidDialog.tsx, admin-quotes-list.test.tsx; modified AdminSidebar.tsx and AdminSidebar.test.tsx.
- Commits exist: 08c5449f, 0bccdc30, da175263.
