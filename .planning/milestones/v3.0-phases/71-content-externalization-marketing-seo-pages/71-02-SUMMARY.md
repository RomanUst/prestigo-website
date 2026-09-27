---
phase: 71-content-externalization-marketing-seo-pages
plan: 02
subsystem: content-i18n
tags: [next-intl, content-model, route-pages, json, seo, jsonld]
status: complete

# Dependency graph
requires:
  - phase: 71-content-externalization-marketing-seo-pages
    plan: "01"
    provides: "getRouteContent(slug, locale) loader, interpolate() helper, RoutePage chrome namespace, tests/helpers/route-content-parity.ts, prague-vienna reference pair"
provides:
  - "content/routes/en/{prague-berlin,prague-bratislava,prague-brno,prague-budapest,prague-ceske-budejovice,prague-cesky-krumlov,prague-dresden,prague-frantiskovy-lazne,prague-graz,prague-hradec-kralove}.json — all 10 group-A route content files"
  - "10 group-A page.tsx files converted to read from content JSON via getRouteContent + interpolate"
  - "tests/routes-a.test.ts — shape/EN-fallback/byte-parity coverage for all 10 group-A slugs"
affects: [72]

# Actuals (#2632)
actuals:
  tokens: 124127
  tasks: 3
  commits: 4
  notes: "Plan executed across two separate executor sessions (weekly-limit interruption after Task 2). Actuals combine both sessions' diffs against content/routes/en/*.json + the 10 page.tsx files + tests/routes-a.test.ts."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Same content/{routes}/en/<slug>.json + getRouteContent(slug, locale) + interpolate(template, prices) pattern established by the 71-01 tracer, applied mechanically to 10 group-A routes"
    - "Page-specific non-uniform strings (Trip Configurations label, Common questions FAQ heading, per-route missing day-trip sections) kept in each route's own content JSON rather than promoted to the shared RoutePage messages namespace (Pitfall 1 discipline, re-verified per route)"

key-files:
  created:
    - content/routes/en/prague-berlin.json
    - content/routes/en/prague-bratislava.json
    - content/routes/en/prague-brno.json
    - content/routes/en/prague-budapest.json
    - content/routes/en/prague-ceske-budejovice.json
    - content/routes/en/prague-cesky-krumlov.json
    - content/routes/en/prague-dresden.json
    - content/routes/en/prague-frantiskovy-lazne.json
    - content/routes/en/prague-graz.json
    - content/routes/en/prague-hradec-kralove.json
    - tests/routes-a.test.ts
  modified:
    - app/[locale]/routes/prague-berlin/page.tsx
    - app/[locale]/routes/prague-bratislava/page.tsx
    - app/[locale]/routes/prague-brno/page.tsx
    - app/[locale]/routes/prague-budapest/page.tsx
    - app/[locale]/routes/prague-ceske-budejovice/page.tsx
    - app/[locale]/routes/prague-cesky-krumlov/page.tsx
    - app/[locale]/routes/prague-dresden/page.tsx
    - app/[locale]/routes/prague-frantiskovy-lazne/page.tsx
    - app/[locale]/routes/prague-graz/page.tsx
    - app/[locale]/routes/prague-hradec-kralove/page.tsx

key-decisions:
  - "prague-frantiskovy-lazne, prague-graz, and prague-hradec-kralove have no day-trip section in their original page.tsx (only 16/30 group-A+ routes ever had one, per 71-PATTERNS.md). Their content JSON stores dayTripLabel: '' and dayTrip.configurations: [], matching the precedent set by prague-ceske-budejovice in Task 2, rather than inventing content for a section that never existed."
  - "prague-hradec-kralove's distinct FAQ heading ('Common questions', not the shared 'Frequently asked questions') is stored directly in the existing content.faqsHeading field — RouteContent already treats faqsHeading as a page-owned string (every route reads it as content.faqsHeading, never t('...')), so no new schema field was needed to satisfy Pitfall 1 for this route."
  - "prague-hradec-kralove's page.tsx JSX intentionally omits <Reveal> wrappers around its highlights bar, fleet cards, and FAQ heading — this was the original page's own (inconsistent-with-siblings) structure, not a Wave 2 shortcut, and it was preserved verbatim per D-04 (JSX render tree untouched)."

patterns-established:
  - "Group-A conversion is now a fully proven repeatable mechanical operation: extract each literal into content/routes/en/<slug>.json (tokenizing prices as {ePrice}/{sPrice}/{vPrice}), swap the page.tsx's literal consts for content.* + interpolate() reads under identical variable names, source JSON-LD and generateMetadata from the same content object, leave alternates/JSX untouched."
---

# Phase 71 Plan 02: Route Content Externalization — Group A Summary

Converted all 10 group-A route pages (prague-berlin, -bratislava, -brno, -budapest, -ceske-budejovice, -cesky-krumlov, -dresden, -frantiskovy-lazne, -graz, -hradec-kralove) from hardcoded prose literals to the locale-aware content model (`getRouteContent` + `interpolate`), with byte-identical English output and full per-slug parity test coverage.

## Execution Note — Two Sessions

This plan was executed across two separate executor sessions due to a weekly usage-limit interruption:

- **Session 1** (commits `d599284`, `4b1db90`, plus salvage commit `1fd15c2`): converted 7 of the 10 routes — prague-berlin, prague-bratislava, prague-brno, prague-budapest, prague-ceske-budejovice, prague-cesky-krumlov, prague-dresden — and created `tests/routes-a.test.ts` with parity coverage for those 7. That work was already merged into this worktree's base branch before this session began.
- **Session 2** (this session, commit `bc7324d`): converted the 3 remaining routes — prague-frantiskovy-lazne, prague-graz, prague-hradec-kralove — and extended `tests/routes-a.test.ts` with shape/EN-fallback/parity coverage for all 3, plus a `dayTripLabel` empty-section check for each and a dedicated check confirming prague-hradec-kralove's distinct FAQ heading.

