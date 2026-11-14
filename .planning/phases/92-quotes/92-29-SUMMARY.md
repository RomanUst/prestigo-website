---
phase: 92-quotes
plan: 29
subsystem: i18n
tags: [i18n, next-intl, quotes, emails, zh-hant]
status: complete
provides:
  - "QuoteEmails namespace (39 keys) in messages/{en,ru,es,fr,ar,hi,zh}.json, hand-written"
  - "QuoteEmails namespace in messages/zh-hant.json, generated from zh"
  - "QuoteEmails parity section in tests/quote-copy-i18n.test.ts"
requires:
  - phase: 92-quotes
    plan: 03
key-files:
  created: []
  modified:
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - messages/zh-hant.json
    - tests/quote-copy-i18n.test.ts
requirements: [QUOTE-04, QUOTE-05, QUOTE-07]
estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low
actuals:
  tokens: 36000
  tasks: 2
  commits: 2
plan_head_before: 425e4799c21dd6e7e394e46451db00271fc1aa55
plan_head_after: 4873421dbc69a40f5187d974e377ab924ca0dede
completed: 2026-11-14
---

# Phase 92 Plan 29: QuoteEmails copy in every locale Summary

The quote e-mails (sent, confirmed, remainder due, remainder paid, cancelled, refunded) have their copy in all 8 site locales: 39 keys per catalog, hand-translated into en, ru, es, fr, ar, hi, zh and generated into zh-hant, guarded by a parity test that iterates `locales`.

## Tasks

| Task | Name | Commit | Keys per catalog |
| ---- | ---- | ------ | ---------------- |
| 1 (tracer) | QuoteEmails common and sent copy + parity test | 73492d25 | 13 |
| 2 | confirmed, remainderDue, remainderPaid, cancelled, refunded | 4873421d | 26 (39 in total) |

Key paths are exactly those of the plan's interfaces block (`QuoteEmails.common.greeting` ... `QuoteEmails.refunded.intro`), so the e-mail plans (92-13, 92-20 to 92-24) can render them by name.

## Decisions

- Terminology follows the `Quote` namespace of 92-03 per locale: ru "предложение / депозит", es "presupuesto / depósito", fr "devis / acompte", ar "عرض السعر / العربون", hi "कोटेशन / जमा राशि", zh "报价 / 定金".
- D-21 / D-22: `confirmed.remainder.cash`, `.payment_link`, `.invoice` and `.none` do not mention the card at all; only `.saved_card` names it (as described in the terms). The English test asserts this.
- Subjects take the reference as their only parameter and contain no line break (T-92-91); no value types an amount, and none names a separate waiting amount (T-92-90).
- The catalogs were edited by text insertion (new block appended after `Quote`, which is the last namespace); the diffs are pure additions (+19 lines per catalog in Task 1, +46 in Task 2 approx.). zh-hant produced by `node scripts/zh-hant-sync.mjs`; its output contained no unrelated drift this time. The 3 untracked `content/blog/zh-hant/*.mdx` files the script writes were deleted after each run; `git status --porcelain content` is empty.

## Verification

- `npx vitest run tests/quote-copy-i18n.test.ts tests/payments-copy-i18n.test.ts tests/payments-emails.test.ts`: 622 passed (3 files).
- `npx vitest run tests/i18n-completeness.test.ts tests/i18n-freeze-manifest.test.ts`: 36 passed.
- `npx tsc --noEmit`: 8 errors, all in `tests/` (baseline), none elsewhere.
- `npx eslint --quiet tests/quote-copy-i18n.test.ts`: clean.
- TDD: both tasks ran RED first (EN key-set test failed with the new KEYS list before the catalogs were edited), then GREEN.

## Deviations from Plan

None - plan executed exactly as written. (The tracer commit carries a test with an empty lifecycle KEYS list that Task 2 fills; this is the plan's "Task 2 extends it".)

## Known Stubs

None.

## Threat Flags

None.

## Notes for follow-up

- Counsel / native-speaker review of the e-mail wording is not part of this plan (consent wording review stays with 92-28).
- The e-mail plans must pass `amount` as a pre-formatted string parameter (the copy never types an amount).

## Self-Check: PASSED

- messages/{en,ru,es,fr,ar,hi,zh,zh-hant}.json each hold QuoteEmails with 39 keys: FOUND
- tests/quote-copy-i18n.test.ts QuoteEmails section: FOUND
- commits 73492d25, 4873421d: FOUND
