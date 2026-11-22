---
phase: 93-day-trips-custom-tours
plan: 23
subsystem: tours-content
tags: [tours, seed, content, i18n, es]
requires: ["93-21"]
provides:
  - "content/tours-seed/es/{6 slugs}.json: complete Spanish launch content"
  - "es hub and es terms updated for the fixed-price + hours-included model"
affects: [93-28]
key-files:
  created:
    - content/tours-seed/es/dresden-day-trip.json
    - content/tours-seed/es/cesky-krumlov-day-trip.json
    - content/tours-seed/es/kutna-hora-day-trip.json
    - content/tours-seed/es/karlovy-vary-day-trip.json
    - content/tours-seed/es/karlstejn-day-trip.json
    - content/tours-seed/es/bohemian-switzerland-day-trip.json
  modified:
    - content/pages/es/services/day-trips-from-prague.json
    - content/pages/es/terms.json
decisions:
  - "Spanish place names: Dresde, Suiza Bohemia, Český Krumlov / Kutná Hora / Karlovy Vary / Karlštejn kept as the existing es catalog writes them; usted register throughout."
  - "The day-trip clause was added to section4.items[1].desc (Cancelación tardía) of the es terms, same position as EN, no digit, no key or array length change."
metrics:
  completed: 2026-11-18
status: complete
commits: 2
plan_head_before: ef1469043089e565130c12fc94dc01cf366ffb8f
plan_head_after: c1ebe54a8060be74ea2749f8691265817c1a652f
actuals:
  tokens: 17000
  tasks: 2
  commits: 2
---

# Phase 93 Plan 23: Spanish tour content Summary

Six complete Spanish tour files, translated in-session from the EN seed, plus the es hub rewrite and the es day-trip terms clause. Facts are identical to the EN source (no new claims, no prices, no hours or cancellation numbers).

## What was built

- **Task 1 (tracer)** - `content/tours-seed/es/*.json` for Dresden, Český Krumlov, Kutná Hora, Karlovy Vary, Karlštejn and Bohemian Switzerland. Every field translated (title, short description, description, highlights, itinerary, includes, excludes, pickup info, important info, FAQ, SEO title and description). Itinerary starts with the pickup and ends with the return to the same address; the chauffeur is "no es guía"; tickets, guides and meals are excluded; child seats free. Commit `4f5ae6aa`.
- **Task 2** - es hub: metadata.description, hero.intro, glance (items 0 and 3), intro paragraphs 0 and 1, features (label, headings and the first four items), steps (items 0 and 3), editorial (paragraphs 0 and 1), faqs (0, 2, 3, 4, 5), related (heading and all four links, now service pages as in EN). es terms: the day-trip sentence appended to "Cancelación tardía". All keys and array lengths unchanged. Commit `c1ebe54a`.

## Verification

- `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts`: 112 passed, 1 failed (see Deviations).
- `tests/tour-seed-content.test.ts`, `i18n-completeness`, `landing-change`, `content-locale-parity`, `legal`, `public-cancellation-wording`, `seo-snippets-no-prices`: 7 files, 823 tests passed.

## Deviations from Plan

**1. [Out of scope, reported] `tests/tour-seed.test.ts` hardcodes English-only translations.**
- **Found during:** Task 1 verification.
- **Issue:** the test "apply inserts draft tours, translations, photos..." asserts `translations.every((t) => t.locale === 'en' && t.is_complete === true)` (line 222). Any locale folder under `content/tours-seed/` (es here, and fr/ru/ar/hi/zh from the parallel plans 93-22..93-27) makes `--apply` upsert non-English rows, so the assertion fails. The seed code is right; the test assumption predates the locale plans.
- **Not fixed here:** every parallel locale plan would edit the same line and conflict on merge. The orchestrator should change it once after the merge, for example to `translations.every((t) => t.is_complete === true) && translations.some((t) => t.locale === 'en')`, and confirm that all locale rows really are complete.
- **Files:** tests/tour-seed.test.ts (untouched).

Otherwise: plan executed as written.

## Known Stubs

None.

## Threat Flags

None. T-93-82 mitigated: the es files run through the same content test as EN (no currency, no waiting model, no scarcity, rating or ride-hailing wording).

## Self-Check: PASSED

- Six es files and both edited JSON files exist and parse.
- Commits 4f5ae6aa and c1ebe54a exist; `git rev-list --count ef146904..HEAD` = 2 before this SUMMARY.
