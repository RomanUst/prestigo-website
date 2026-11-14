---
phase: 92-quotes
plan: 03
subsystem: i18n
tags: [i18n, next-intl, quotes, consent, zh-hant]
requires: []
provides:
  - "Quote namespace (81 keys) in messages/{en,ru,es,fr,ar,hi,zh}.json, hand-written"
  - "Quote namespace in messages/zh-hant.json, generated from zh"
  - "tests/quote-copy-i18n.test.ts (key set, ICU parity, no stubs, no typed money, formatting, zh-hant = OpenCC(zh))"
affects: [92-04, 92-29]
tech-stack:
  added: []
  patterns: ["one KEYS list per plan task, namespace key set compared exactly", "zh-hant only via scripts/zh-hant-sync.mjs"]
key-files:
  created: [tests/quote-copy-i18n.test.ts]
  modified: [messages/en.json, messages/ru.json, messages/es.json, messages/fr.json, messages/ar.json, messages/hi.json, messages/zh.json, messages/zh-hant.json]
decisions:
  - "D-21 / D-22 (owner, option a) recorded in 92-CONTEXT.md before this plan; consent texts follow them"
metrics:
  duration: "~1h (machine heavily loaded by parallel runs)"
  completed: 2026-11-14
status: complete
commits: 2
plan_head_before: 6325ca5e50e19adb7b7cf63038485cfc259b9250
plan_head_after: c2633564ba4100b1640fbc61187a67ab2e672dc9
actuals:
  tokens: 40000
  tasks: 3
  commits: 2
requirements: [QUOTE-02, QUOTE-03, QUOTE-04, QUOTE-07]
---

# Phase 92 Plan 03: Quote copy in every locale Summary

The client-facing copy of the quote page, the four acceptance consent sentences (one per remainder method), the remainder sentences, the cancellation terms and the PDF document strings, hand-translated into en, ru, es, fr, ar, hi, zh and generated into zh-hant, guarded by a parity test that iterates `locales`.

## Task 1: owner decision (already answered)

Recorded in `92-CONTEXT.md` before this run:

- **D-21:** cash remainder. The saved card is a guarantee: it may be charged for a trip not paid in cash, for waiting beyond the booked time and for extras agreed during the trip. Owner, 2026-11-14: "1 ок" (option a, the planned scope).
- **D-22:** payment-link and invoice remainders. The saved card is used only for payments the client makes on the quote page (link) or approves (invoice). Owner, 2026-11-14: "1 ок" (option a).

The owner's reply for both was "1 ок", i.e. option a with no wording note, so the consent and remainder drafts of the plan were used unchanged. No commit for this task (nothing to change; `grep -cE "^- \*\*D-2[12]:\*\*"` returns 2).

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 owner gate | none (answer already in 92-CONTEXT.md) | D-21 / D-22 read and quoted |
| 2 tracer: page and consent copy + parity test | 117201bb | 70 keys per catalog |
| 3 PDF document, download, return page | c2633564 | 11 keys per catalog |

Keys added per catalog: 70 (Task 2) + 11 (Task 3) = 81, in each of en, ru, es, fr, ar, hi, zh and zh-hant.

## Verification

- `npx vitest run tests/quote-copy-i18n.test.ts tests/payments-copy-i18n.test.ts tests/i18n-completeness.test.ts tests/i18n-freeze-manifest.test.ts`: 158 passed. Wider i18n set (catalog array types, translate manifest and DNT, cancellation wording, SEO no-price, site metadata, wizard stops): 796 passed.
- `npx tsc --noEmit`: 8 errors, all the known baseline in `tests/` (nav-auth, passenger-actions, i18n-translate-dnt); none from this plan.
- `npx eslint --quiet tests/quote-copy-i18n.test.ts`: clean.
- `git status --porcelain content` empty after every zh-hant sync (see deviations).
- Both acceptance `node -e` checks (consent texts + invalid.title; document.operator + pdf.unavailable + done.body) exit 0 for all 8 locales.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] zh-hant sync wrote untracked files under content/**
- **Found during:** Tasks 2 and 3
- **Issue:** `node scripts/zh-hant-sync.mjs` also generates `content/blog/zh-hant/*` from the zh sources and created three untracked files (`bohemian-crystal-day-trip.mdx`, `prague-airport-to-karlovy-vary-spa-transfer.mdx`, `prague-airport-transfer-christmas-new-year.mdx`). No tracked content file changed.
- **Fix:** removed only those three untracked files after each run, as the plan instructs; `git status --porcelain content` is empty. Not committed.
- **Files modified:** none committed.

**2. [Rule 1 - Bug] opencc-js has no type declarations**
- **Found during:** Task 2 (tsc)
- **Issue:** a static `import('opencc-js')` in the test raised TS7016, a new tsc error beyond the baseline.
- **Fix:** the test imports it through a variable specifier with a local type, so tsc stays at the 8-error baseline; the conversion branch still runs (checked separately).
- **Commit:** 117201bb

### Notes

- The generator refreshed two pre-existing zh-hant values (`stopWait`, 等候 to 等待) that had drifted from `zh.json`. Committed as generated output (zh is the source). `Quote.lines.stopWait` in zh uses 等待 to match the existing site wording.
- Test-first order: the test file was written and seen failing (RED) before the catalogs were edited in both tasks.
- No `{` adjacent to an apostrophe in the French texts (ICU quoting); every key formats without a leftover brace in all 8 locales.

## Known Stubs

None.

## Threat Flags

None. T-92-09 (parameter parity), T-92-10 (no typed amounts), T-92-88 (owner gate before consent copy) and T-92-89 (zh-hant only generated, content/ clean) are mitigated as planned.

## Notes for later plans

- Plan 92-29 adds the QuoteEmails namespace after this plan and must extend the catalogs the same way (text insertion; the catalogs keep their hand-formatted compact arrays, so do not rewrite them with `JSON.stringify`, except zh-hant which is generated).
- A wording change to any `Quote.consent.*` key must bump QUOTE_CONSENT_VERSION (92-04). Counsel review of the consent wording remains a human item (92-28).

## Self-Check: PASSED

- tests/quote-copy-i18n.test.ts: FOUND
- messages/{en,ru,es,fr,ar,hi,zh,zh-hant}.json contain Quote with 81 keys: FOUND
- Commits 117201bb, c2633564: FOUND
