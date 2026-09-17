---
phase: 71-content-externalization-marketing-seo-pages
plan: 04
subsystem: content
tags: [content-model, i18n, route-pages, next-intl, seo]

# Dependency graph
requires:
  - phase: 71-01
    provides: getRouteContent/interpolate loader, content/routes/en/ pattern, prague-vienna tracer conversion
provides:
  - 9 group-C route pages (prague-ostrava, prague-pardubice, prague-passau, prague-plzen, prague-regensburg, prague-salzburg, prague-warsaw, prague-wroclaw, prague-zlin) converted onto the content model
  - tests/routes-c.test.ts covering all 9 group-C slugs (shape + EN-fallback + byte-parity)
  - CNT-01 complete across all 30 route pages (combined with plans 01-03)
affects: [phase-72-i18n-translation]

# Actuals (#2632)
actuals:
  tokens: 26000
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route page body content externalized to content/routes/en/<slug>.json, read via getRouteContent(slug, locale) + interpolate(str, prices)"
    - "30/30-verified shared chrome (CTAs, section labels, vehicle field labels) promoted to t('RoutePage.*'); any label not present in all 30 route files stays in the slug's content JSON"
    - "Routes with no day-trip section on the original page use dayTripLabel: \"\" and dayTrip.configurations: []"

key-files:
  created:
    - content/routes/en/prague-warsaw.json
    - content/routes/en/prague-wroclaw.json
    - content/routes/en/prague-zlin.json
  modified:
    - app/[locale]/routes/prague-warsaw/page.tsx
    - app/[locale]/routes/prague-wroclaw/page.tsx
    - app/[locale]/routes/prague-zlin/page.tsx
    - tests/routes-c.test.ts

key-decisions:
  - "This executor session picked up after a quota-interrupted prior run had already converted and merged 6 of the 9 group-C routes (prague-ostrava, prague-pardubice, prague-passau, prague-plzen, prague-regensburg, prague-salzburg); this session converted the 3 remaining routes (prague-warsaw, prague-wroclaw, prague-zlin) to complete the plan."
  - "prague-warsaw, prague-wroclaw, and prague-zlin never rendered a day-trip section on their original pages, so their content JSON follows the prague-ostrava/pardubice/plzen precedent: dayTripLabel: \"\" and dayTrip.configurations: []."

requirements-completed: [CNT-01]

coverage:
  - id: D1
    description: "All 9 group-C route pages (6 pre-merged + 3 converted this session) render body copy from content/routes/en/<slug>.json via getRouteContent, with no route-body prose literal remaining in any page.tsx"
    requirement: CNT-01
    verification:
      - kind: unit
        ref: "tests/routes-c.test.ts#Group C route content (71-04)"
        status: pass
      - kind: unit
        ref: "grep -RE \"const (inclusions|dayTripConfigurations|whyBook|faqs) = \\[\" app/[locale]/routes/*/page.tsx (0 matches across all 30 slug pages)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rendered English output (visible copy + FAQPage/BreadcrumbList JSON-LD + generateMetadata) is byte-for-byte unchanged for all 9 group-C routes"
    requirement: CNT-01
    verification:
      - kind: unit
        ref: "tests/routes-c.test.ts#assertRouteParity spot-checks (hero.intro, inclusions.0, faqs.1.a, cta.headingItalic, metadata.title per slug)"
        status: pass
    human_judgment: true
    rationale: "assertRouteParity spot-checks a representative field subset per slug (matching the plan's must_haves verification: backstop disposition), not a full-page render diff against the pre-conversion source; a human/visual spot-check of the live pages is the backstop for full-page byte parity."
  - id: D3
    description: "CNT-01 complete across all 30 routes: repo-wide sweep confirms zero route-body prose consts remain in any of the 30 route pages"
    requirement: CNT-01
    verification:
      - kind: unit
        ref: "grep -RE \"const (inclusions|dayTripConfigurations|whyBook|faqs) = \\[\" app/[locale]/routes/*/page.tsx — 0 matches"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-09-11
status: complete
---

# Phase 71 Plan 04: Group C Route Content Externalization Summary

**Converted the final 3 of 9 group-C routes (prague-warsaw, prague-wroclaw, prague-zlin) onto the content-model pattern, completing CNT-01 across all 30 route pages.**

## Performance

