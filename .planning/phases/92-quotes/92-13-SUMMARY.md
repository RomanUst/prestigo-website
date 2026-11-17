---
phase: 92-quotes
plan: 13
subsystem: api
tags: [quotes, lifecycle, admin-api, email, i18n, stripe, secret-link]
requires: [92-02, 92-04, 92-08, 92-29]
provides:
  - "lib/quotes/lifecycle.ts: sendQuote, mintQuoteLink, reviseQuote, voidQuote, cancelLiveDepositIntent"
  - "lib/payments/emails/render.ts exports: joinLocaleSentences, shellStyle, ShellStyle, boxHtml, contactLine, html, text, makeTranslator, Translator (output unchanged)"
  - "lib/quotes/emails/shell.ts: quoteEmailTranslator, renderQuoteEmailShell, sendQuoteEmail"
  - "lib/quotes/emails/sent.ts: renderQuoteSentEmail"
  - "routes POST /api/admin/quotes/[id]/send, /link, /revise, /void"
affects: [92-20, 92-21, 92-22, 92-23, 92-24, 92-25]
key-files:
  created:
    - lib/quotes/lifecycle.ts
    - lib/quotes/emails/shell.ts
    - lib/quotes/emails/sent.ts
    - "app/api/admin/quotes/[id]/send/route.ts"
    - "app/api/admin/quotes/[id]/link/route.ts"
    - "app/api/admin/quotes/[id]/revise/route.ts"
    - "app/api/admin/quotes/[id]/void/route.ts"
    - tests/admin-quotes-lifecycle.test.ts
    - tests/quote-emails.test.ts
  modified:
    - lib/payments/emails/render.ts
    - lib/quotes/admin-http.ts
key-decisions:
  - "Revise and void share one deposit guard: cancelLiveDepositIntent reads quotes.deposit_payment_intent_id; processing/succeeded blocks (409), requires_* is cancelled with stripeKeys.quoteDepositVoid, a cancel that fails because the client paid meanwhile is re-read and still answers in_flight"
  - "Send is two compare-and-sets: line money then freeze (frozen_at IS NULL), then status draft -> sent; the status change decides the single winner, so two concurrent sends give one 200, one 409 and one email"
  - "A version created by a revise that loses its race is discarded only by the call that created it; a reused leftover n+1 is never deleted by a loser"
status: complete
commits: 3
plan_head_before: 8d56e16b7ddfbc3b68021eecaa9cfacb39cb1853
plan_head_after: 4b16e8edb38fb1fdc856fd3d24856299ea111ad7
estimate:
  tokens: 68000
  raw_tokens: 68000
  tasks: 3
  confidence: low
actuals:
  tokens: 62000
  tasks: 3
  commits: 3
completed: 2026-11-14
---

# Phase 92 Plan 13: Quote lifecycle API and quote email Summary

