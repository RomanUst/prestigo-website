---
phase: 93-day-trips-custom-tours
plan: 26
subsystem: tours-content
tags: [tours, seed, content, i18n, hindi, hub, terms]
requires: ["93-21"]
provides:
  - "content/tours-seed/hi/{6 slugs}.json: complete Hindi (Devanagari) launch content"
  - "hi hub copy and hi terms day-trip clause matching the EN rewrite of 93-21"
affects: [93-28]
key-files:
  created:
    - content/tours-seed/hi/dresden-day-trip.json
    - content/tours-seed/hi/cesky-krumlov-day-trip.json
    - content/tours-seed/hi/kutna-hora-day-trip.json
    - content/tours-seed/hi/karlovy-vary-day-trip.json
    - content/tours-seed/hi/karlstejn-day-trip.json
    - content/tours-seed/hi/bohemian-switzerland-day-trip.json
  modified:
    - content/pages/hi/services/day-trips-from-prague.json
    - content/pages/hi/terms.json
    - tests/tour-seed.test.ts
decisions:
  - "Terminology follows the Tours namespace of messages/hi.json: chauffeur as शोफ़र in the tour files, Czech place names transliterated as in the existing hi pages (चेस्की क्रुमलोव, कुत्ना होरा, कार्लोवी वारी, ड्रेसडेन); the hub keeps its existing 'ड्राइवर' wording to stay consistent with its untouched sections."
  - "The terms clause was appended to section4.items[1].desc (late cancellation), as 93-21 did for EN, with no digit in it."
metrics:
  completed: 2026-11-18
status: complete
commits: 2
plan_head_before: ef1469043089e565130c12fc94dc01cf366ffb8f
plan_head_after: 3fb9388671356b70579ed6d900903b9eba94b428
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
---

# Phase 93 Plan 26: Hindi tour content Summary

Six Hindi tour files (Devanagari, written in-session from the EN seed), plus the hi hub and terms updated to the fixed-price + hours-included model.

## What was built

- **Task 1 (tracer)** - the six `content/tours-seed/hi/*.json` files, every field translated (title, descriptions, highlights, itinerary, includes/excludes, pickup and important info, FAQ, SEO). Facts are identical to the EN source: no prices, no hours-included or cancellation numbers, chauffeur is not a guide, tickets and guides excluded, itinerary starts with the pickup and ends with the return to the same address. Commit `dd4cdb80`.
- **Task 2** - the hi hub mirrors the EN rewrite (metadata.description, hero.intro, glance items 0 and 3, intro paragraphs 0 and 1, all features, steps 0 and 3, editorial 0 and 1, faqs 0/2/3/4/5, related heading and four links now pointing at service pages); the day-trip clause was appended to the hi terms `section4.items[1].desc`. All keys and array lengths unchanged. Commit `3fb93886`.

## Verification

`npx vitest run --exclude '.claude/**'` on tour-seed-content, tour-seed, i18n-completeness, landing-change, content-locale-parity, legal, public-cancellation-wording and seo-snippets-no-prices: 8 files, 846 tests passed. Devanagari check on the title and short description is part of the seed completeness rule and passes for all six files.

## Deviations from Plan

**1. [Rule 3 - Blocking] `tests/tour-seed.test.ts` assumed English was the only seeded locale.**
- **Found during:** Task 1 verify.
- **Issue:** the "apply inserts draft tours..." test asserted `translations.every(t => t.locale === 'en' && ...)`, which fails as soon as any non-EN locale folder exists, so it blocks every locale plan (93-22..93-27), not only this one.
- **Fix:** the assertion now requires an `en` translation to be present and every seeded translation (any locale) to be `is_complete`.
- **Files modified:** tests/tour-seed.test.ts
- **Commit:** dd4cdb80
- **Merge note for the orchestrator:** the other locale executors run in parallel and face the same failure; if they edited the same line differently, expect a trivial conflict on that one assertion. Either resolution is fine as long as it no longer pins `locale === 'en'`.

## Known Stubs

None.

## Threat Flags

None. T-93-84 is mitigated by the shared content test running on hi (no currency, waiting model, scarcity, rating or ride-hailing wording).

## Self-Check: PASSED

- All six hi seed files exist; hub and terms JSON parse.
- Commits dd4cdb80 and 3fb93886 exist; `git rev-list --count ef146904..HEAD` = 2 before this SUMMARY.