- **Duration:** 35 min (this session; 6 of 9 routes were converted and merged in a prior, quota-interrupted session)
- **Started:** 2026-09-11T03:05:00Z
- **Completed:** 2026-09-11T03:15:00Z
- **Tasks:** 1 (Task 3 of the plan; Tasks 1 and 2 completed in the prior session)
- **Files modified:** 7 (3 new content JSON, 3 page.tsx conversions, 1 test file extension)

## Accomplishments

This plan spanned two executor sessions due to a quota interruption mid-execution:

- **Prior session (Tasks 1 and 2):** Converted 6 of the 9 group-C routes — prague-ostrava, prague-pardubice, prague-passau, prague-plzen, prague-regensburg, prague-salzburg — onto the content model, each with a `content/routes/en/<slug>.json` file and a converted `page.tsx` reading via `getRouteContent` + `interpolate`. These commits (`fda49a3`, `cc6ca3e`, and salvage commit `e016002`) were merged into this session's base before it started.
- **This session (Task 3):** Converted the remaining 3 routes — prague-warsaw, prague-wroclaw, prague-zlin — completing the plan:
  - Created `content/routes/en/prague-warsaw.json`, `content/routes/en/prague-wroclaw.json`, `content/routes/en/prague-zlin.json` with every hero/narrative/inclusions/vehicle/journey/FAQ/related-route/highlight/CTA/metadata literal extracted verbatim from the pre-conversion `page.tsx` files, with prices tokenized as `€{ePrice}`, `€{sPrice}`, `€{vPrice}`.
  - Converted all 3 `page.tsx` files to read `content = getRouteContent('<slug>', locale)`, replacing prose consts with `content.*` + `interpolate(..., prices)` under identical variable names; JSX structure left untouched (D-04, no shared renderer).
  - Promoted only 30/30-verified shared chrome (hero CTAs, section labels, "Choose your vehicle", vehicle field labels, "Book Online"/"Book Now"/"All Routes", CTA footnote) to `t('RoutePage.*')`, confirmed against `messages/en.json`'s existing `RoutePage` namespace.
  - None of the 3 routes ever rendered a "Popular day-trip configurations" section, so each JSON follows the prague-ostrava/pardubice/plzen precedent: `dayTripLabel: ""` and `dayTrip.configurations: []`.
  - Extended `tests/routes-c.test.ts` with shape + EN-fallback + `assertRouteParity` blocks for all 3 slugs (36 total tests in the file now, up from 24).
  - Ran a repo-wide sweep confirming zero route-body prose consts (`inclusions`, `dayTripConfigurations`, `whyBook`, `faqs`) remain across any of the 30 route pages — **CNT-01 is now complete across all 30 routes** (combined with plans 01, 02, 03, and this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert prague-ostrava, prague-pardubice, prague-passau** - `fda49a3` (test) — prior session
2. **Task 2: Convert prague-plzen, prague-regensburg, prague-salzburg** - `cc6ca3e` (test) — prior session
   - Salvage/merge commit for the interrupted session: `e016002` (chore)
3. **Task 3: Convert prague-warsaw, prague-wroclaw, prague-zlin + final route sweep** - `43c54ef` (feat) — this session

## Files Created/Modified

**This session (Task 3):**
- `content/routes/en/prague-warsaw.json` - Hero, narrative, inclusions, journey, goodToKnow, whyBook, FAQ, related routes, highlights, CTA, metadata for the Prague–Warsaw route (no day-trip section)
- `content/routes/en/prague-wroclaw.json` - Same structure for Prague–Wrocław (no day-trip section)
- `content/routes/en/prague-zlin.json` - Same structure for Prague–Zlín (no day-trip section)
- `app/[locale]/routes/prague-warsaw/page.tsx` - Converted to read from `content` via `getRouteContent`/`interpolate`, shared chrome via `t('RoutePage.*')`
- `app/[locale]/routes/prague-wroclaw/page.tsx` - Same conversion
- `app/[locale]/routes/prague-zlin/page.tsx` - Same conversion
- `tests/routes-c.test.ts` - Extended with 12 new tests (shape, EN-fallback, byte-parity, no-day-trip assertion) for the 3 new slugs, for 36 total in the file

**Prior session (Tasks 1-2, already merged into this session's base):**
- `content/routes/en/{prague-ostrava,prague-pardubice,prague-passau,prague-plzen,prague-regensburg,prague-salzburg}.json`
- `app/[locale]/routes/{prague-ostrava,prague-pardubice,prague-passau,prague-plzen,prague-regensburg,prague-salzburg}/page.tsx`

## Decisions Made

- Picked up the plan from a quota-interrupted prior session that had already converted and merged 6 of the 9 group-C routes; this session's scope was reduced to Task 3's 3 remaining routes plus the plan-level final sweep and SUMMARY, per the calling instructions.
- Followed the prague-ostrava/pardubice/plzen precedent for routes with no day-trip section (`dayTripLabel: ""`, `dayTrip.configurations: []`) since prague-warsaw, prague-wroclaw, and prague-zlin's original `page.tsx` files never rendered a "Popular day-trip configurations" section.
- Verified the `RoutePage` namespace in `messages/en.json` (`heroCtaPrimary`, `sectionLabels.*`, `includedHeading`, `chauffeurHeading`, `vehicleFields.*`, `chooseYourVehicle`, `availableOnThisRoute`, `ctaFootnote`, `bookOnline`, `bookNow`, `allRoutes`) matched byte-for-byte against all 3 routes' pre-conversion literals before promoting to `t()` calls — no route-specific override was needed for any of these keys.

## Deviations from Plan

None - plan executed exactly as written for the remaining scope (Task 3).

## Issues Encountered

- **Pre-existing, out-of-scope test failures (not introduced by this plan):** `npx vitest run` (full suite) reports 5 failed test files — `tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts` — due to a worktree-local `node_modules` deficiency (missing `next-intl/dist/esm/development/server.react-server.js`) unrelated to route content. This was already logged in `.planning/phases/71-content-externalization-marketing-seo-pages/deferred-items.md` during plan 71-01's execution (last file touch: Phase 70-08, before Phase 71 began) and is out of scope for this plan per the deviation-rules scope boundary. `npx vitest run tests/routes-c.test.ts` — the plan's actual verification target — passes cleanly (36/36 tests, all group-C routes). Full-suite results otherwise: 1263 passed, 10 skipped, 139 todo, across 108 passed test files.
- **Grep sweep single non-slug hit (expected, not a gap):** The plan's acceptance-criteria grep (`grep -REl "const (inclusions|dayTripConfigurations|whyBook|faqs) = \[" app/[locale]/routes/`) matches one file: `app/[locale]/routes/page.tsx` — the routes **index/listing** page (not one of the 30 individual `<slug>/page.tsx` route pages CNT-01 targets). This file is pre-existing (last touched in Phase 68, unmodified by any Phase 71 plan) and out of scope — CNT-01 concerns the 30 individual route pages, all of which are confirmed clean by a scoped sweep (`grep -RE "..." app/[locale]/routes/*/page.tsx` returns 0 matches across all 30 slug directories).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CNT-01 is complete: all 30 route pages (groups A, B, C, plus the prague-vienna tracer) now serve body content from `content/routes/en/<slug>.json` via `getRouteContent` + `interpolate`, with `messages/en.json` untouched and no shared `<RoutePageBody>` renderer introduced.
- The English content baseline established across all 30 `content/routes/en/*.json` files is ready for Phase 72's translation work (ru/es/fr/ar/hi/zh locale files under `content/routes/<locale>/`), since `getRouteContent` already falls back to the `en` file for any locale without a localized file.
- No blockers.

## Self-Check: PASSED

- `content/routes/en/prague-warsaw.json` exists: FOUND
- `content/routes/en/prague-wroclaw.json` exists: FOUND
- `content/routes/en/prague-zlin.json` exists: FOUND
- `app/[locale]/routes/prague-warsaw/page.tsx` reads from `getRouteContent`: FOUND
- `app/[locale]/routes/prague-wroclaw/page.tsx` reads from `getRouteContent`: FOUND
- `app/[locale]/routes/prague-zlin/page.tsx` reads from `getRouteContent`: FOUND
- Commit `43c54ef` exists in `git log --oneline --all`: FOUND
- `npx vitest run tests/routes-c.test.ts`: 36/36 PASSED
- Repo-wide sweep across all 30 route slug pages: 0 prose-const matches (CNT-01 complete)
- `git diff --quiet messages/en.json`: clean (no changes)

---
*Phase: 71-content-externalization-marketing-seo-pages*
*Completed: 2026-09-11*
