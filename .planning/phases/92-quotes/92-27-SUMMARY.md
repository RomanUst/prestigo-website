---
phase: 92-quotes
plan: 27
subsystem: quotes / public quote page
status: complete
tags: [quotes, pdf, stripe, remainder, i18n, security]
requires: ["92-17", "92-20", "92-23"]
provides:
  - "POST /api/quote/pdf (token-gated download of the stored quote PDF, 503 pdf_unavailable fallback)"
  - "QuotePdfButton island (data-testid quote-pdf) with the Print fallback and a print stylesheet on the page"
  - "QuoteRemainderPay island (data-testid quote-remainder) for paid payment-link quotes"
  - "quotePdfFileName helper (lib/quotes/pdf-file-name.ts)"
affects: ["app/[locale]/quote/[token]/page.tsx"]
tech-stack:
  added: []
  patterns:
    - "token only in POST bodies; download through a blob object URL, never a URL with the token"
    - "remainder island polls by router.refresh() until the server-rendered due is 0 (state stays 'paid')"
key-files:
  created:
    - app/api/quote/pdf/route.ts
    - app/[locale]/quote/[token]/QuotePdfButton.tsx
    - app/[locale]/quote/[token]/QuoteRemainderPay.tsx
    - lib/quotes/pdf-file-name.ts
    - tests/quote-pdf-route.test.ts
    - tests/quote-remainder-pay.test.tsx
    - tests/helpers/quote-waiting-price.ts
  modified:
    - app/[locale]/quote/[token]/page.tsx
    - tests/quote-page.test.tsx
    - tests/quote-copy-i18n.test.ts
decisions:
  - "The summary row's test id moves from quote-remainder to quote-remainder-amount: the plan gives quote-remainder to the payment island, and the print stylesheet hides that id (the summary amount must still print)."
  - "The remainder due on the page is computed on the server with remainderDueMinor over resolved.lines + resolved.bookings, the same sum createRemainderIntent uses; a due below QUOTE_MIN_CHARGE_MINOR shows the amount without a pay button (the server would refuse it), and the paid sentence shows only once quotes.remainder_paid_at is set (so a quote whose trips are not created yet says nothing)."
  - "After a confirmed remainder payment the island POSTs /api/quote/state (a 404 stops the loop) and calls router.refresh() every 2 s for at most 60 s; /api/quote/state was not extended, as the plan says."
  - "Any download failure (not only 503) shows Quote.pdf.unavailable plus Print; the print stylesheet hides the accept, remainder and PDF controls and the header."
metrics:
  duration: "~20 min"
  completed: 2026-11-16
estimate:
  tokens: 65000
  tasks: 3
actuals:
  tokens: 18300
  tasks: 3
  commits: 3
plan_head_before: 4305a85fd3813aa3546c3ccdf8c5aba4af65e1bf
plan_head_after: a7b8555cf295fff32c9a62acfa0997c132f81dc7
---

# Phase 92 Plan 27: Quote PDF download and remainder payment on the quote page Summary

The quote page now has "Download PDF" (POST /api/quote/pdf with the token in the body returns the stored PDF of the version as `Prestigo-quote-<reference>-v<n>.pdf`, or 503 and a Print fallback with print styles) and, on a paid payment-link quote, "Pay the remainder" with the server-computed due through the same Stripe card flow as the deposit.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | POST /api/quote/pdf and the Download PDF button | c316676d | app/api/quote/pdf/route.ts, QuotePdfButton.tsx, page.tsx, lib/quotes/pdf-file-name.ts, tests/quote-pdf-route.test.ts, tests/quote-page.test.tsx |
| 2 | Pay the remainder on the quote page | 51a9d14b | QuoteRemainderPay.tsx, page.tsx, tests/quote-remainder-pay.test.tsx, tests/quote-page.test.tsx |
| 3 | No token or waiting-price leaks from the finished page | a7b8555c | tests/quote-page.test.tsx, tests/quote-copy-i18n.test.ts, tests/helpers/quote-waiting-price.ts |

## What was built

- **POST /api/quote/pdf**: the guard order of /api/quote/view (413 body cap, 429 `checkRateLimit('/api/quote/pdf')`, 400 JSON / strict `{ token }` schema, 404 `invalid_link` for every dead link), then `getOrRenderQuotePdf(resolved.version.id)`. 200 = `application/pdf`, `attachment; filename="Prestigo-quote-<reference>-v<n>.pdf"` (reference reduced to `[A-Za-z0-9-]`, no header injection), `Content-Length`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Null/empty PDF or a resolver throw = 503 `pdf_unavailable`. `maxDuration = 60` (a cold render). Already in `outputFileTracingIncludes`.
- **QuotePdfButton** (`'use client'`, strings from Quote.pdf.*): one request at a time, saves the blob through an object URL under the server-built name; any failure shows `Quote.pdf.unavailable` and a Print button (`window.print()`).
- **Print stylesheet** on the page: hides `quote-accept`, `quote-remainder`, `quote-pdf` and the header, prints the quote black on white.
- **QuoteRemainderPay** (mirrors QuoteAcceptPay, no consent box): Elements card only, no `setupFutureUsage` (matches the server intent); `elements.submit()` -> POST /api/quote/remainder `{ token, displayedAmountMinor }` -> `confirmPayment` with the tokenless `/<locale>/quote/done` return URL and `redirect: 'if_required'`. A different amount or currency in the answer is never confirmed. 409 `amount_changed` = changed text + page refresh; 409 `already_paying` = wait; 422 `nothing_due` = refresh + wait; anything else = generic error; card decline = declined text.
- **Page**: computes the remainder area on the server: payment_link + due >= minimum -> island; due below the Stripe minimum -> the amount only; due 0 with `remainder_paid_at` -> `remainderPay.paid`; invoice + due > 0 -> `Quote.invoice.note` with the amount; saved_card / cash -> nothing new. The only amount is the due itself (no waiting amount).
- No new message keys (Quote.pdf.*, Quote.remainderPay.*, Quote.invoice.note were already translated in all 8 catalogs).

