---
phase: 93-day-trips-custom-tours
plan: 11
subsystem: tour-public-page
tags: [tours, seo, jsonld, hreflang, isr, i18n]
status: complete
requires: ["93-05", "93-02"]
provides:
  - "app/[locale]/services/[slug]/page.tsx: landing-or-tour resolution, 307 redirect for incomplete locales, tour metadata"
  - "lib/tours/jsonld.ts: buildTourJsonLd, safeJsonLd"
  - "lib/seo.ts getAlternates option availableLocales"
  - "components/tours/TourPageView.tsx with slots gallery, bookingBox, stickyBar, compactCustom, related, band, credits"
affects: [93-12, 93-13, 93-14]
tech-stack:
  added: []
  patterns: ["one async server component builds the Tours translator, sync sub-components take it as a prop", "client islands only for FAQ accordion and read-more, labels passed as props"]
key-files:
  created:
    - app/[locale]/services/[slug]/loading.tsx
    - lib/tours/jsonld.ts
    - components/tours/TourPageView.tsx
    - components/tours/TourKeyFacts.tsx
    - components/tours/TourSections.tsx
    - components/tours/TourFaq.tsx
    - components/tours/TourReadMore.tsx
    - components/tours/tour-t.ts
    - tests/tour-pages.test.tsx
    - tests/tour-jsonld.test.ts
    - tests/__snapshots__/tour-jsonld.test.ts.snap
  modified:
    - app/[locale]/services/[slug]/page.tsx
    - lib/landing-pages.ts
    - lib/seo.ts
    - tests/seo.test.ts
    - tests/seo-volume-pages.test.ts
decisions:
  - "Slot areas are implemented as 12-column grid placement (col-span-8 / col-span-4, DOM order lead, box, body) instead of CSS grid-template-areas; same visual result, DOM order equals mobile order; data-area attributes mark lead/box/body."
  - "Read more below 640px is decided by a server-side length heuristic (more than 300 characters) so server and client markup match; the clamp is max-height 10.5em, not line-clamp, because line-clamp is unreliable across several <p> children."
  - "The aside (booking box) renders only when a bookingBox or compactCustom slot is passed; no id=book is set here, plan 93-13 owns it."
  - "Tour metadata uses a plain title (no absolute), matching the previous landing pages."
metrics:
  completed: 2026-11-18
actuals:
  tokens: 26000
  tasks: 3
  commits: 3
plan_head_before: 36e0c261d15b2525161a34ef45ccdc45a3f4fc13
plan_head_after: 22c13ae5cb2c73fc79e8e8e376eb9116df616d0d
---

# Phase 93 Plan 11: Tour page under the existing URLs Summary

`/services/<slug>-day-trip` now resolves a landing page first (the hub stays one, D-25), else a published tour from the database, else 404; an incomplete locale answers 307 to the EN URL; the page renders breadcrumb, facts and all content sections from the row, with TouristTrip JSON-LD carrying the live DB prices and hreflang listing only complete locales.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | [slug] resolves landing or tour, redirect for incomplete locale, sections from the database | ff1a9557 |
| 2 | TouristTrip JSON-LD, safeJsonLd, availableLocales hreflang (`security:`) | 3f1a44af |
| 3 | Guard contract tests (localized chrome, logical-direction source) | 22c13ae5 |

## Verification

- `npx vitest run --exclude '.claude/**'` on tour-pages (27), tour-jsonld (9), seo, jsonld, route-metadata-seo, sitemap, seo-snippets-no-prices, seo-volume-pages, fleet-vehicle-pages: all green.
- `npx tsc --noEmit`: only the 8-error tests/ baseline. `npx eslint --quiet` on all touched paths: exit 0.
- No `€` literal in app/ or components/ touched files; priceValidUntil is normalized in the JSON-LD snapshot.
- next-intl/server is mocked in tests with the real use-intl translator over the real catalogs (en, ru, ar) so ICU plurals and rich tags are exercised; it loaded fine in the worktree. The orchestrator should re-run after merge.

## Deviations from Plan

**1. [Rule 3 - Blocking] tests/seo-volume-pages.test.ts link check.** The hub copy still links to `/services/<x>-day-trip`; after removing those slugs from LANDING_PAGES the link-integrity loop failed. Links to `-day-trip` services URLs are now accepted as DB tours (D-07), and a test asserts the hub stays and no `-day-trip` slug is listed.

**2. Extra files.** `TourFaq.tsx`, `TourReadMore.tsx` (client islands) and `tour-t.ts` (translator type and text helpers) were added to `components/tours/`; they were not in the plan's file list but belong to its scope.

## Known Stubs / Follow-ups

- **Sitemap:** removing the four tour slugs from LANDING_PAGES drops them from `app/sitemap.ts` until the sitemap plan adds `getPublishedTourLocales()` rows (RESEARCH "Sitemap / hreflang"). Not touched here.
- **Hub copy:** `content/pages/*/services/day-trips-from-prague.json` still names the four destinations; its rewrite belongs to a later plan.
- **Human check not run:** the 360px ru/hi browser check (Task 3 human-check) needs a published tour in the database and Supabase env, neither available in the worktree. Left for the orchestrator or UAT.
- Slots (gallery, bookingBox, stickyBar, compactCustom, related, band, credits) are empty; plans 93-12/13/14 fill them from page.tsx.

## Threat Flags

None beyond the plan's threat model; T-93-29 (script-safe JSON-LD, tested with a script-breaking payload and U+2028/9), T-93-30 (redirect only after the slug matches TOUR_SLUG_PATTERN, target built with getPathname for 'en'), T-93-31 (store readers return published and complete content only; hreflang lists only complete locales), T-93-32 (Offer prices from the DB row, snapshot normalizes priceValidUntil) are mitigated.

## Self-Check: PASSED

All created files exist; commits ff1a9557, 3f1a44af, 22c13ae5 are in `git log`.
