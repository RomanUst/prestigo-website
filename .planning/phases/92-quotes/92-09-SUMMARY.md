---
phase: 92-quotes
plan: 09
subsystem: public-quote-page
tags: [quotes, secret-link, next-intl, security, viewed-ping]
requires: ["92-01", "92-02", "92-03", "92-04"]
provides:
  - "lib/quotes/resolve.ts: ResolvedQuote, resolveQuoteToken (read-only, one null for every failure), markQuoteViewed"
  - "lib/quotes/view.ts: QuoteView, buildQuoteView (allow-list, one price per trip)"
  - "/[locale]/quote/[token] page, InvalidQuoteLinkView, QuoteViewedPing"
  - "POST /api/quote/view"
affects: [92-10, 92-17, 92-27]
tech-stack:
  added: []
  patterns:
    - "token -> hash -> link -> current version, validity only through quoteLinkState"
    - "one invalid view that takes the locale and nothing else"
    - "viewed is a separate POST from a client island; the GET writes nothing"
key-files:
  created:
    - lib/quotes/resolve.ts
    - lib/quotes/view.ts
    - "app/[locale]/quote/[token]/page.tsx"
    - "app/[locale]/quote/[token]/InvalidQuoteLinkView.tsx"
    - "app/[locale]/quote/[token]/QuoteViewedPing.tsx"
    - app/api/quote/view/route.ts
    - tests/quote-resolve.test.ts
    - tests/quote-page.test.tsx
    - tests/quote-view-route.test.ts
    - tests/helpers/quote-public-fixture.ts
  modified: []
key-decisions:
  - "The page reuses ManageHeader and the manage contact mailbox constant instead of copying them; the wordmark aria-label is the brand name, not translated copy"
  - "Catalog placeholders in the Quote namespace are plain, so dates, times and references are isolated with Unicode isolates (text form of bdi dir=ltr); amounts, prices and the summary rows stay in real bdi dir=ltr elements"
  - "A failed viewed write still answers 200 (informational, never gates money) and logs a fixed line without token, hash or id"
  - "A paid quote stays readable after its first pickup and after expiry (quoteLinkState from 92-02), and then also lists its booking references"
requirements-completed: [QUOTE-02, QUOTE-06]
status: complete
commits: 3
plan_head_before: 425e4799c21dd6e7e394e46451db00271fc1aa55
plan_head_after: 4d5fd9e26060c441fb513e4f7bd607a1bac2a103
actuals:
  tokens: 19300
  tasks: 3
  commits: 3
estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low
completed: 2026-11-14
---

# Phase 92 Plan 09: Public quote page Summary

A client opens `/<locale>/quote/<token>` and reads the itemised current version of the quote in the quote's language: every trip with date, Prague time, route, stops with waiting minutes, vehicle, passengers and one price, then total, deposit, remainder, the remainder sentence of the chosen method and the cancellation terms. Any dead link shows one identical "no longer available" view. The GET writes nothing; "viewed" is a separate POST.

## What was built

