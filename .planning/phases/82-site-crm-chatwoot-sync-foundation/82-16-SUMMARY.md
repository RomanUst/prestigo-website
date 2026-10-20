---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 16
subsystem: legal-pages-i18n
tags: [gdpr, data-deletion, i18n, retention, freeze]
requires:
  - phase: 82-04
    provides: privacy.json section6.items[0].period (10-year figure), 82-04.freeze, translation-manifest entries
provides:
  - data-deletion page in 7 locales states D-13 retention (up to 10 years, anonymised) and D-14 held data (messages, CRM customer record)
  - tests/data-deletion-content.test.ts (privacy adjacency check, 7 locales)
  - freeze/82-16.freeze
affects: [82-14]
tech-stack:
  added: []
  patterns: [hand-translated in-session units frozen via i18n-freeze-manifest]
key-files:
  created:
    - tests/data-deletion-content.test.ts
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/freeze/82-16.freeze
  modified:
    - content/pages/en/data-deletion.json
    - content/pages/ru/data-deletion.json
    - content/pages/es/data-deletion.json
    - content/pages/fr/data-deletion.json
    - content/pages/ar/data-deletion.json
    - content/pages/hi/data-deletion.json
    - content/pages/zh/data-deletion.json
    - i18n/translation-manifest.json
key-decisions:
  - "Copy only: no key added/removed/moved; app/[locale]/data-deletion/page.tsx untouched"
  - "10-year booking retention taken from D-13 as 82-04 did; owner confirmation is still pending (82-14 Task 1)"
metrics:
  duration: ~12 min
  completed: 2026-10-19
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: c7ab2f3fe2d25f16e1be293b798a025cbf3d38e2
plan_head_after: 27bf2d61
commits: 2
---

# Phase 82 Plan 16: Data-deletion page aligned with privacy retention Summary

The data-deletion page in en, ru, es, fr, ar, hi and zh now says booking and invoice records are kept up to 10 years under Czech law without name, email, phone, notes or addresses, and lists chat/email/Telegram/WhatsApp messages and the CRM customer record among the data held, matching the privacy policy (82-04).

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | EN copy + EN test, page render check | 26f75456 | content/pages/en/data-deletion.json, tests/data-deletion-content.test.ts |
| 2 | ru/es/fr/ar/hi/zh hand translations, 7-locale test, freeze | 27bf2d61 | six data-deletion.json, test, 82-16.freeze, i18n/translation-manifest.json |

## Verification

- `npx vitest run tests/data-deletion-content.test.ts tests/privacy-content.test.ts tests/static-pages-locale.test.tsx tests/i18n-freeze-manifest.test.ts`: 4 files, 128 tests passed.
- RED confirmed before each GREEN (4 failures on EN, 24 failures on the 7-locale test before translations).
- `i18n-freeze-manifest --dir <82 freeze> `: froze 10 units across 9 patterns (7 from 82-04 re-checked idempotently, 2 new: `data-deletion.json::section1.text`, `::section2.paragraph2`). `--verify` on the 82 dir: PASSED, 10 frozen units. `--verify` on the 77 dir: PASSED, 3 frozen units.
- `node scripts/i18n-translate.mjs --check`: PASSED (no API calls). `--dry-run` never run.
- `tsc --noEmit`: no data-deletion errors; eslint on the new test: clean.
- `app/[locale]/data-deletion` unchanged versus plan base.

## Deviations from Plan

**1. [Rule 1 - Bug in plan assumption] "30 days" uses a no-break space in en source**
- Found during: Task 1 GREEN run
- Issue: the original EN string has U+00A0 between 30 and days, so a literal `"30 days"` assertion failed.
- Fix: kept the source string unchanged (copy-only rule) and made the test match `/within 30\s+days/`.
- Files modified: tests/data-deletion-content.test.ts

**2. Manifest timestamp churn** - re-running the freeze tool over the 82 dir refreshed `lastTranslatedAt` on the 82-04 units in i18n/translation-manifest.json (hashes unchanged). Expected tool behaviour.

Otherwise the plan executed as written. The per-plan commit ledger file in the git dir could not be written (worktree sandbox blocks writes there), so `plan_head_before` was taken from the dispatch base commit; the count (2) matches `git rev-list --count c7ab2f3f..27bf2d61` before this summary commit.

## Dependencies / Open Items

- Owner has not yet confirmed the 10-year booking retention figure (82-14 Task 1). If the owner names another figure, the seven data-deletion files, the seven privacy.json files (82-04) and this test change together.
- Human UAT: open /ar/data-deletion at 375 px; the changed paragraphs should read right-to-left with no clipping or horizontal scroll (not run here; copy-only change in existing paragraph elements).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: tests/data-deletion-content.test.ts, freeze/82-16.freeze, all seven data-deletion.json
- FOUND commits: 26f75456, 27bf2d61
