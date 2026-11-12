---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 17
subsystem: i18n
tags: [i18n, wizard, stops, waiting, airport-landing, next-intl]
requires: ["91-05"]
provides:
  - "catalog keys Booking.stopItem.{freeWaitHint,paidWaitUnavailable,moveUp,moveDown}, Booking.step3vehicle.waitingUnavailable, Booking.priceSummary.waitingLine, Booking.summaryBlock.waitingLine in 7 locales"
  - "catalog namespace Booking.landing (dateLabel, timeLabel, timeAria, offsetLabel, offsetAtLanding, offsetMinutes, pickupAt, pickupAtDate) in 7 locales"
  - "tests/wizard-stops-copy.test.ts"
affects: [91-09 stops and waiting UI, 91-10 airport landing UI]
tech-stack:
  added: []
  patterns:
    - "catalog keys inserted textually so the hand formatting of messages/*.json (inline arrays, one-line objects) is untouched and the diff stays minimal"
key-files:
  created:
    - tests/wizard-stops-copy.test.ts
  modified:
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
key-decisions:
  - "Booking.landing placed right after Booking.step2 (the date/time step it extends)"
  - "Minutes in landing and waiting copy use the abbreviation (min / мин / 分钟) as in the existing Booking.stopItem.minutes"
  - "es keeps the usted form (as in the neighbouring keys), fr keeps vous, hi/zh keep the existing wizard terms (दिनांक, 时间)"
duration: ~20min
completed: 2026-11-11
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: 8d16038928b07bfc3ed103fe050970e8097fda46
plan_head_after: 7bccd632e26495f4ee501d3921bdd59e1017fbcf
---

# Phase 91 Plan 17: Wizard copy for stops, paid waiting and airport landing Summary

All 15 new wizard strings (stop reorder labels, free/paid waiting hints, waiting summary lines, the eight `Booking.landing` keys) now exist as real hand translations in en, ru, es, fr, ar, hi and zh, with `{minutes}`, `{time}` and `{date}` preserved, so 91-09 and 91-10 only read them.

## What was done

**Task 1 (tracer, commit 9bb0540a):** wrote `tests/wizard-stops-copy.test.ts` first (RED: 91 failures, keys missing), then added the seven stop and waiting keys to `messages/en.json` and hand-translated them into the six other catalogs. The test checks, for every locale and key: a non-empty string, formats through `createTranslator` with no leftover brace, no price or amount (digit next to a currency sign or code), and for non-English locales a value different from English.

**Task 2 (commit 7bccd632):** extended the test with the landing keys (RED: 106 failures), then added `Booking.landing` (after `Booking.step2`) in all 7 catalogs. Added placeholder checks (`offsetMinutes` formats with 30, `pickupAt` with 14:30, `pickupAtDate` with "11 Jun" and "00:20" in every locale).

## Verification

- `npx vitest run tests/wizard-stops-copy.test.ts tests/i18n-completeness.test.ts`: 324 passed.
- `npx vitest run tests/payments-copy-i18n.test.ts tests/payments-consent.test.ts tests/i18n-completeness.test.ts`: 149 passed (no regression in neighbouring catalog tests).
- Both acceptance `node -e` checks exit 0.
- `npx tsc --noEmit`: no error outside the 8-error baseline; `npx eslint --quiet tests/wizard-stops-copy.test.ts`: clean.

## Deviations from Plan

None - plan executed as written. The second task's test additions were staged out of the Task 1 commit on purpose (the Task 1 test covers only its own keys), so each commit is green on its own.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. T-91-48 mitigated: no new string carries an amount, and the test rejects digit + currency patterns.

## Notes for downstream plans

- Keys are consumed as `useTranslations('Booking.stopItem')` (freeWaitHint, paidWaitUnavailable, moveUp, moveDown), `Booking.step3vehicle` (waitingUnavailable), `Booking.priceSummary` and `Booking.summaryBlock` (waitingLine), `Booking.landing` (all eight).
- `offsetMinutes` expects `{minutes}`, `pickupAt` expects `{time}`, `pickupAtDate` expects `{date}` and `{time}`; the date string is formatted by the component (the catalog does not format dates).
- `commits: 2` counts the two code commits; the docs commit carrying this SUMMARY follows `plan_head_after`.

## Self-Check: PASSED

- messages/en.json, ru.json, es.json, fr.json, ar.json, hi.json, zh.json and tests/wizard-stops-copy.test.ts exist and are committed.
- Commits 9bb0540a and 7bccd632 exist on branch worktree-agent-ab245ba2578fe0862.
