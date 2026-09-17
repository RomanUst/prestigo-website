---
phase: 71-content-externalization-marketing-seo-pages
plan: 03
subsystem: content-i18n
tags: [next-intl, content-model, route-pages, json, seo, jsonld]
status: complete

# Dependency graph
requires:
  - phase: 71-content-externalization-marketing-seo-pages
    plan: "01"
    provides: "getRouteContent(slug, locale) loader, interpolate() helper, RoutePage chrome namespace, tests/helpers/route-content-parity.ts, prague-vienna reference pair"
provides:
  - "content/routes/en/{prague-karlovy-vary,prague-krakow,prague-kutna-hora,prague-leipzig,prague-liberec,prague-linz,prague-marianske-lazne,prague-munich,prague-nuremberg,prague-olomouc}.json — all 10 group-B route content files"
  - "10 group-B page.tsx files converted to read from content JSON via getRouteContent + interpolate"
  - "tests/routes-b.test.ts — shape/EN-fallback/byte-parity coverage for all 10 group-B slugs"
affects: [72]

# Actuals (#2632)
actuals:
  tokens: 123351
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Same content/routes/en/<slug>.json + getRouteContent(slug, locale) + interpolate(template, prices) pattern established by the 71-01 tracer, applied mechanically to 10 group-B routes"
    - "Page-specific non-uniform strings (missing day-trip sections, alternating section background colors) kept in each route's own content JSON/JSX rather than promoted to the shared RoutePage messages namespace or normalized (Pitfall 1 discipline, re-verified per route)"

key-files:
  created:
    - content/routes/en/prague-karlovy-vary.json
    - content/routes/en/prague-krakow.json
    - content/routes/en/prague-kutna-hora.json
    - content/routes/en/prague-leipzig.json
    - content/routes/en/prague-liberec.json
    - content/routes/en/prague-linz.json
    - content/routes/en/prague-marianske-lazne.json
    - content/routes/en/prague-munich.json
    - content/routes/en/prague-nuremberg.json
    - content/routes/en/prague-olomouc.json
    - tests/routes-b.test.ts
  modified:
    - app/[locale]/routes/prague-karlovy-vary/page.tsx
    - app/[locale]/routes/prague-krakow/page.tsx
    - app/[locale]/routes/prague-kutna-hora/page.tsx
    - app/[locale]/routes/prague-leipzig/page.tsx
    - app/[locale]/routes/prague-liberec/page.tsx
    - app/[locale]/routes/prague-linz/page.tsx
    - app/[locale]/routes/prague-marianske-lazne/page.tsx
    - app/[locale]/routes/prague-munich/page.tsx
    - app/[locale]/routes/prague-nuremberg/page.tsx
    - app/[locale]/routes/prague-olomouc/page.tsx

key-decisions:
  - "prague-liberec, prague-marianske-lazne, and prague-olomouc have no day-trip section in their original page.tsx. Their content JSON stores dayTripLabel: '' and dayTrip.configurations: [], matching the precedent set by prague-ceske-budejovice (71-01/71-02), rather than inventing content for a section that never existed."
  - "prague-kutna-hora's original JSX omits <Reveal> wrappers around its highlights bar, fleet cards, and FAQ list; prague-marianske-lazne and prague-olomouc alternate their section background classes (bg-anthracite / bg-anthracite-mid) differently from the other 8 routes in this plan (e.g. Chauffeur/FAQ/Related Routes sections use the 'wrong' shade relative to the shared skeleton). All of this was preserved verbatim per D-04 (JSX render tree untouched) — these are the original pages' own pre-existing inconsistencies, not something introduced by this conversion."
  - "prague-munich's generateMetadata has a metadata.description distinct from its openGraph.ogDescription (the former appends 'Tolls and vignette included.'), unlike every other route in this plan where the two strings are identical. Preserved as two separate content.metadata fields rather than deduplicated."

patterns-established:
  - "Group-B conversion is the same fully proven repeatable mechanical operation used for group A: extract each literal into content/routes/en/<slug>.json (tokenizing prices as {ePrice}/{sPrice}/{vPrice}), swap the page.tsx's literal consts for content.* + interpolate() reads under identical variable names, source JSON-LD and generateMetadata from the same content object, leave alternates/JSX untouched."

requirements-completed: [CNT-01]

coverage:
  - id: D1
    description: "All 10 group-B route pages (karlovy-vary, krakow, kutna-hora, leipzig, liberec, linz, marianske-lazne, munich, nuremberg, olomouc) render their bodies from content/routes/en/<slug>.json via getRouteContent + interpolate, with byte-identical English output to the pre-conversion literals."
    requirement: CNT-01
    verification:
      - kind: unit
        ref: "tests/routes-b.test.ts#Group B route content (71-03) — byte-parity spot-check (×10)"
        status: pass
      - kind: unit
        ref: "tests/routes-b.test.ts#Group B route content (71-03) — passes assertRouteContentShape (×10)"
        status: pass
      - kind: unit
        ref: "tests/routes-b.test.ts#Group B route content (71-03) — EN-fallback deep-equal (×10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "No route-body prose literal remains in any of the 10 group-B page.tsx files; messages/en.json is untouched by this plan."
    requirement: CNT-01
    verification:
      - kind: other
        ref: "grep -REl \"const (inclusions|dayTripConfigurations|whyBook|faqs|relatedRoutes) = \\[\" across all 10 group-B route directories — no matches"
        status: pass
      - kind: other
        ref: "git diff --quiet messages/en.json"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-10