The operator can send a quote (freeze, hash-only secret link, email in the client's language), copy a fresh link, revise a sent quote into a new version (old links die) and void it, with a live deposit PaymentIntent cancelled first or the action refused with 409 `deposit_in_flight`.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | aa791b24 | send a quote - freeze, secret link, localized email |
| 2 | 25a2f929 | copy a fresh quote link; pin the refusals of send |
| 3 | 4b16e8ed | revise into a new version and void, deposit-in-flight guard |

## What was built

- **sendQuote**: validates (D-02 expiry, D-05 first pickup, server distance on transfers, D-07 money floors via `validateVersionMoney`), resolves the cancellation snapshot with `resolveQuotePolicy` (D-03/D-06/D-11/D-13), writes per-line shares, remainders, eur and czk amounts, freezes the version (`terms_version = QUOTE_CONSENT_VERSION`), sets `sent` by compare-and-set, mints a link (only the SHA-256 is inserted) and emails it (idempotency key `quote-sent:<link id>`). A failed send is `emailed: false` plus an `email_failed` event; the link still works. `resend: true` on sent/viewed/accepted/paid mints one more link (earlier ones keep working).
- **render.ts exports (W1)**: the quote shell uses `joinLocaleSentences`, `shellStyle`, `boxHtml`, `contactLine`, `html`, `text`, `makeTranslator`, `loadMessages` from `lib/payments/emails/render.ts`; `shell.ts` holds no locale rule (grep for `text-transform|zh-hant` outside comments = 0). The internal `joinSentences` delegates to `joinLocaleSentences`; the diff to render.ts is `export` keywords plus that delegation, and the payment email tests pass unchanged.
- **Quote email**: navy shell, one total and the deposit, optional last day (Prague date), button with the link, PDF sentence (`pdfLink` until 92-20 attaches the PDF), escaped user values, single-line subject. Copy comes from `QuoteEmails` (92-29); no catalog edited.
- **Routes**: guard order `enforceMaxBody -> getAdminUser -> uuid -> JSON -> strict schema`; caps 2000 (send) and 1000 (link, revise, void); empty body is `{}`; never cached; logs carry ids only.

## Verification

- `npx vitest run tests/admin-quotes-lifecycle.test.ts tests/quote-emails.test.ts tests/quote-resolve.test.ts tests/payments-emails.test.ts tests/payments-copy-i18n.test.ts tests/admin-quotes-route.test.ts`: 6 files, 675 tests passed (lifecycle 65, emails 35). Also `quote-copy-i18n` green.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`.
- `npx eslint --quiet` on all touched source and test files: clean.
- Mutation checks: dropping the `status = 'draft'` compare-and-set fails the concurrent-send test; disabling the processing/succeeded guard fails 3 deposit tests.
- All acceptance greps of the plan hold (hashQuoteToken 2, escapeHtml in sent/shell, render import in shell 1, four exports in render.ts, locale rules in shell.ts 0, `@/i18n/locales` in the email test, deposit_in_flight 6, mintQuoteLink in the link route 2). Tests named D-05, D-02 and QUOTE-06 exist and pass.

## Deviations from Plan

**1. [Rule 3 - Blocking] `readOptionalCappedJson` added to `lib/quotes/admin-http.ts`** (not in the plan's file list). Link, revise and void take no input, so a body-less POST must be `{}`; the existing `readCappedJson` answers 400 for an empty body. Additive, nothing else changed.

**2. `renderQuoteEmailShell` takes `tr` (the object of `quoteEmailTranslator`) instead of `locale`.** The shell needs the catalog for the contact block and the tagline, so it receives the translators the caller already loaded; it stays synchronous. It also takes optional `reference` (box label) and `footnotes`. `quoteEmailTranslator` is async and returns `{ locale, t, pay }` (`t` = QuoteEmails, `pay` = PaymentEmails for the shared tagline, assistance label and localized "or").

**3. 422 body of send** is `{ error: 'action_not_allowed', code, reason }` where `code` is the refusal (`not_sendable`, `first_pickup_passed`, `expired`, `money_invalid`, `distance_missing`) and `reason` is the money rule for `money_invalid` (for example `deposit_below_minimum`) or the code itself otherwise. Plan 92-25 can read either field.

**4. Extra exports of render.ts** beyond the four required: `html`, `text`, `makeTranslator`, `Translator` (the plan allowed them if the shell needs them).

**5. Draft money check reasons** `deposit_missing`, `remainder_method_missing`, `terms_invalid` (out-of-range stored custom terms) and `no_lines` were added under `money_invalid`.

TDD note: the tests were written alongside the code in one pass per task; no separate RED run was captured (modules did not exist). Mutation checks above stand in for it.

## Known Stubs

None. `emailQuoteLink` passes `pdfAttached: false` on purpose until plan 92-20 attaches the PDF (marked with a comment at the call site).

## Threat Flags

None beyond the plan's register: T-92-41 (hash only, log spy test), T-92-42 (deposit guard), T-92-43 (single-line subject, escaped HTML), T-92-44 (422 before freezing) are covered by tests.

## Notes for the orchestrator

- Tests that mock `next-intl` server modules were not involved; no test failed to load through the symlinked `node_modules`.
- Revise leaves `accepted_version_id` / `accepted_at` / `deposit_payment_intent_id` on the quote (audit); plan 92-16's accept flow already creates a new intent when the stored one is cancelled.

## Self-Check: PASSED

- Files exist: lifecycle.ts, shell.ts, sent.ts, four routes, two tests, modified render.ts and admin-http.ts.
- Commits aa791b24, 25a2f929, 4b16e8ed are on the branch.
