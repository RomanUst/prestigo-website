---
phase: 93-day-trips-custom-tours
plan: 25
subsystem: tours-content
tags: [tours, seed, content, i18n, ar]
requires: ["93-21"]
provides:
  - "content/tours-seed/ar/{6 slugs}.json: complete Modern Standard Arabic launch content"
  - "ar hub and ar terms updated for the fixed-price + hours-included model"
affects: [93-28]
key-files:
  created:
    - content/tours-seed/ar/dresden-day-trip.json
    - content/tours-seed/ar/cesky-krumlov-day-trip.json
    - content/tours-seed/ar/kutna-hora-day-trip.json
    - content/tours-seed/ar/karlovy-vary-day-trip.json
    - content/tours-seed/ar/karlstejn-day-trip.json
    - content/tours-seed/ar/bohemian-switzerland-day-trip.json
  modified:
    - content/pages/ar/services/day-trips-from-prague.json
    - content/pages/ar/terms.json
    - tests/tour-seed.test.ts
decisions:
  - "Terms clause appended to ar section4.items[1].desc (Late cancellation), mirroring 93-21; the sentence has no digit."
  - "Numbers are Latin digits (1348, 1388, 2005, 35, 40 thousand); no hours-included or cancellation numbers, no price anywhere."
  - "Place names follow the existing ar site copy (Frauenkirche as كنيسة السيدة (فراونكيرشه), Zwinger as قصر تسفينغر, Loket as لوكيت); new names (Karlštejn كارلشتاين, Hřensko هرينسكو, Kamenice كاميني) transliterated, Pravčická brána given with its Czech name in brackets for recognition."
metrics:
  completed: 2026-11-18
status: complete
commits: 3
plan_head_before: ef1469043089e565130c12fc94dc01cf366ffb8f
plan_head_after: f9079031bde2c8d284435a8eb9a588e3b1bdaa1c
actuals:
  tokens: 40000
  tasks: 2
  commits: 3
---

# Phase 93 Plan 25: Arabic tour content Summary

Six complete Arabic tour files translated in-session from the EN seed, plus the ar hub rewrite and the ar day-trip terms clause; all content and i18n tests green.

## What was built

- **Task 1 (tracer)** - `content/tours-seed/ar/*.json` (6 files). Every field translated into Modern Standard Arabic (title, short description, description, highlights, itinerary, includes, excludes, pickup, important info, FAQ, SEO title and description), facts identical to the EN source, no price, no hours or cancellation numbers, chauffeur not a guide, tickets and guides excluded, itinerary starts with the pickup and ends with the return to the same address. Commit `7f249ce0`.
- **Task 2** - `content/pages/ar/services/day-trips-from-prague.json`: metadata.description, hero.intro, glance items 0 and 3, intro paragraphs 0 and 1, features (label, headings, items 0-3), steps items 0 and 3, editorial paragraphs 0 and 1, faqs 0, 2, 3, 4, 5 (question 5 reworded) and related (heading and all four links now service pages), mirroring the EN rewrite of 93-21. Every key and array length unchanged. `content/pages/ar/terms.json`: the day-trip sentence appended to `section4.items[1].desc`. Commit `f9079031`.

## Deviations from Plan

**1. [Rule 3 - Blocking] tests/tour-seed.test.ts asserted that every upserted translation is English.**
- **Found during:** Task 1 verify (`tests/tour-seed.test.ts:222`).
- **Issue:** the "apply inserts draft tours..." test required `t.locale === 'en'` for every translation row; it fails as soon as any non-en locale folder exists (it will fail for each of the parallel locale plans 93-22..93-27, not just ar). The plan's own verify command includes this file.
- **Fix:** assert that `en` is among the rows and that every row is `is_complete === true`. One-line change, own commit `dab820b3`.
- **Merge note for the orchestrator:** the other locale executors will have hit the same failure and may have edited the same line differently; if the merges conflict on `tests/tour-seed.test.ts`, keep any one version (they are equivalent in intent).

## Verification

- `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts tests/i18n-completeness.test.ts tests/landing-change.test.ts tests/content-locale-parity.test.ts tests/legal.test.ts tests/public-cancellation-wording.test.ts tests/seo-snippets-no-prices.test.ts` - 8 files, 846 passed.
- All JSON files parse; ar title / short description contain Arabic script; field lengths within database limits (title <= 39, short description <= 176, SEO description <= 127).
- `npx tsc --noEmit`: no errors outside `tests/` (baseline).

## Known Stubs

None.

## Threat Flags

None. T-93-61 mitigated: the content test runs on ar (no amounts, no waiting model, no scarcity, rating or ride-hailing wording) and facts are limited to the EN source.

## Self-Check: PASSED

- All six ar seed files, the ar hub and ar terms exist and parse.
- Commits 7f249ce0, dab820b3, f9079031 exist; `git rev-list --count ef146904..HEAD` = 3 before this SUMMARY.
