---
phase: 92-quotes
plan: 20
subsystem: quotes-pdf
status: complete
tags: [pdf, quote-document, email-attachment, i18n, d-14]
requirements: [QUOTE-07]
requires: [92-07, 92-32, 92-13, 92-03, 92-29]
provides: [renderQuoteDocumentHtml, QUOTE_OPERATOR_LEGAL, getOrRenderQuotePdf, quotePdfFilename]
affects: [92-27]
tech-stack:
  added: []
  patterns:
    - "render once per frozen version, store bytes + sha256 in quote_documents, always return the read-back row"
    - "insert on conflict do nothing (23505 = another caller won) then read back"
    - "localized dates in <bdi dir=auto>, references/amounts in <bdi dir=ltr>"
key-files:
  created:
    - lib/quotes/document.ts
    - lib/quotes/documents.ts
    - tests/quote-document.test.ts
  modified:
    - lib/quotes/lifecycle.ts
    - lib/quotes/emails/sent.ts
    - app/api/admin/quotes/[id]/send/route.ts
    - tests/admin-quotes-lifecycle.test.ts
    - tests/quote-emails.test.ts
decisions:
  - "D-14 applied as attachment (production decision of 92-32); link fallback kept for a null render"
  - "The PDF document shows the remainder amount row like the quote page (total, deposit, remainder), never a waiting amount"
  - "Free-window sentence is evaluated at the version's frozen_at (the document as issued), not at render time"
  - "Send route maxDuration = 60 s so a cold Chromium render (budget 20 s) fits the first send"
completed: 2026-11-16
commits: 3
plan_head_before: 3dd60cc117da69cb9b48b255b25c476c6b1a1191
plan_head_after: 17e33190aef81125f3c7955918ab020d316d658e
actuals:
  tokens: 14300
  tasks: 3
  commits: 3
---

# Phase 92 Plan 20: quote document, stored PDF, email attachment Summary

The quote is now one self-contained HTML document in the quote's language (A4, navy/champagne, embedded fonts, rtl for Arabic), rendered once per frozen version into a PDF stored with its sha256 in `quote_documents`. The quote email attaches it as `Prestigo-quote-<reference>-v<n>.pdf`. When the host cannot render, the email says the PDF can be downloaded on the quote page.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 (tracer) | `3440d759` | `getOrRenderQuotePdf` (store, read back, null on failure), `sendQuote` attaches the PDF and sets `pdfAttached`, `quotePdfFilename`, document header, send route `maxDuration = 60` |
| 2 | `2f8b457f` | Full document: trips with one price each, stop waiting minutes only, summary, remainder sentence, D-03 terms from the frozen snapshot, contact line, operator legal line (`QUOTE_OPERATOR_LEGAL`) |
| 3 | `17e33190` | Store tests: concurrent calls, sha256/byte_size integrity, unreadable bytea, DB errors, engine throws |

## What was built

- `lib/quotes/document.ts`: `renderQuoteDocumentHtml({ quote, version, lines })`. Uses the existing `Quote.*` and `Booking.vehicleClasses` catalog keys through `makeTranslator` (throws on a missing message, so a catalog gap fails the render and the email falls back to the link). The client sees only the first name: no last name, email, phone, flight number or special requests. Every value goes through `escapeHtml` or `html()` from render.ts. There is no script, link, img or URL. The only `url()` values are the `data:` fonts. `<html lang="<locale>" dir="rtl|ltr">`. zh/zh-hant sentences are joined with `joinLocaleSentences`. The operator sentence drops the duplicated period after "s.r.o.".
- `lib/quotes/documents.ts`: `getOrRenderQuotePdf(versionId)`.
  - A stored row whose sha256 and byte_size match is returned as is. A row that does not match, or holds bytea it cannot read, is deleted (only that exact row) and rendered again.
  - Unfrozen or unknown versions return null, and the engine is never called.
  - bytea is written as `'\x' + hex` and decoded from the hex string supabase-js returns.
  - On insert, `23505` means another caller stored first. Every caller returns the bytes it reads back, never its own render.
  - Any error returns null, logging only `{ versionId, code }` and never the database message.
- `lib/quotes/lifecycle.ts`: `emailQuoteLink` calls `getOrRenderQuotePdf(version.id)` before rendering the email. It sets `pdfAttached` and passes `attachments: [{ filename, content }]` only when there is a PDF. A resend reuses the stored row, so the engine runs once per version.

