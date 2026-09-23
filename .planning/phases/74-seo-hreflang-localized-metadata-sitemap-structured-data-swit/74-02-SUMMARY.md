---
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
plan: 02
subsystem: seo
tags: [nextjs, next-intl, hreflang, jsonld, i18n, route-pages]

requires:
  - phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
    provides: "getAlternates(path, opts) helper (lib/seo.ts) and buildRouteJsonLd(route, slug, opts) opts signature (lib/jsonld.ts), proven end-to-end on prague-vienna (74-01)"
provides:
  - "All 30 indexable route pages (29 prague-* pages + the /routes hub) wired to getAlternates() — no route page retains a hand-rolled { en, x-default } literal"
  - "All 29 prague-* route pages pass locale + content-sourced name/description to buildRouteJsonLd, emitting inLanguage in JSON-LD"
affects: [74-03, 74-04, 74-05, 74-06]

actuals:
  tokens: 14505
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Mechanical sweep: every prague-* page's generateMetadata now calls getAlternates('/routes/<slug>', { indexable: true, content: { kind: 'route', key: '<slug>' } })"
    - "Route body's pageSchema spread now calls buildRouteJsonLd(route, '<slug>', { locale, name: interpolate(content.metadata.title, prices), description: interpolate(content.metadata.description, prices) })['@graph'] — identical shape to the prague-vienna tracer"
    - "Hub page (/routes) passes no content ref to getAlternates — chrome-only page, all 7 locales valid"

key-files:
  created: []
  modified:
    - app/[locale]/routes/page.tsx
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
    - app/[locale]/routes/prague-ostrava/page.tsx
    - app/[locale]/routes/prague-pardubice/page.tsx
    - app/[locale]/routes/prague-passau/page.tsx
    - app/[locale]/routes/prague-plzen/page.tsx
    - app/[locale]/routes/prague-regensburg/page.tsx
    - app/[locale]/routes/prague-salzburg/page.tsx
    - app/[locale]/routes/prague-warsaw/page.tsx
    - app/[locale]/routes/prague-wroclaw/page.tsx
    - app/[locale]/routes/prague-zlin/page.tsx

key-decisions:
  - "All 29 prague-* page.tsx files were byte-identical in structure and import order for the alternates block and buildRouteJsonLd call site, so the sweep was done via a verified Python script that asserted the exact pre-existing block text before replacing it (fails loudly on any mismatch) rather than a hand-edit per file — same mechanical-sweep pattern Phase 73 used at this scale"
  - "Hub page (/routes) received getAlternates('/routes', { indexable: true }) with no content ref per the plan's literal instruction, matching the 74-01 precedent for chrome-only pages"

requirements-completed: [SEO-01, SEO-04]

coverage:
  - id: D1
    description: "All 29 prague-* route pages and the /routes hub call getAlternates() in generateMetadata; no hand-rolled 'x-default' literal remains anywhere under app/[locale]/routes"
    requirement: "SEO-01"
    verification:
      - kind: other
        ref: "grep -rl \"'x-default'\" app/[locale]/routes | wc -l -> 0"
        status: pass
      - kind: unit
        ref: "tests/route-page-render.test.tsx (prague-vienna + prague-berlin render assertions)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 29 prague-* route pages pass locale + content-sourced name/description to buildRouteJsonLd, emitting inLanguage; EN structured data unchanged apart from inLanguage"
    requirement: "SEO-04"
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueViennaPage — render byte-parity proof"
        status: pass
      - kind: unit
        ref: "tests/jsonld.test.ts#buildRouteJsonLd — inLanguage + locale-conditional name/description"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-09-23
status: complete
---

# Phase 74 Plan 02: Route Pages hreflang + JSON-LD inLanguage Sweep Summary

**Swept all 30 indexable route pages (29 `prague-*` pages + the `/routes` hub) onto the Wave-1 `getAlternates()`/`buildRouteJsonLd` opts contract — every route page now emits its hreflang cluster and localized JSON-LD `inLanguage` from the single centralized helper, with zero hand-rolled `x-default` literals remaining.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 completed
- **Files modified:** 30 (1 hub + 29 `prague-*` route pages)

## Accomplishments

