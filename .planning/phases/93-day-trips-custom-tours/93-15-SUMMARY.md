---
phase: 93-day-trips-custom-tours
plan: 15
subsystem: seo
tags: [sitemap, hreflang, tours, route-links, content-cleanup]
requires: [93-05, 93-11, 93-21, 93-27]
provides:
  - "async app/sitemap.ts with published-tour rows per complete locale"
  - "lib/tours/route-links.ts (tourSlugForRoute, routeSlugForTour)"
  - "components/tours/RouteTourLink.tsx on four route pages"
affects: [93-28]
tech-stack:
  added: []
  patterns: ["DB-backed sitemap rows via getAlternates availableLocales", "store errors collapse to no rows"]
key-files:
  created:
    - lib/tours/route-links.ts
    - components/tours/RouteTourLink.tsx
    - tests/tour-sitemap.test.ts
    - tests/tour-route-links.test.tsx
  modified:
    - app/sitemap.ts
    - tests/sitemap.test.ts
    - tests/seo-volume-pages.test.ts
    - app/[locale]/routes/prague-dresden/page.tsx
    - app/[locale]/routes/prague-cesky-krumlov/page.tsx
    - app/[locale]/routes/prague-kutna-hora/page.tsx
    - app/[locale]/routes/prague-karlovy-vary/page.tsx
  deleted:
    - "content/pages/{en,ru,es,fr,ar,hi,zh,zh-hant}/services/{cesky-krumlov,kutna-hora,karlovy-vary,dresden}-day-trip.json (32 files)"
decisions:
  - "Route-page link sits after the day-trip footnote (not between intro and grid) to keep the existing spacing; it is still inside the day-trip section"
  - "A locale without a complete tour translation links to the EN tour page"
status: complete
commits: 3
plan_head_before: 74141937db34bd3f957cff9fc6dabcd4db5079f3
plan_head_after: 38c9a8d2d0f23c71f6c87bdc38364c5123335631
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
requirements: [TRIP-01]
---

# Phase 93 Plan 15: Sitemap, route-tour links, retired JSON removal Summary

Published tours now appear in the sitemap once per complete locale (hreflang cluster = complete locales + x-default, lastmod from `tours.updated_at`), four route pages link to their day-trip tour, and the 32 retired day-trip landing JSON files are gone.

## Tasks

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | 315cb0d0 | `app/sitemap.ts` default export is async; `entry()` takes `availableLocales` and `lastModified`; tour rows come from `getPublishedTourLocales()` in a try/catch to `[]`. |
| 2 | 6c673b3a | `lib/tours/route-links.ts` helpers; `RouteTourLink` server component renders the `Tours.page.routeToTour` line; wired into Dresden, Cesky Krumlov, Kutna Hora, Karlovy Vary. |
| 3 | 38c9a8d2 | `git rm` of 4 slugs x 8 locales. Hub `day-trips-from-prague.json` kept. |

## Verification

- `tests/sitemap.test.ts`, `tests/tour-sitemap.test.ts`, `tests/seo-volume-pages.test.ts`: green (tracer: en / ru / x-default cluster for a tour with complete en + ru; empty or throwing store gives no tour rows and the hub stays).
- `tests/tour-route-links.test.tsx` + routes-a/b/c + route-metadata-seo: 155 passed.
- After the deletion: seo-volume-pages, tour-pages, i18n-freeze-manifest, sitemap, tour-seed, tour-seed-content, public-cancellation-wording, seo: 471 passed.
- `npx tsc --noEmit`: no errors outside `tests/` baseline. eslint --quiet clean on touched files.
- Live sitemap URLs not checkable here: tours are seeded live in 93-28.

## Deviations from Plan

**1. [Rule 3 - Blocking] tests/seo-volume-pages.test.ts updated to await sitemap()**
- Issue: it called `sitemap()` synchronously; the async default export broke it.
- Fix: `await` in the one sitemap test. File was not in `files_modified`.
- Commit: 315cb0d0

**2. Design choice: RouteTourLink component instead of inline store reads in each page**
- The plan said each page reads the published list in a try; the shared component does that once (store failure renders nothing). Pages only import and place it. `app/[locale]/routes/[slug]/page.tsx` was NOT changed: the four destinations render through their own folder pages; the dynamic template only serves inbound mirror routes ({city} to Prague), which are not "from Prague" day trips.

**3. Retired-file readers**
- Grep over lib, app, components, scripts, i18n, middleware, tests found no reader of the deleted JSON files and no manifest/list entry. Directory-walking tests simply see fewer files. Nothing needed updating.

## Known Stubs

None.

## Threat Flags

None. T-93-39 (drafts in sitemap) and T-93-40 (sitemap build without env) are covered by `getPublishedTourLocales` filtering plus the empty-store and throwing-store tests.

## Self-Check: PASSED

- FOUND: lib/tours/route-links.ts, components/tours/RouteTourLink.tsx, tests/tour-sitemap.test.ts, tests/tour-route-links.test.tsx
- FOUND commits: 315cb0d0, 6c673b3a, 38c9a8d2
- 32 retired files absent; `content/pages/en/services/day-trips-from-prague.json` present