## Verification

- `npx vitest run tests/quote-pdf-route.test.ts tests/quote-remainder-pay.test.tsx tests/quote-page.test.tsx tests/quote-copy-i18n.test.ts`: 4 files, 229 tests passed.
- All `tests/quote*.test.*` + `tests/middleware-csrf-forms.test.ts` + `tests/rate-limit.test.ts`: 34 files passed, 1 skipped, 981 tests passed.
- Full suite (`--exclude '.claude/**'`, worktree config): 462 files passed, 3 skipped, 2 failed; 15168 tests passed. The 2 failures (`tests/quote-builder.test.tsx` "a quote of 19 trips takes one more…", `tests/seo-volume-pages.test.ts` "sitemap > lists every mirror route…") touch none of this plan's files and both files pass in isolation (78/78): load timing under the parallel run, not a regression.
- `npx tsc --noEmit`: 8 errors, all baseline in tests/ (none new).
- `npx eslint --quiet` on every changed file: clean.
- Acceptance greps: `checkRateLimit('/api/quote/pdf'` = 1; `QuotePdfButton` in page.tsx = 3; `/api/quote/remainder` in QuoteRemainderPay.tsx = 1; `QuoteRemainderPay` in page.tsx = 4; `@/i18n/locales` in tests/quote-page.test.tsx = 1.
- verify skill: steps 1-5 PASS before each commit; step 6 (browser) skipped: no preview server available to an executor subagent.

### Worktree test note (for the orchestrator)

`tests/quote-page.test.tsx` (mocks `next-intl/server` with the react-server build path) fails to LOAD in an executor worktree with the stock config: the `node_modules` symlink resolves to the main checkout, outside Vite's fs allow list. It was run here with an UNCOMMITTED local config (`vitest.wt.local.mts`: the repo config plus `server.fs.allow` of the main checkout), and it passes (the counts above). Please re-run it in the main checkout with the stock config: `npx vitest run tests/quote-page.test.tsx tests/quote-copy-i18n.test.ts tests/quote-remainder-pay.test.tsx tests/quote-pdf-route.test.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test id collision `quote-remainder`**
- **Found during:** Task 1 (print stylesheet) / Task 2
- **Issue:** the summary row already used `data-testid="quote-remainder"`, which the plan assigns to the new island; the print stylesheet hiding that id would also have hidden the remainder amount of the summary.
- **Fix:** the summary row is now `quote-remainder-amount`; the existing assertion in tests/quote-page.test.tsx follows. `components/admin/quotes/QuoteSettingsFields.tsx` has its own `quote-remainder` (admin builder) and is untouched.
- **Commit:** 51a9d14b

**2. [Rule 2 - Missing critical] Remainder below the Stripe minimum and "trips not created yet"**
- **Issue:** createRemainderIntent refuses a due below QUOTE_MIN_CHARGE_MINOR, and a paid quote whose conversion has not made the trips yet has due 0 without being paid.
- **Fix:** below the minimum the page shows the amount without a pay button; the paid sentence needs `remainder_paid_at`. Both tested.
- **Commit:** 51a9d14b

**3. [Rule 3 - Blocking] Shared helpers outside `files_modified`**
- `lib/quotes/pdf-file-name.ts`: the file name is needed by the route (header) and the page (blob name); a route module may not export helpers, and importing lib/quotes/documents.ts into the page would pull the renderer into it.
- `tests/helpers/quote-waiting-price.ts`: Task 3 asks the page test to use "the waiting-amount check of tests/quote-copy-i18n.test.ts"; the patterns moved to a helper that both import (no change to the patterns).
- **Commits:** c316676d, a7b8555c

### TDD note

Task 1 RED was captured (route module missing, 5 page tests failing). For Task 2 the island test and page tests were written first, but the RED run was not executed separately before the island was created.

## Threat Flags

None beyond the plan's threat model (T-92-83/84/85 are mitigated as planned: live link only, uniform 404, no-store, POST only, token in bodies only, tokenless return URL, server-computed due with a 409 cross-check; leak tests in tests/quote-page.test.tsx and tests/quote-pdf-route.test.ts).

## Needs the orchestrator / owner

- Orchestrator: re-run the four test files above in the main checkout (worktree load artefact); update STATE / ROADMAP / REQUIREMENTS (QUOTE-07, QUOTE-04).
- Owner (optional, live): one real download on production of a sent quote (PDF bytes = the email attachment) and one payment-link remainder paid on the page in test mode; Print fallback can be checked by opening the page's print preview.
- No DB change, no migration, no new message keys, no new packages.

## Self-Check: PASSED

All 7 created files exist; commits c316676d, 51a9d14b, a7b8555c exist on the branch (3 commits since 4305a85f). The temporary `vitest.wt.local.mts` was removed and never committed.