## Verification

- `npx vitest run tests/quote-document.test.ts tests/admin-quotes-lifecycle.test.ts tests/quote-emails.test.ts tests/quote-convert.test.ts tests/quote-pdf.test.ts`: 203/203 passed in the worktree. The next-intl-mock artefact did not appear: these files do not mock next-intl server modules.
- `npx tsc --noEmit`: 8 errors, all baseline (tests/nav-auth, i18n-translate-dnt, passenger-actions).
- `npx eslint --quiet` on all changed files: clean.
- Acceptance greps: `getOrRenderQuotePdf` in lifecycle.ts 3; `Prestigo-quote-` in lifecycle+sent 3; `fontFaceCss` in document.ts 2; `escapeHtml` in document.ts 3; `@/i18n/locales` in the test 1; `sha256` in documents.ts 11.
- Real render check with local Chrome (`QUOTE_PDF_CHROME_PATH`, a temporary test that was not committed): en, ar and zh-hant PDFs were rendered to the scratchpad and inspected. In en, both trips, the summary, terms and footer are on 2 A4 pages. In ar, the text is right-to-left and joined, with Arabic dates in the correct order (after the dir=auto fix). In zh-hant, Traditional glyphs come from Noto Sans TC.
- Mutation check of the Task 3 tests: when the code returns the local render instead of the read-back row, 4 tests fail. When the integrity check is disabled, 1 test fails.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `maxDuration = 60` on `POST /api/admin/quotes/[id]/send`**
- **Found during:** Task 1
- **Issue:** The first send now renders the PDF inside the request. On production, a cold chromium-min start took about 5.7 s, and the render budget is 20 s. The route had no `maxDuration`, unlike `pdf-check`, which uses 300.
- **Fix:** `export const maxDuration = 60`.
- **Files:** `app/api/admin/quotes/[id]/send/route.ts` (not in `files_modified`)
- **Commit:** `3440d759`

**2. [Rule 1 - Bug] Arabic dates reversed and zh sentences spaced (found in the local PDF render)**
- **Found during:** Task 2
- **Issue:** Long localized dates inside `<bdi dir="ltr">` displayed as "مايو 2090 10" in ar. The two zh sentences were joined with a space.
- **Fix:** Localized dates now use `<bdi dir="auto">` (the AUTO_DIR rule of render.ts). The note sentences are joined with `joinLocaleSentences`. Both are covered by tests.
- **Commit:** `2f8b457f`

### Process notes
- **Plan commit ledger:** the worktree guard blocked writing `gsd-plan-head-before-92-20` into the git dir, the same as in 92-07. `plan_head_before` was taken from HEAD before the first commit, and `commits: 3` was measured with `git rev-list --count 3dd60cc1..HEAD`.
- **TDD order:** in Task 1 the tests were run RED first (missing module, missing `quotePdfFilename`). In Task 2 the test file was written before the body code, but there was no separate RED run. In Task 3 the race and integrity code had already been written in Task 1 (documents.ts was created complete), so the Task 3 tests passed on their first run. The mutation check above shows they guard the behaviour. Task 3 therefore has a `test(...)` commit and no change to documents.ts.
- No new catalog keys were added: every string comes from the existing `Quote.*` keys (92-03/92-29), so there was no i18n work.

## Known Stubs

None.

## Threat Flags

None. The new surface (the stored PDF table read) is the deny-all `quote_documents` table of 091 through the service client only. T-92-64 (escaping, no remote resources) and T-92-65 (per frozen version, sha256-verified, unfrozen never rendered) are mitigated and tested. T-92-66 is unchanged (deny-all and erasure from 92-01/92-12).

## For the orchestrator

- The stored PDF for the 92-27 download: call `getOrRenderQuotePdf(versionId)`. The route `/api/quote/pdf` is already in `outputFileTracingIncludes` (next.config.ts).
- The first live send after merge stores the first real `quote_documents` row. You can check it with `select version_id, locale, byte_size, length(pdf) from quote_documents` (byte_size should equal length).

## Self-Check: PASSED

- FOUND: lib/quotes/document.ts, lib/quotes/documents.ts, tests/quote-document.test.ts
- FOUND commits: 3440d759, 2f8b457f, 17e33190