- Task 1: replaced the hand-rolled `{ canonical, languages: { en, x-default } }` alternates block in all 29 `prague-*` pages' `generateMetadata` with `getAlternates('/routes/<slug>', { indexable: true, content: { kind: 'route', key: '<slug>' } })`, and the `/routes` hub with `getAlternates('/routes', { indexable: true })` (no content ref — chrome-only page)
- Task 2: wired all 29 `prague-*` pages' `buildRouteJsonLd(route, '<slug>')` call to the extended 3-arg form — `buildRouteJsonLd(route, '<slug>', { locale, name: interpolate(content.metadata.title, prices), description: interpolate(content.metadata.description, prices) })` — adding `inLanguage` to each page's Service JSON-LD node
- Verified mechanically: `grep -rl "getAlternates(" app/[locale]/routes` returns all 31 page.tsx files (30 swept in this plan + prague-vienna from 74-01); `grep -rl "'x-default'"` returns 0 hits anywhere under `app/[locale]/routes`
- No price, `priceValidUntil`, `@id`, `url`, or breadcrumb data touched — diffs are uniform +8/-1 (Task 2) and +5/-7 (Task 1, net of the extra import line) per file, confirmed via `git diff --stat`

## Task Commits

1. **Task 1: Alternates sweep across all 30 route pages** - `e6b8b24` (feat)
2. **Task 2: JSON-LD inLanguage on all 29 prague-* route pages** - `e1b4744` (feat)

## Files Created/Modified

- `app/[locale]/routes/page.tsx` - Hub page: `alternates` now delegates to `getAlternates('/routes', { indexable: true })`
- `app/[locale]/routes/prague-*/page.tsx` (29 files) - Each: `generateMetadata`'s `alternates` now calls `getAlternates('/routes/<slug>', { indexable: true, content: { kind: 'route', key: '<slug>' } })`; page body's `buildRouteJsonLd` call now passes `{ locale, name, description }` opts

## Decisions Made

- **Verified mechanical sweep via script, not per-file hand edits.** All 29 `prague-*` page.tsx files shared byte-identical import ordering and an identical alternates-block / `buildRouteJsonLd` call-site shape (confirmed via grep across all files before editing). Used a Python script that asserts the exact pre-existing text block before replacing it — any single file that didn't match the expected shape would have caused the script to fail loudly (`sys.exit(1)`) rather than silently skip or corrupt a file. This matches the plan's own guidance ("homogeneous mechanical sweep... same shape as Phase 73's 30-32-file sweeps").
- **Hub page treated as chrome-only** (no `content` ref passed to `getAlternates`), consistent with the 74-01 precedent for `/fleet`, `/book`, etc.

## Deviations from Plan

None — plan executed exactly as written. No architectural changes, no missing-package installs, no auth gates.

## Issues Encountered

- Worktree `node_modules` was absent — symlinked to the main checkout's `node_modules` per the worktree execution protocol (not committed).
- Confirmed the same 5 pre-existing worktree-only test failures documented in 74-01-SUMMARY.md (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts` — all fail on a `next-intl/server` react-server relative-path resolution issue specific to symlinked worktree `node_modules`). None of these files touch anything modified by this plan (confirmed via grep — zero hits for `seo`/`jsonld`/`routes` imports relevant to this sweep). Out of scope per the Scope Boundary rule.
- Full suite run: 122 test files passed / 5 failed (the pre-existing worktree-only failures above) / 4 skipped; 1575 tests passed / 10 skipped / 139 todo. All route-page, jsonld, and seo suites green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 30 indexable route pages now emit a centralized, index/translation-aware hreflang cluster and localized `inLanguage` JSON-LD — SEO-01 and SEO-04 are complete for the entire `/routes/*` surface.
- The remaining Wave-2 plans (74-03 through 74-06) can proceed independently against the same proven `getAlternates`/`buildRouteJsonLd` contract for their own call sites (pages, blog, services, etc.).
- No blockers for subsequent plans.

---
*Phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit*
*Plan: 02*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 30 modified files verified present on disk. Both task commits (`e6b8b24`, `e1b4744`) verified present in `git log`. `grep -rl "'x-default'" app/[locale]/routes` returns 0. `npx vitest run tests/route-page-render.test.tsx tests/jsonld.test.ts tests/seo.test.ts` — 21/21 tests pass. Full suite: 1575 tests pass, only the 5 known pre-existing worktree-only suites fail (unrelated to this plan's files).
