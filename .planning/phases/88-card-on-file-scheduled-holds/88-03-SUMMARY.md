---
phase: 88-card-on-file-scheduled-holds
plan: 03
subsystem: payments
tags: [next-intl, createTranslator, email, consent, sha256, i18n, resend]

requires:
  - phase: 87-payments-ledger
    provides: payments foundation the later card-on-file plans build on (no code dependency in this plan)
provides:
  - renderPaymentEmail(kind, locale, vars) - one HTML shell for card_saved, hold_placed (at_checkout / scheduled), charged, payment_failed (declined / auth_required)
  - formatMinor(amountMinor, currency) - integer minor units to EUR / CZK display strings (client-safe)
  - CARD_CONSENT_VERSION, consentMessageKey, consentVars (client-safe) and buildConsentText, consentSha256 (server)
  - EN source copy for PaymentEmails.* and Booking.step6.cardOnFile.* in messages/en.json
  - loadMessages(locale) fixed import map shared by the renderer and the consent builder
affects: [88-05 translations, 88-08 consent storage, 88-09 email sending, 88-checkout UI plans, 89 legal wording, 92 new email kinds]

actuals:
  tokens: 11600
  tasks: 2
  commits: 2
plan_head_before: d7f9f6c1b9baac52e28c8333893ae4fbfb362c5d
plan_head_after: 80a3e84b31532ad42be2b409e5bafdaf57671955

tech-stack:
  added: []
  patterns:
    - "Catalog-driven HTML email: ICU parameters travel through createTranslator as private-use sentinels, the text is HTML-escaped once, then parameters are re-inserted as bdi dir=ltr fragments"
    - "Server and client render the consent text from the same catalog key and the same formatters; the server hashes NFC + UTF-8"
    - "Fixed locale -> dynamic import map for message catalogs (never a computed path)"

key-files:
  created:
    - lib/payments/emails/render.ts
    - lib/payments/money.ts
    - lib/payments/consent-text.ts
    - lib/payments/consent.ts
    - tests/payments-emails.test.ts
    - tests/payments-consent.test.ts
  modified:
    - messages/en.json
    - lib/email.ts

key-decisions:
  - "Missing catalog namespace in a non-EN locale (PaymentEmails / Booking.step6.cardOnFile) falls back to English for the whole render until plan 88-05 translates it; once translated the per-locale tests run automatically"
  - "createTranslator onError throws, so an untranslated or mistyped key fails loudly in tests instead of shipping a raw key in a client email"
  - "payment_failed throws when payUrl is missing or not https; calendarUrl must be https too"
  - "Consent version pinned by a SHA-256 digest of the two EN consent strings keyed by version in the test: copy change without a bump fails, bump without a new pin fails"
  - "Footer rule uses border-top (not background-color) so the payment_failed button is the only background-color #BFA06A element"

patterns-established:
  - "Adding an email kind = one entry in TEMPLATES in render.ts plus catalog keys"
  - "Per-locale tests discover locales by the presence of the namespace, so translation plans need no test edits"

requirements-completed: [MAIL-01, HOLD-01]

coverage:
  - id: D1
    description: "renderPaymentEmail builds all four client payment emails (with variants) from one shell and the PaymentEmails namespace, English fallback for null / empty / unknown locale"
    requirement: MAIL-01
    verification:
      - kind: unit
        ref: "tests/payments-emails.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Amounts and dates in emails and consent text come from formatMinor / formatLocaleDate; no amount typed in the catalog"
    requirement: MAIL-01
    verification:
      - kind: unit
        ref: "tests/payments-emails.test.ts#formatMinor"
        status: pass
    human_judgment: false
  - id: D3
    description: "Consent text built server-side equals the client rendering path; SHA-256 over NFC UTF-8; version pinned to the EN strings"
    requirement: HOLD-01
    verification:
      - kind: unit
        ref: "tests/payments-consent.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Email visual layout in real mail clients (dark shell, long addresses wrapping, Arabic RTL with Latin addresses via bdi)"
    requirement: MAIL-01
    verification: []
    human_judgment: true
    rationale: "Rendering in Gmail / Outlook / Apple Mail and in RTL cannot be asserted by unit tests (E12 long-text backstop); needs a visual check once translations exist"

duration: 7 min
completed: 2026-11-04
status: complete
---

# Phase 88 Plan 03: Payment Copy Layer Summary

