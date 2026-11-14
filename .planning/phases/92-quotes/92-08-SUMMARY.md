---
phase: 92-quotes
plan: 08
subsystem: api
tags: [quotes, admin-api, pricing, zod, tdd]
requires: [92-01, 92-02]
provides:
  - "lib/quotes/pricing.ts: suggestLinePrice, priceLineStops, waitingRateFor"
  - "lib/quotes/store.ts: listQuotes, getQuoteDetail, createQuoteDraft, saveQuoteDraft, QuoteListRow, escapeLike, endOfPragueDayIso"
  - "lib/quotes/schemas.ts: strict zod schemas of the admin quote API (line, create, draft, price)"
  - "routes: GET/POST /api/admin/quotes, GET/PATCH /api/admin/quotes/[id], POST /api/admin/quotes/price"
affects: [92-09, 92-10, 92-14, 92-15]
key-files:
  created:
    - lib/quotes/pricing.ts
    - lib/quotes/store.ts
    - lib/quotes/schemas.ts
    - lib/quotes/admin-http.ts
    - app/api/admin/quotes/route.ts
    - "app/api/admin/quotes/[id]/route.ts"
    - app/api/admin/quotes/price/route.ts
    - tests/admin-quotes-route.test.ts
    - tests/quotes-pricing.test.ts
  modified:
    - tests/helpers/fake-payments-db.ts
key-decisions:
  - "Lines are replaced as a whole on PATCH; unchanged lines (same price inputs at the same position) keep the stored distance, suggestion and stop snapshot, so a re-save costs no routing call"
  - "A write that fails half-way is rolled back by undo steps (stored lines, stops, version and header put back); a failure logs ids and codes only"
  - "A zero deposit is a 422 deposit_zero (schema accepts 0 on purpose, D-07); an empty line list is 422 invalid_lines/no_lines"
  - "Changing the currency without re-sending the lines is 422 invalid_lines/currency_needs_lines"
  - "List filters on the EFFECTIVE status in memory after a bounded read (5000 quotes) because expired is derived; search is ilike with escaped wildcards (no or())"
status: complete
completed: 2026-11-14
estimate:
  tokens: 75000
  raw_tokens: 75000
  tasks: 3
  confidence: low
actuals:
  tokens: 95000
  tasks: 3
  commits: 3
plan_head_before: 425e4799c21dd6e7e394e46451db00271fc1aa55
plan_head_after: f523e912c7765196f3be4427d601ffac00bcb0d4
commits: 3
---

# Phase 92 Plan 08: Operator data path for a quote Summary

The operator can create a draft quote, save up to 20 priced lines (server distance through all stops and a live-tariff suggestion per line, the operator's amount stored as the price), read one quote with versions, events and bookings, list quotes by effective status, and ask for a line suggestion before saving.

## What was built

- **Task 1 (tracer), 6081e13e** - `suggestLinePrice` (distance only from `computeRouteDistance` through origin, all stops and destination; airport from coordinates; per-class waiting with 15 free minutes per stop; one total in eur or czk), the store (`createQuoteDraft` with the D-09 language lookup and one reference retry, `saveQuoteDraft`, `getQuoteDetail`, `listQuotes`), the strict schemas and POST/GET `/api/admin/quotes`, GET/PATCH `/api/admin/quotes/[id]`.
- **Task 2, 254e965d (`security:`)** - tests pinning guard order (401/403 before the body, 413, uuid 400, JSON 400, strict schema 400, 404, 422, 409), frozen version 409, voided/paid/cancelled 422, deposit zero / above total, cancel window 720, expiry end of the Prague day (winter and summer), 503 with nothing written, rollback of a failed write without PII in the log, the effective-status list and the escaped search. A mutation check (escapeLike made the identity) fails the T-92-27 test.
- **Task 3, f523e912** - POST `/api/admin/quotes/price` (cap 4 000, no-store, writes nothing).

## Verification

- `npx vitest run tests/admin-quotes-route.test.ts tests/quotes-pricing.test.ts`: 2 files, 54 tests passed.
- All 40 test files that import the fake payments DB (helper extended with `ilike`): 2024 tests passed.
- `npx tsc --noEmit`: 8 errors, the old baseline ones in `tests/` only.
- `npx eslint --quiet` on all touched source and test files: clean.
- Acceptance greps: `computeRouteDistance` in pricing.ts, `getAdminUser` 3x in `[id]/route.ts`, `version_frozen` 6x and `.or(` 0x in store.ts, `suggestLinePrice` in the price route, a test named "D-04" passes.

## Deviations from Plan

### Auto-fixed / additions

**1. [Rule 3 - Blocking] Extra files beyond the plan's list**
- `lib/quotes/schemas.ts` (the line schema is shared by PATCH and price, so it needs one home; also holds the create and draft schemas) and `lib/quotes/admin-http.ts` (no-store headers, 401/403 answers, capped JSON read shared by the three routes). `getAdminUser` stays in each route.

**2. [Rule 3 - Blocking] Fake DB gained `ilike`**
- `tests/helpers/fake-payments-db.ts` (owned by 92-01) had no `ilike`; added with PostgREST semantics (case-insensitive, `%` `_` wildcards, backslash escape). Additive; the 40 files using the helper still pass.

**3. Plan choices beyond the text**
- `computeExtrasTotal` is called as the manual booking does; it currently returns 0 (extras are free), so extras do not move the suggestion today but will if the site prices them. Change detection includes the extras for that reason.
- The suggestion converts the EUR total once with `eurToCzk` (whole crowns, hundredths) for czk.
- A landing must equal landing + offset in Prague time (the checkout's PICKUP_MISMATCH rule), answered as a 400 schema error here.
- Store result codes gained `action_not_allowed` (reasons: quote_voided, quote_paid, quote_cancelled, expiry_in_past, deposit_zero, deposit_above_total) next to the four in the plan's interface.
- The draft stores `cancel_free_hours` / `cancel_fee_percent`; the `cancel_policy` snapshot is not written (that belongs to freezing the version).

TDD note: Task 1 tests were written before the store and routes, but the RED run was not captured separately (missing modules fail the import by construction); `quotes-pricing` unit tests went straight to green once `pricing.ts` existed.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-92-25..28 mitigated and tested; T-92-SC accepted, no package installed).

## Notes for the orchestrator

- The list reads at most 5 000 quotes per request and filters / pages in memory (expired is derived, so it cannot be a column filter without `or()`); fine for an operator's quote volume, revisit if it ever grows.
- Nothing here freezes, sends or voids a quote; `saveQuoteDraft` is only for the unfrozen current version.
- No test failed to LOAD through the symlinked `node_modules`.

## Self-Check: PASSED

- Files exist: the nine created files and the modified helper.
- Commits exist: 6081e13e, 254e965d, f523e912.
