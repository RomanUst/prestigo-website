---
phase: 93-day-trips-custom-tours
plan: 22
subsystem: tours-content
tags: [tours, seed, content, ru, i18n]
requires: ["93-21"]
provides:
  - "content/tours-seed/ru/{6 slugs}.json: complete Russian launch content"
  - "ru hub and ru terms updated for the fixed-price + hours-included model"
affects: [93-28]
key-files:
  created:
    - content/tours-seed/ru/dresden-day-trip.json
    - content/tours-seed/ru/cesky-krumlov-day-trip.json
    - content/tours-seed/ru/kutna-hora-day-trip.json
    - content/tours-seed/ru/karlovy-vary-day-trip.json
    - content/tours-seed/ru/karlstejn-day-trip.json
    - content/tours-seed/ru/bohemian-switzerland-day-trip.json
  modified:
    - content/pages/ru/services/day-trips-from-prague.json
    - content/pages/ru/terms.json
    - tests/tour-seed.test.ts
decisions:
  - "Tour files use lowercase вы and шофёр, matching the Tours namespace of messages/ru.json; the existing ru hub keeps its capitalised Вы / водитель style, so the hub edits follow the hub, not the tour files."
  - "The day-trip terms sentence was appended to section4.items[1].desc (Поздняя отмена); no key or array length changed, and the sentence has no digit."
metrics:
  completed: 2026-11-18
status: complete
commits: 2
plan_head_before: ef1469043089e565130c12fc94dc01cf366ffb8f
plan_head_after: 1ef27f3ea67359a5778272287e41d50a32a84b14
actuals:
  tokens: 36000
  tasks: 2
  commits: 2
---

# Phase 93 Plan 22: Russian tour content Summary

Six Russian tour files translated in-session from the EN seed, plus the ru hub and terms updates matching the EN rewrite of 93-21.

## What was built

- **Task 1 (tracer)** - six `content/tours-seed/ru/*.json` files, every field translated (title, short description, description, highlights, itinerary, includes, excludes, pickup info, important info, FAQ, SEO title and description). Facts are identical to the EN source: no prices, no hours or cancellation numbers, chauffeur is not a guide, tickets and guides excluded, itinerary starts with the pickup and ends with the return to the same address. Place names in the usual Russian spelling. Commit `f26b9db6`.
- **Task 2** - ru hub: metadata.description, hero.intro, glance items[0] and [3], features (label, heading and items 0-3), steps items[0] and [3], editorial paragraphs 0 and 1, faqs 0, 2, 3, 4, 5, related (heading and all four links now service pages). ru terms: the day-trip sentence appended to the Late cancellation item. Every key and array length is unchanged. Commit `1ef27f3e`.

## Deviations from Plan

**1. [Rule 1 - Bug] `tests/tour-seed.test.ts` assumed English is the only seeded locale.**
- **Found during:** Task 1 verification. The "apply inserts draft tours..." test asserted `translations.every((t) => t.locale === 'en' && ...)`, which fails as soon as any other locale folder exists.
- **Fix:** assert that `en` is among the translations and that every translation is complete.
- **Files modified:** tests/tour-seed.test.ts
- **Commit:** f26b9db6
- **Note for the orchestrator:** the other locale plans (93-23..93-27) will hit the same line in parallel; expect a trivial merge conflict on this one line, keep either version (they are equivalent).

## Verification

- `npx vitest run --exclude '.claude/**' tests/tour-seed-content.test.ts tests/tour-seed.test.ts tests/i18n-completeness.test.ts tests/landing-change.test.ts tests/content-locale-parity.test.ts tests/legal.test.ts tests/public-cancellation-wording.test.ts tests/seo-snippets-no-prices.test.ts` - 846 passed (the 8 files).
- Dresden ru title contains Cyrillic; all JSON parses.

## Known Stubs

None.

## Threat Flags

None. T-93-60 mitigated: the same content test runs on ru (no amounts, no waiting model, no scarcity, rating or ride-hailing wording) and the facts are limited to the EN source.

## Self-Check: PASSED

- Six ru seed files exist; commits f26b9db6 and 1ef27f3e exist; `git rev-list --count ef146904..HEAD` = 2 before this SUMMARY.