All 10 routes and both sessions' work are covered together below.

## What Was Built

For each of the 10 group-A slugs:

1. **`content/routes/en/<slug>.json`** — every route-body prose literal (hero, opening paragraphs, route narrative, inclusions, fleet/vehicles, journey timeline, good-to-know, day-trip configurations where present, chauffeur narrative, why-book items, FAQs, related routes, highlights, CTA, and `generateMetadata` title/description/OG strings) extracted verbatim, with DB-sourced prices tokenized as `{ePrice}`/`{sPrice}`/`{vPrice}`.
2. **`app/[locale]/routes/<slug>/page.tsx`** — added `getLocale`/`getTranslations` (next-intl/server) and `getRouteContent`/`interpolate` imports; replaced each literal const with a `content.*` read piped through `interpolate(..., prices)`; kept identical variable names (`inclusions`, `faqs`, `dayTripConfigurations`, `whyBook`, `relatedRoutes`, `highlights`, `vehicles`) so the JSX render tree is byte-for-byte untouched (D-04); sourced FAQPage/BreadcrumbList JSON-LD from the same `content.faqs` array feeding the visible page (no duplicate literal); sourced `generateMetadata()` title/description/OG from `content.metadata`, leaving the `alternates` canonical/x-default block hardcoded exactly as before (Pitfall 6, out of scope this phase).
3. **`tests/routes-a.test.ts`** — for every slug: `assertRouteContentShape`, an EN-fallback deep-equal check (`getRouteContent(slug, 'ru')` falls back to the `'en'` file since no `ru` content exists yet), and `assertRouteParity` on 5 representative fields captured verbatim from each route's original literals.

## Non-Uniformity Handling (Pitfall 1)

Per 71-PATTERNS.md's non-uniformity guard, page-specific strings that fail the 30/30 grep test across all route pages were kept in each route's own content JSON rather than promoted to the shared `RoutePage` messages namespace:

- **prague-berlin**: `dayTripLabel` is `"Trip Configurations"`, not the more common `"Day Trips from Prague"`.
- **prague-ceske-budejovice**, **prague-frantiskovy-lazne**, **prague-graz**, **prague-hradec-kralove**: none of these four routes ever rendered a day-trip section in the original page — `dayTripLabel: ""` and `dayTrip.configurations: []` in each content JSON, matching the absence rather than inventing content.
- **prague-hradec-kralove**: `faqsHeading` is `"Common questions"`, not the shared `"Frequently asked questions"` used by the other 9 routes — stored directly in the existing `content.faqsHeading` field (already page-owned by schema design, no `t('...')` call for this string on any group-A route).
- **prague-hradec-kralove**'s JSX also uniquely omits `<Reveal>` animation wrappers around its highlights bar, fleet cards, and FAQ heading (the original page's own pre-existing inconsistency, not introduced by this conversion) — preserved verbatim per D-04.

## Verification

- `npx vitest run tests/routes-a.test.ts` — 36 tests, all passing (shape + EN-fallback + parity + day-trip-absence + FAQ-heading checks across all 10 slugs).
- `npx vitest run` (full suite) — 106 test files / 1194 tests passing, 5 pre-existing failing files (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`) unrelated to this plan's scope — see "Known Pre-Existing Issue" below.
- `grep -REl "const (inclusions|dayTripConfigurations|whyBook|faqs|relatedRoutes|highlights|vehicles) = \[" app/[locale]/routes/prague-frantiskovy-lazne app/[locale]/routes/prague-graz app/[locale]/routes/prague-hradec-kralove` — no matches (no route-body literal consts remain).
- `grep -Rc "RoutePageBody"` on the 3 remaining routes — 0 for each (no shared renderer introduced, D-04 upheld).
- `grep -Fl "Frequently asked questions" app/[locale]/routes/prague-hradec-kralove/page.tsx` — no match (shared string not hardcoded back into the page; sourced from `content.faqsHeading` instead).
- `git diff --quiet messages/en.json` — clean (plan does not write the message catalog).

## Known Pre-Existing Issue (Not This Plan's Regression)

The full-suite run shows 5 failing test files (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`), all failing with `Cannot find module '.../node_modules/next-intl/dist/esm/development/server.react-server.js'`. This is a documented, pre-existing worktree `node_modules` deficiency (see `.planning/phases/71-content-externalization-marketing-seo-pages/deferred-items.md`, logged during 71-01, last touched by these test files in Phase 70-08) — unrelated to any file this plan modifies. No new entry was added to `deferred-items.md` since the existing entry already covers this exact failure mode.

## Deviations from Plan

None beyond the documented Pitfall-1 non-uniformity handling above, which the plan's `must_haves` explicitly anticipated (prague-berlin's "Trip Configurations" label, prague-hradec-kralove's distinct FAQ heading).

## Self-Check: PASSED

- All 10 `content/routes/en/*.json` files exist on disk (verified via file creation/edit tool state).
- All 10 `app/[locale]/routes/*/page.tsx` files converted (verified via grep checks above).
- `tests/routes-a.test.ts` extended and green (36/36 passing).
- Commits verified present: `d599284`, `4b1db90`, `1fd15c2` (Session 1, pre-existing on base branch), `bc7324d` (Session 2, this session).