**A single language-aware renderer (`renderPaymentEmail`) builds all four card-lifecycle client emails from one HTML shell and the `PaymentEmails` catalog, and a versioned consent text builder hashes the exact wording the checkout shows (NFC + UTF-8 SHA-256).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-04T11:47:00Z
- **Completed:** 2026-11-04T11:54:00Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- Tracer: `renderPaymentEmail('card_saved', 'en', vars)` renders end to end (gold line, wordmark, H1, reference box, "How payment works" box with the exact hold date and amount, journey table with From / To as separate rows, calendar link, assistance block, Latin tagline footer). The other three kinds and all variants run through the same shell by adding template entries only. The tracer gate was satisfied by re-running the automated verify (45 tests green) before expanding.
- `formatMinor` (client-safe) is the one amount formatter: whole units delegate to `formatEUR` / `formatCZK`, other amounts keep the same symbol and placement with two decimals (EUR 45.50, CZK 45,50).
- Locale rules implemented: labels uppercase and letter-spaced only in en / es / fr / ru; ar renders `<html lang="ar" dir="rtl">`, `<body dir="rtl">`, right-hand leading border and right-aligned cells; amounts, dates, references and the contact line sit in `bdi dir="ltr"`, addresses in `bdi dir="auto"`; long addresses wrap (`overflow-wrap: anywhere`).
- Safety: every user string goes through `escapeHtml`; pay and calendar links must be https; `payment_failed` is the only email with a filled `#BFA06A` button and it carries the pay link exactly once; no email states a cancellation fee, a refund promise or a cancellation threat (asserted for English).
- Consent: `consentVars` / `consentMessageKey` / `CARD_CONSENT_VERSION = '2026-11-draft-1'` are client-safe (no `node:crypto`); `buildConsentText` and `consentSha256` are server-side and a test proves the server text equals the `createTranslator` client path for every locale that carries the namespace.
- EN catalog: `PaymentEmails.*` and `Booking.step6.cardOnFile.*` written verbatim from the UI-SPEC, ICU parameters only, zero typed amounts.

## Task Commits

1. **Task 1 (tracer): payment email renderer** - `3f277340` (feat)
2. **Task 2: checkout copy and consent builder** - `80a3e84b` (feat)

## Verification

- `npx vitest run tests/payments-consent.test.ts tests/payments-emails.test.ts tests/email.test.ts`: 61 passed.
- `tests/i18n-completeness`, `i18n-catalog-array-types`, `i18n-translate-manifest`, `i18n-translate-dnt`, `Step6Payment`, `shared-sections-i18n`, `email-payment-request`, `booking-changed-email`: all pass (adding EN-only keys does not trip parity tests).
- `npx tsc --noEmit`: 8 errors, identical to the documented baseline (none in new or touched files).
- `npx eslint --quiet lib/payments lib/email.ts tests/payments-*.test.ts`: clean.
- Acceptance criteria re-run: catalog namespaces present, `grep -cE "€[0-9]"` prints 0 for `messages/en.json` and `render.ts`, `export async function renderPaymentEmail` count 1, 4 export keywords added in `lib/email.ts` (numstat 4 added / 4 deleted), `createHash` count 1 in `consent.ts`, `node:crypto` count 0 in `consent-text.ts`, `2026-11-draft-1` count 1.

## Deviations from Plan

### Auto-fixed / additive

**1. [Rule 2 - Missing critical] English fallback when a locale catalog lacks the new namespace**
- **Found during:** Task 1
- **Issue:** the other six locales get `PaymentEmails` and `Booking.step6.cardOnFile` only in plan 88-05; a send for a Russian booking before then would throw on a missing namespace.
- **Fix:** `renderPaymentEmail` and `buildConsentText` fall back to the English catalog (and report `locale: 'en'`) when the locale catalog has no such namespace. Once 88-05 lands the fallback is dormant and the per-locale tests start covering the new locales automatically.
- **Files modified:** lib/payments/emails/render.ts, lib/payments/consent.ts
- **Commit:** 3f277340, 80a3e84b

**2. [Rule 3 - Blocking] node_modules missing in the worktree**
- **Issue:** the fresh worktree had no `node_modules`, so vitest and tsc could not run. No install was performed (zero new dependencies).
- **Fix:** symlinked the main checkout's `node_modules` into the worktree (gitignored, not committed).

**Total deviations:** 2 (1 additive robustness, 1 environment). **Impact:** none on scope or contracts.

## Authentication Gates

None.

## Issues Encountered

None.

## Known Stubs

None. The other six locales are intentionally English-only fallback until plan 88-05 (declared in the plan objective).

## Threat Flags

None. T-88-07 (HTML injection) mitigated: all variables escaped, fixed import map, injection test with `<b>x</b>`. T-88-08 (consent repudiation) mitigated for this plan's share: versioned catalog key, NFC + UTF-8 SHA-256, version pinned to the EN strings by test; per-booking storage arrives in 88-08.

## Next Phase Readiness

Ready for 88-05 (translate `PaymentEmails.*` and `Booking.step6.cardOnFile.*` into ru, es, fr, ar, hi, zh; the discovery-based tests will cover them with no edits, and `CARD_CONSENT_VERSION` must be bumped together with any change to the EN consent strings). Plans 88-08 / 88-09 can import `buildConsentText`, `consentSha256` and `renderPaymentEmail` directly.

## Self-Check: PASSED

- Created files exist: lib/payments/emails/render.ts, lib/payments/money.ts, lib/payments/consent-text.ts, lib/payments/consent.ts, tests/payments-emails.test.ts, tests/payments-consent.test.ts.
- Commits `3f277340` and `80a3e84b` exist on branch `worktree-agent-a22ce4bc393f61626`.