---

# Phase 71 Plan 03: Route Content Externalization — Group B Summary

Converted all 10 group-B route pages (prague-karlovy-vary, -krakow, -kutna-hora, -leipzig, -liberec, -linz, -marianske-lazne, -munich, -nuremberg, -olomouc) from hardcoded prose literals to the locale-aware content model (`getRouteContent` + `interpolate`), with byte-identical English output and full per-slug parity test coverage.

## Performance

- **Duration:** 55 min
- **Tasks:** 3
- **Files modified:** 21 (10 new content JSON files, 10 modified page.tsx files, 1 new/extended test file)

## Accomplishments
- 10 new `content/routes/en/<slug>.json` files, each holding the full route body (hero, opening paragraphs, route narrative, inclusions, fleet, journey timeline, good-to-know, day-trip configurations, chauffeur narrative, why-book, FAQ, related routes, highlights, CTA, and metadata) with prices tokenized as `{ePrice}`/`{sPrice}`/`{vPrice}`.
- 10 `page.tsx` files rewired to `getRouteContent(slug, locale)` + `interpolate(...)`, with the existing JSX render tree left completely untouched (D-04) — same variable names, same `.map()` calls, same JSON-LD wiring sourced from the same `content` object.
- `tests/routes-b.test.ts` created and extended across all 3 tasks: shape assertions, EN-fallback (`ru` deep-equals `en`, since no `ru` file exists yet), and byte-parity spot-checks (`hero.intro`, `inclusions.0`, `faqs.1.a`, `cta.headingItalic`, `metadata.title`) for all 10 slugs, plus explicit "no day-trip section" assertions for the 3 routes (liberec, marianske-lazne, olomouc) that never had one.
- Indexable/noindex split, canonical URLs, and FAQPage/BreadcrumbList JSON-LD structure preserved unchanged for all 10 routes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert prague-karlovy-vary, prague-krakow, prague-kutna-hora, prague-leipzig** - `56d0072` (feat)
2. **Task 2: Convert prague-liberec, prague-linz, prague-marianske-lazne** - `6239fae` (feat)
3. **Task 3: Convert prague-munich, prague-nuremberg, prague-olomouc** - `f921dd4` (feat)

**Plan metadata:** committed together with this SUMMARY.

## Files Created/Modified
- `content/routes/en/prague-karlovy-vary.json` through `content/routes/en/prague-olomouc.json` (10 files) — full route body content, EN only
- `app/[locale]/routes/prague-karlovy-vary/page.tsx` through `app/[locale]/routes/prague-olomouc/page.tsx` (10 files) — converted to read from content model
- `tests/routes-b.test.ts` — parity/shape/fallback test coverage for all 10 group-B slugs

## Decisions Made
- No day-trip section for prague-liberec, prague-marianske-lazne, prague-olomouc: stored as `dayTripLabel: ""` / `dayTrip.configurations: []`, matching the prague-ceske-budejovice precedent from earlier waves rather than inventing content that never existed on the original pages.
- Preserved pre-existing structural inconsistencies verbatim (prague-kutna-hora's missing `<Reveal>` wrappers in three sections; prague-marianske-lazne's and prague-olomouc's non-standard section background alternation) — these belong to D-04's "JSX render tree untouched" contract, not something this plan should normalize.
- Kept prague-munich's `metadata.description` and `metadata.ogDescription` as two distinct content fields (the description carries an extra "Tolls and vignette included." clause the OG description lacks) rather than deduplicating — matches the original page's own literals exactly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Running the full `npx vitest run` suite (Task 3's verification step) surfaces 5 pre-existing failing test files unrelated to this plan: `tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`. All 5 fail with `Cannot find module '../node_modules/next-intl/dist/esm/development/server.react-server.js'` — the `node_modules/next-intl/dist/esm/development/` directory does not exist in this worktree's dependency install. These files were last modified by Phase 70 commits (`b8185e7`, `2212d88`, `0b0b916`), long before this plan, and touch none of the files this plan modifies (route pages, route content JSON, or the parity test helper). This is a pre-existing worktree dependency-materialization gap, out of scope per the deviation rules' scope boundary (no npm install permitted in this executor). All 1227 other tests pass, including all 33 tests in `tests/routes-a.test.ts` + `tests/routes-b.test.ts` combined and every other suite in the repo. Excluding those 5 known-broken files, `npx vitest run` is green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Groups A, B are complete (20/30 route pages converted). Group C (the remaining 10 route pages, per the 71-content-externalization wave plan) and the marketing/service/legal/blog content externalization plans (71-04 through 71-09) can proceed independently — this plan touched only its declared group-B files and made no changes to `lib/route-content.ts`, `lib/content-interpolate.ts`, `messages/en.json`, or any sibling group's files.

---
*Phase: 71-content-externalization-marketing-seo-pages*
*Completed: 2026-09-10*

## Self-Check: PASSED

- All 10 `content/routes/en/<slug>.json` files exist on disk.
- `tests/routes-b.test.ts` exists on disk.
- Commits `56d0072`, `6239fae`, `f921dd4` all found in `git log`.
- `npx vitest run tests/routes-b.test.ts` — 33/33 passed.
- `npx vitest run` (full suite) — 1227 passed, 10 skipped, 139 todo, 5 pre-existing unrelated failures (documented above).
- `grep -REl` for prose-literal consts across all 10 group-B route directories — no matches.
- `git diff --quiet messages/en.json` — clean, untouched.
