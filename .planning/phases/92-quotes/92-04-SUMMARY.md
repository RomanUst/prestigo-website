---
phase: 92-quotes
plan: 04
subsystem: security
tags: [headers, csrf, rate-limit, stripe, consent, quotes]
requires: []
provides:
  - quote page headers (no-referrer, no-store, noindex) for every locale incl. zh-hant
  - quote in private link paths and CSP report redaction
  - /api/quote CSRF (strict Origin) and six per-IP limits
  - card_quote_deposit / card_quote_remainder kinds, quote idempotency keys, quoteMetadata
  - QUOTE_CONSENT_VERSION quote-2026-11-1 (in EXTRAS_CONSENT_VERSIONS)
affects: [92-09, 92-16, 92-23, 92-27, 92-31]
tech-stack:
  added: []
  patterns: [locale-list-driven header tests]
key-files:
  created: [tests/quote-stripe-vocabulary.test.ts]
  modified:
    - next.config.ts
    - lib/private-link-path.ts
    - lib/csp-report-redact.ts
    - middleware.ts
    - lib/rate-limit.ts
    - lib/payments/stripe.ts
    - lib/payments/consent-text.ts
    - tests/next-config-headers.test.ts
    - tests/private-link-paths.test.tsx
    - tests/csp-report-redact.test.ts
    - tests/middleware-csrf-forms.test.ts
    - tests/rate-limit.test.ts
    - tests/payments-consent.test.ts
decisions:
  - "Quote objects use card_ kinds and ids-only metadata so the legacy booking chain never takes them (D-18)"
  - "robots.txt and the middleware matcher are untouched"
status: complete
commits: 3
plan_head_before: 6325ca5e50e19adb7b7cf63038485cfc259b9250
plan_head_after: 785c5f0219d4a06eadd44ee2abd03947b70d6bea
actuals:
  tokens: 9000
  tasks: 3
  commits: 3
---

# Phase 92 Plan 04: Quote link secrecy and Stripe vocabulary Summary

Quote URLs are no-referrer, no-store, noindex and kept off trackers and CSP logs on all 8 locales; `/api/quote/*` is same-origin only with per-IP limits; quote payments have their own `card_quote_*` kinds, keys, ids-only metadata and consent version.

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 (tracer) | 9a688e51 | security(92-04): keep quote links out of Referer, caches, indexes, trackers and CSP logs |
| 2 | 8888564d | security(92-04): same-origin only and per-IP limits for the public quote endpoints |
| 3 | 785c5f02 | security(92-04): card_quote_* Stripe kinds, keys and metadata, quote consent version |

## What was built

- **Headers (T-92-11/12):** `/quote/:path*` and `/:locale(ru|es|fr|ar|hi|zh|zh-hant)/quote/:path*` (same alternation as the manage rule) with Referrer-Policy no-referrer, Cache-Control no-store, X-Robots-Tag noindex, nofollow; X-Frame-Options stays DENY. Tests build paths from `locales` and name `/zh-hant/quote/x`; a test asserts robots.txt has no `/quote` rule.
- **Private paths / CSP:** `quote` in `PRIVATE_SEGMENTS`; `quote` in `SECRET_PATH_RE` (`/quote/<token>` becomes `/quote/[redacted]`).
- **CSRF / limits (T-92-13/14):** `/api/quote` in both CSRF lists (does not match `/api/submit-quote`, covered by a test); LIMITS `/quote` 30, view 20, accept 10, state 60, pdf 10, remainder 10.
- **Stripe (T-92-15):** CardKind `card_quote_deposit`/`card_quote_remainder`; `stripeKeys.quoteCustomer/quoteDeposit/quoteDepositVoid/quoteRemainder/quoteRemainderVoid/quoteRefund`; `quoteMetadata` (kind, quoteId, versionId, quoteReference, optional acceptanceId/attempt; no cofBookingId/bookingId/groupBookingIds). `classifyPaymentEvent` returns `unrouted` (non-null) for `payment_intent.succeeded` of these kinds, so they never reach the legacy chain.
- **Consent:** `QUOTE_CONSENT_VERSION = 'quote-2026-11-1'` added to `EXTRAS_CONSENT_VERSIONS`; `CARD_CONSENT_VERSION` unchanged.

## Verification

- `npx vitest run` of the 10 plan files: 10 files, 410 tests passed.
- `npx tsc --noEmit`: 8 errors, all in `tests/` (baseline: i18n-translate-dnt 2, nav-auth 5, passenger-actions 1); none in touched files.
- `npx eslint --quiet` on all touched files: clean.

## Deviations from Plan

None - plan executed as written. Notes: Task 3 tests were written before the implementation but the red run was not captured separately (missing exports make the imports fail by construction). The per-plan commit ledger file in the git dir was not written (sandbox refused compound git-dir commands); the base commit is recorded above as `plan_head_before`.

## Known Stubs

None.

## Threat Flags

None. No new surface beyond the plan's threat register; T-92-11..15 mitigated and tested.

## Self-Check: PASSED

Files created/modified exist; commits 9a688e51, 8888564d, 785c5f02 present on the branch.