- **Task 1 (tracer)** `resolveQuoteToken(token, nowMs)`: regex first (no database call for a malformed token), SHA-256 hash lookup in `quote_links`, quote, the link's version (must be frozen and belong to the quote), lines and stops by position, validity only through `quoteLinkState`; paid quotes also load their bookings. Every failure (including a database error) is the same `null`, and logs a fixed line without token, hash or database message. `markQuoteViewed` is the compare-and-set `sent -> viewed` (also pinned to the current version) plus one `viewed` event keyed `viewed:<version id>`. `buildQuoteView` is an allow-list: first name only, per-trip `totalMinor` only (stop fees are not in the view), remainder = total - deposit, terms from the stored snapshot (`freeUntilMs` = first pickup minus stored free hours).
- **Task 2** the page (`force-dynamic`, `params.locale` + `setRequestLocale`, `/quote` rate limit by client IP from `headers()`, resolver before any read, redirect to the quote's prefix on a locale mismatch, metadata noindex/nofollow + no-referrer), `InvalidQuoteLinkView` (locale only), `QuoteViewedPing` (client island, one POST `{ token }` once the tab is visible, answer ignored, renders a hidden span `quote-viewed-ping`).
- **Task 3** `POST /api/quote/view`: 2 KB cap, rate limit `/api/quote/view`, JSON, strict `{ token }` schema with the token regex, uniform `404 { error: 'invalid_link' }`, `markQuoteViewed`, every answer `Cache-Control: no-store`.

## Verification

- `npx vitest run` (with the local workaround below) on `tests/quote-resolve.test.ts tests/quote-page.test.tsx tests/quote-view-route.test.ts tests/quote-copy-i18n.test.ts` plus `tests/manage-page.test.tsx tests/private-link-paths.test.tsx tests/next-config-headers.test.ts tests/quote-events.test.ts`: 8 files, 318 tests passed. `tests/quote-resolve.test.ts` (27) and `tests/quote-view-route.test.ts` (20) also pass with the repo's own `vitest.config.ts`.
- `npx tsc --noEmit`: 8 errors, all the old baseline in `tests/` (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1); none in touched files.
- `npx eslint --quiet` on all six source files and the three test files plus the fixture: clean.
- Plan acceptance greps: `QUOTE_TOKEN_RE` in resolve.ts 2; `client_email|client_phone|billing_` in view.ts 0; `force-dynamic` 1; `setRequestLocale` 3; `QuoteViewedPing` 3; `getLocale(` 0; `checkRateLimit('/api/quote/view'` 1; `no-store` 2.
- Mount proof: `tests/quote-page.test.tsx` renders the REAL page and finds `data-testid="quote-viewed-ping"`, then checks the mounted island posts the token once to `/api/quote/view`.
- GET side effects: the page test seeds the in-memory payments DB, renders the page and asserts a write counter of 0, status still `sent`, zero events. The invalid view is byte-identical for ten reasons in all 8 locales (`locales`, `zh-hant` included) and contains no price, name, reference or address.

## Worktree artefact (orchestrator action)

`tests/quote-page.test.tsx` mocks `next-intl/server` with its react-server build and therefore fails to LOAD in this worktree through the symlinked `node_modules` ("Cannot find module '/@fs/Users/romanustyugov/Desktop/Prestigo/node_modules/next-intl/dist/esm/development/server.react-server.js'"). The existing `tests/manage-page.test.tsx` fails the same way here. To validate, I ran the same files with a throwaway, uncommitted config (`vitest.tmp.config.ts` merging the repo config with `server.fs.strict: false`): 36/36 page tests pass and `manage-page` 72/72. **Re-run `npx vitest run tests/quote-page.test.tsx` in the main checkout.** The tests were not weakened.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] next-intl `t.rich` does not accept elements as values (TS2322)**
- **Found during:** Task 2 (tsc)
- **Issue:** the first version wrapped values in `<bdi>` elements and passed them to `t.rich`; next-intl types allow only primitives and tag functions, and the Quote catalog has no tags.
- **Fix:** values go through `t()` with plain placeholders; dates, times and references are wrapped in Unicode isolates (U+2066 ... U+2069), prices and summary amounts stay in real `<bdi dir="ltr">`.
- **Commit:** 031625bb

### Plan choices worth knowing

- Added `tests/helpers/quote-public-fixture.ts` (seeds a quote with a frozen version, lines, stops and a hashed link into the fake payments DB, and a write-counting client). Later wave-2 plans may reuse it; it is not in the plan's `files_modified`.
- The hourly line shows its duration under the pickup time (the catalog has only `lines.duration` = "{hours} h"); luggage is shown only when above 0; waiting minutes only when above 0.
- `terms.lateAll` / `terms.latePercent` is shown also when the free window has passed (after `terms.noFree`), so the client always sees what is kept.
- When a paid quote is shown, the booking references come from `bookings.quote_id`; no accept area, PDF button or remainder area exists yet (92-17, 92-27).
- TDD: tests were written before each implementation; the RED runs were not captured separately (missing modules fail the import by construction).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-92-29 (zero writes on GET, tested), T-92-30 (one invalid view and one 404 body, tested), T-92-31 (view allow-list, tested for absent fields), T-92-32 (console spy tests for token and hash) are mitigated; T-92-SC accepted, no package installed.

## Notes for later plans

- The page does not yet render the accept, PDF or remainder areas; 92-17 and 92-27 add them next to the `quote-summary` and `quote-terms` blocks. The viewed ping, rate limit, redirect and invalid view are already in place.
- `markQuoteViewed` needs `quote_events.kind = 'viewed'` and the `quotes` update path of migration 091 (applied live in 92-12). Until then the SQL has no live proof; the compare-and-set and the event key are proven against the fake DB.
- `vitest.tmp.config.ts` exists only in this worktree, untracked; do not merge it.

## Self-Check: PASSED

- Files exist: lib/quotes/resolve.ts, lib/quotes/view.ts, app/[locale]/quote/[token]/{page,InvalidQuoteLinkView,QuoteViewedPing}.tsx, app/api/quote/view/route.ts, tests/quote-resolve.test.ts, tests/quote-page.test.tsx, tests/quote-view-route.test.ts, tests/helpers/quote-public-fixture.ts.
- Commits exist: 1483dac1, 031625bb, 4d5fd9e2.
