---
phase: 88-card-on-file-scheduled-holds
plan: 05
subsystem: i18n
tags: [next-intl, translations, email, consent, rtl, ar, hi, zh, ru, es, fr]

requires:
  - phase: 88-card-on-file-scheduled-holds
    provides: "88-03 EN source copy for PaymentEmails.* and Booking.step6.cardOnFile.*, renderPaymentEmail, buildConsentText with locale discovery"
provides:
  - "Real in-session translations of PaymentEmails.* and Booking.step6.cardOnFile.* in ru, es, fr, ar, hi, zh"
  - "tests/payments-copy-i18n.test.ts: 7-locale key, ICU-parameter, not-a-stub, differs-from-EN, no-amount and no-refund/fee-wording guard"
affects: [88 checkout UI plans, 88-08 consent storage, 88-09 email sending, 88-17 owner canary check, 89 counsel review of consent wording]

actuals:
  tokens: 28000
  tasks: 2
  commits: 2
plan_head_before: e69289647e8dac55b43e87f9649163e7c1b9a5d4
plan_head_after: c2d12c5eadf25dca5981e1e59a8c9f5765689624

tech-stack:
  added: []
  patterns:
    - "Catalog namespaces inserted textually (pure additions, no reformatting of the existing 7-locale files)"
    - "Per-locale forbidden-wording regexes and a cognate allow-list inside the parity test"

key-files:
  created:
    - tests/payments-copy-i18n.test.ts
  modified:
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json

key-decisions:
  - "Hold wording per locale: ru заблокировать, es retener, fr bloquer, ar تجميد مؤقت (avoids collision with حجز = booking), hi होल्ड, zh 冻结"
  - "Formal register kept (usted / vous / вы); consent strings follow the EN sentence structure clause for clause"
  - "French Date is a genuine cognate; allowed by an explicit allow-list in the parity test rather than loosening the differs-from-EN rule"

patterns-established:
  - "Translation plans need no email/consent test edits: locale discovery by namespace presence picks the new catalogs up"

requirements-completed: [MAIL-01, HOLD-01]

coverage:
  - id: D1
    description: "Six catalogs carry every PaymentEmails and Booking.step6.cardOnFile key with real translations and identical ICU parameters"
    requirement: MAIL-01
    verification:
      - kind: unit
        ref: "tests/payments-copy-i18n.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Payment emails render for all 7 locales (ar RTL shell, label resets, Latin digits) and the server consent text equals the client path for all 7"
    requirement: MAIL-01
    verification:
      - kind: unit
        ref: "tests/payments-emails.test.ts, tests/payments-consent.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Translated consent wording is legally faithful and reads naturally to a native speaker"
    requirement: HOLD-01
    verification: []
    human_judgment: true
    rationale: "Tests prove parameters and structure, not legal fidelity; counsel review of all 7 locales is a Phase 89 blocker (T-88-12)"

duration: 12 min
completed: 2026-11-04
status: complete
---

# Phase 88 Plan 05: Card-flow Translations Summary

**Real in-session translations of the card-flow checkout copy and the four payment emails in ru, es, fr, ar, hi and zh, guarded by a 7-locale parity test (keys, ICU parameters, no stubs, no typed amounts, no refund or cancellation-fee wording).**

## Accomplishments

- Tracer: ar, hi and zh first. The existing email and consent suites picked the three catalogs up automatically (discovery by namespace), so the ar RTL shell, the label resets and the Latin-digit dates and amounts were exercised by real translations before the Latin locales were added (76 tests green).
- ru, es and fr added under the same rules; the email and consent suites now cover all 7 locales.
- Every translated string keeps exactly its EN ICU parameters; brand tokens (Prestigo, PRESTIGO, Stripe) and the tagline PRESTIGE IN EVERY MILE stay Latin.
- Consent strings translated clause for clause (save the card, hold the amount on the date, charge after the trip is completed, charge or release the difference).
- Catalogs were edited by textual insertion: each of the six files is +81 lines, zero deletions, `messages/en.json` untouched.

## Task Commits

1. **Task 1 (tracer): ar, hi, zh translations** - `d5223269` (feat)
2. **Task 2: ru, es, fr translations plus parity test** - `c2d12c5e` (feat)

## Verification

- `npx vitest run tests/payments-copy-i18n.test.ts tests/payments-emails.test.ts tests/payments-consent.test.ts tests/i18n-completeness.test.ts tests/inquiry-notice-i18n.test.ts`: 201 passed.
- Full suite: 9055 passed; the 6 failing files (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`, `force-static-metadata`) fail on `next-intl` module resolution / `window` through the symlinked `node_modules` of the worktree, unrelated to this plan (no auth, no catalog content involved).
- `npx tsc --noEmit`: 8 errors, identical to the documented baseline. `npx eslint --quiet tests/payments-copy-i18n.test.ts`: clean.
- Acceptance: `grep -cE "\[(AR|HI|ZH|RU|ES|FR)\]"` prints 0 for all six files; `git diff` of `messages/en.json` against the plan base is empty.

## Deviations from Plan

**1. [Rule 3 - Blocking] node_modules missing in the worktree** - symlinked the main checkout's `node_modules` (gitignored, no install).

**2. [Rule 1 - Test refinement] French "Date" equals the EN word** - the parity test's differs-from-EN rule flagged `PaymentEmails.common.dateLabel` in fr; added a documented one-key cognate allow-list instead of changing the translation.

**Total deviations:** 2, none affecting scope.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-88-12 (translated consent wording): mitigated here by the ICU-parameter parity test, the faithful-translation rule and the pinned `CARD_CONSENT_VERSION`. Counsel review of all 7 locales remains the Phase 89 blocker listed in infra/stripe/README.md.

## Human checks outstanding

- Mail-client rendering of the ar and other non-Latin emails (Gmail, Outlook, Apple Mail) cannot be proven by tests; owner check on the Arabic canary email in plan 88-17.
- Native-speaker read of the consent strings (ar `تجميد مؤقت` for "hold" and hi `अधिकृत करता/करती हूँ` are deliberate choices worth a second look).

## Self-Check: PASSED

- `tests/payments-copy-i18n.test.ts` exists; commits `d5223269` and `c2d12c5e` exist on branch `worktree-agent-a1a393081aa39fd82`.
