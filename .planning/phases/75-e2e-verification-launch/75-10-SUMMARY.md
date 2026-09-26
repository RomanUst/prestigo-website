---
phase: 75-e2e-verification-launch
plan: 10
subsystem: i18n
tags: [next-intl, content-model, en-leak-fix, translation, route-pages, getPathname]

requires:
  - phase: 75-e2e-verification-launch (plan 06/07/08/09)
    provides: content-model + getPathname refactor pattern (golden-snapshot-first commit ordering) reused directly for the 30 route pages
  - phase: 71-content-externalization-marketing-seo-pages
    provides: content/routes/<locale>/<slug>.json content model + getRouteContent() EN-fallback loader
  - phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
    provides: '@/i18n/routing getPathname() locale-aware navigation bridge (I18N-04)'
provides:
  - "hero.imageAlt: string in all 210 content/routes/<locale>/<slug>.json files (30 slugs x 7 locales) — EN byte-identical to the prior hardcoded hero Image alt, ru/es/fr/ar/hi/zh hand-translated (ru using the correct accusative city form already established in each file's own headlineLine1)"
  - "All 30 app/[locale]/routes/prague-*/page.tsx pages route every internal href (hero CTAs, vehicle-card 'Book Online', related-route template-literal card links, final CTA) through getPathname({ locale, href }) from @/i18n/routing — closes the ~180-link locale-dropping-navigation defect (30 pages x 6 anchors each) that sent every non-EN visitor to /book, /contact, /routes instead of their own locale"
  - "RouteContent.hero.imageAlt is now a required string in lib/route-content.ts"
  - "WINDOWS #6 closed — the 9 hi route files whose whyBook.headingLine1 fell back to English ('Why book with Prestigo') now carry a translated Hindi heading with the Prestigo token kept in Latin"
  - "tests/route-hero-alt.test.ts, tests/route-locale-links.test.tsx (extended) — proof coverage for both fixes across all 30 slugs"
  - ".planning/phases/75-e2e-verification-launch/freeze/75-10.freeze — 39 pattern lines queuing this plan's translated units for the 75-18 manifest freeze"
affects: [75-18, 75-20]

actuals:
  tokens: 75600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "getPathname({ locale, href }) from @/i18n/routing is now used identically on all 30 dedicated route pages (mirrors the /routes hub pattern from 75-09) — every internal href, including template-literal /routes/${r.slug} links, goes through the bridge rather than a raw string"
    - "hero.imageAlt lives as the LAST key in each content file's hero object (after intro), preserving existing key order for every other field — added mechanically across 210 files without reformatting the rest of each file"
    - "Russian city names decline (accusative case after 'в'/'во') — hero.imageAlt's Russian translation reuses the already-translated accusative form embedded in that file's own hero.headlineLine1 rather than re-deriving a form from the nominative hero.label exonym, which would have been grammatically wrong for most cities (e.g. 'в Вена' instead of 'в Вену'). A few indeclinable/compound names use a dash form in headlineLine1 ('Прага — Ческе-Будейовице,') that is already nominative, so those fall through unchanged."
    - "es/fr/ar/hi/zh do not inflect city names after their equivalent preposition, so those five locales' hero.imageAlt reuse the nominative hero.label exonym directly — only ru needed the headlineLine1 extraction"
    - "Codemod script (scratchpad, not committed) applied the Task 1 page.tsx transformation mechanically to the remaining 29 pages after confirming byte-for-byte structural uniformity (all 30 pages had exactly 6 matching href anchors and 1 hero Image alt pattern, verified before writing the codemod)"

key-files:
  created:
    - tests/route-hero-alt.test.ts
    - .planning/phases/75-e2e-verification-launch/freeze/75-10.freeze
  modified:
    - lib/route-content.ts
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
    - app/[locale]/routes/prague-vienna/page.tsx
    - app/[locale]/routes/prague-warsaw/page.tsx
    - app/[locale]/routes/prague-wroclaw/page.tsx
    - app/[locale]/routes/prague-zlin/page.tsx
    - content/routes/en/prague-*.json (30 files)
    - content/routes/ru/prague-*.json (30 files)
    - content/routes/es/prague-*.json (30 files)
    - content/routes/fr/prague-*.json (30 files)
    - content/routes/ar/prague-*.json (30 files)
    - content/routes/hi/prague-*.json (30 files, plus whyBook.headingLine1 in 9 of them)
    - content/routes/zh/prague-*.json (30 files)
    - tests/route-locale-links.test.tsx
    - .planning/WINDOWS.md (marked entry #6 fixed)

key-decisions:
  - "Golden EN snapshot verified unchanged BEFORE any content/page edits landed (Task 1's tracer verify ran tests/route-page-render.test.tsx first) — git diff --stat on the snapshot file stayed empty through both task commits"
  - "hero.imageAlt inserted as the last hero key across all 210 files via a line-based text edit (find the intro line, splice a new line after it) rather than JSON.parse+stringify, to avoid reformatting/reordering any other field in files never otherwise touched by this plan"
  - "Russian is the only locale needing a case-form lookup (accusative) — reused the value already embedded in headlineLine1 rather than building a declension table, since that value was already professionally translated and grammatically correct in Phase 72"
  - "The 9 hi whyBook.headingLine1 fixes follow the exact phrasing pattern already used in the other 21 hi route files ('प्राग से <City> के लिए Prestigo के साथ') rather than inventing a new template, for stylistic consistency across the /routes tree"

requirements-completed: [VER-01]  # frontmatter mirrors this plan's own `requirements` field per template convention; NOT run through requirements.mark-complete here — VER-01 is shared by all 21 phase-75 plans and stays Pending in REQUIREMENTS.md until every plan finishes and the phase verifier passes

coverage:
  - id: D1
    description: "All 30 route pages render their hero image alt from content.hero.imageAlt (never a hardcoded string); EN values are byte-identical to the prior hardcoded alts and all 6 other locales carry a hand-translated alt with the same meaning"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/route-hero-alt.test.ts > hero.imageAlt — all 30 route slugs x 7 locales (75-10) (30 slugs x 7 locales non-empty check, en fixture-match check, ru/ar/hi/zh no-English-phrase check)"
        status: pass
      - kind: other
        ref: "node scripts/qa/en_leak_static.mjs --rule R2 reports zero findings under app/[locale]/routes/prague-*"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every internal link on all 30 route pages (hero CTAs, bottom CTAs, vehicle-card CTA, related-route template-literal cards) resolves through getPathname({ locale, href }) so a non-EN locale never drops its prefix"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/route-locale-links.test.tsx > All 30 route pages — locale:'ar' renders every single-slash href prefixed with /ar/ (75-10 Task 2) (30 slugs, it.each)"
        status: pass
      - kind: other
        ref: "grep -L getPathname app/[locale]/routes/prague-*/page.tsx returns no file; node scripts/qa/en_leak_static.mjs --rule R3 reports zero findings under app/[locale]/routes/prague-*"
        status: pass
    human_judgment: false
  - id: D3
    description: "The prague-vienna EN golden byte-parity snapshot in tests/route-page-render.test.tsx is unchanged after the refactor"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx > PragueViennaPage — render byte-parity proof > renders and matches the golden EN snapshot"
        status: pass
      - kind: other
        ref: "git diff --stat tests/__snapshots__/route-page-render.test.tsx.snap is empty"
        status: pass
    human_judgment: false
  - id: D4
    description: "WINDOWS #6 closed — the 9 hi route files whose whyBook.headingLine1 fell back to English now carry a Hindi heading with the Prestigo token kept verbatim in Latin"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/route-hero-alt.test.ts > WINDOWS #6 gap closure — hi whyBook.headingLine1 (75-10 Task 2) (9 slugs x 2 assertions: no-longer-EN, contains-Prestigo)"
        status: pass
    human_judgment: false
  - id: D5
    description: "RouteContent.hero.imageAlt is a required string; the loader still validates slug/locale before touching the filesystem; no empty/whitespace-only imageAlt exists in any of the 210 files"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/route-content.test.ts > getRouteContent() (path-traversal / invalid-locale guards unchanged); scratchpad validate_all.mjs run confirmed 210/210 files have a non-empty imageAlt as the last hero key"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit reports zero errors under app/[locale]/routes/prague-*"
        status: pass
    human_judgment: false

duration: 34min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 10: Route Pages — Content-Driven Hero Alt + Locale-Aware Links Summary

**All 30 intercity route pages now source their hero image alt text from translated content (closing 30 hardcoded-English `alt` leaks) and route every internal link through `getPathname()` (closing ~180 locale-dropping anchors), plus WINDOWS #6's 9 English-fallback Hindi headings — all with the EN golden byte-parity snapshot unchanged.**

## Performance

- **Duration:** 34 min (approx.)
- **Started:** 2026-09-25T14:32:00Z (approx.)
- **Completed:** 2026-09-25T15:06:24Z
- **Tasks:** 2
- **Files modified:** 244 (1 lib type, 30 pages, 210 content files, 2 test files, 1 freeze file)

## Accomplishments
- **Task 1 (tracer):** `lib/route-content.ts` gained an optional `hero.imageAlt` field; all 7 `content/routes/<locale>/prague-vienna.json` files got the field (EN byte-identical to the prior hardcoded alt; ru/es/fr/ar/hi/zh hand-translated); `app/[locale]/routes/prague-vienna/page.tsx` now renders the hero `Image alt` from content and routes all 6 internal hrefs through `getPathname({ locale, href })`; new `tests/route-locale-links.test.tsx` proved en stays unprefixed and ru gains the `/ru/` prefix everywhere, while the existing EN golden snapshot stayed byte-identical.
- **Task 2:** the exact same transformation was mechanically repeated across the other 29 route pages (confirmed byte-for-byte structurally uniform before writing the codemod — every page had exactly 6 matching href anchors and one hero `Image` alt pattern); `hero.imageAlt` was added to the remaining 203 content files (29 slugs x 7 locales); `RouteContent.hero.imageAlt` was made a required string; the 9 `hi` `whyBook.headingLine1` English-fallback headings (WINDOWS #6) were translated with the `Prestigo` token kept in Latin; `tests/route-hero-alt.test.ts` was created (30 slugs x 7 locales non-empty check, EN fixture-match, ru/ar/hi/zh no-English-phrase check, WINDOWS #6 fix verification) and `tests/route-locale-links.test.tsx` was extended with an all-30-slugs loop against `ar`; `freeze/75-10.freeze` was created with 39 pattern lines.
- Verification: `en_leak_static.mjs --rule R2` and `--rule R3` both report **zero** findings under `app/[locale]/routes/prague-*` (previously 30 R2 + 180 R3 findings per the 75-EN-LEAK-AUDIT.md baseline); `npx tsc --noEmit` clean under the route pages; the full route test suite (route-page-render, route-locale-links, route-hero-alt, routes-a/b/c, rtl-backstop, route-content) is 693/693 green.
- WINDOWS #6 marked `fixed` in `.planning/WINDOWS.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — prague-vienna content-driven alt + locale-aware links** - `94fb7b8c` (feat)
2. **Task 2: Remaining 29 route pages + 203 content alts + 9 hi headings** - `72188b8c` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

_Note: no TDD tasks in this plan (type="tracer" and type="auto"), so no separate RED/GREEN commits._

## Files Created/Modified
- `lib/route-content.ts` - `RouteContent.hero.imageAlt` (required string)
- `app/[locale]/routes/prague-*/page.tsx` (30 files) - hero `Image alt` sourced from content; all internal hrefs routed through `getPathname({ locale, href })`
- `content/routes/{en,ru,es,fr,ar,hi,zh}/prague-*.json` (210 files) - `hero.imageAlt` added as the last hero key; 9 `hi` files also got a translated `whyBook.headingLine1`
- `tests/route-locale-links.test.tsx` - en/ru tracer assertions (Task 1) + all-30-slugs `ar` loop (Task 2)
- `tests/route-hero-alt.test.ts` (new) - hero.imageAlt coverage across 30x7 + WINDOWS #6 fix verification
- `.planning/phases/75-e2e-verification-launch/freeze/75-10.freeze` (new) - 39 pattern lines for plan 75-18's manifest freeze
- `.planning/WINDOWS.md` - entry #6 marked `fixed`

## Decisions Made
- Verified structural uniformity across all 30 pages (exactly 6 matching href anchors, 1 hero alt pattern each) BEFORE writing the Task 2 codemod, so the mechanical repeat could be trusted without per-file manual review.
- Extracted the Russian accusative city form from each file's own `headlineLine1` rather than building a declension table — reuses already-professionally-translated grammar instead of guessing case endings.
- Kept the codemod script in the session scratchpad (never committed), per the plan's own instruction.
- Reused the existing hi `whyBook` phrasing pattern (`प्राग से <City> के लिए Prestigo के साथ`) for the 9 WINDOWS #6 fixes, for stylistic consistency with the other 21 already-translated hi route files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dynamic per-slug test import triggered a Vite "invalid import" warning**
- **Found during:** Task 2, first run of the extended `tests/route-locale-links.test.tsx` all-30-slugs loop
- **Issue:** `import(\`@/app/[locale]/routes/${slug}/page\`)` (no extension) produced a Vite `vite:dynamic-import-vars` warning ("A file extension must be included in the static part of the import") even though the tests passed.
- **Fix:** Added the explicit `.tsx` extension to the dynamic import specifier.
- **Files modified:** `tests/route-locale-links.test.tsx`
- **Verification:** Re-ran the suite — 32/32 tests pass with zero warnings.
- **Commit:** `72188b8c`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 — test-tooling warning cleanup). **Impact:** No scope creep; cosmetic fix to a new test file, no behavior change.

## Issues Encountered

- **Pre-existing, out-of-scope `tsc --noEmit` failures** (not introduced by this plan, files never touched by this plan): `tests/i18n-translate-dnt.test.ts` (2 errors), `tests/nav-auth.test.tsx` (5 errors), `tests/passenger-actions.test.ts` (1 error). Confirmed pre-existing via `git log -1` on those three files — last modified 2026-09-23, two days before this plan started. Zero `tsc` errors exist under any file this plan modified (`app/[locale]/routes/prague-*`, `lib/route-content.ts`). Per the deviation rules' scope boundary, these are listed, not fixed.
- **Pre-existing, out-of-scope full-suite `vitest run` failures** (5 suites, worktree-environment-specific, not introduced by this plan): `tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts` all fail with `Cannot find module '../node_modules/next-intl/dist/esm/development/server.react-server.js'` — a relative path into `node_modules` that only resolves in the main checkout, not this worktree's symlinked stub `node_modules` (the exact caveat `tests/route-page-render.test.tsx`'s own header comment documents and works around for its own file). None of the 5 failing files were touched by this plan. All 693 tests in this plan's own verification scope (route-page-render, route-locale-links, route-hero-alt, routes-a/b/c, rtl-backstop, route-content) pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 30 route pages keep visitors in their locale on every internal link, carry translated hero alts in all 7 locales, and WINDOWS #6 is closed.
- `freeze/75-10.freeze` queues this plan's translated units (30 `hero.imageAlt` + 9 `whyBook.headingLine1`) for plan 75-18's `i18n/translation-manifest.json` freeze.
- Ready for the next owning plan in `75-EN-LEAK-AUDIT.md`'s fix-plan map; the two pre-existing/unrelated issue clusters noted above (tsc errors in 3 test files; 5 worktree-environment test failures) remain for whichever plan owns them, or for the main-checkout merge to resolve naturally (the node_modules symlink issue is worktree-specific and will not reproduce after merge).

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*

## Self-Check: PASSED

All created/modified files found on disk; both task commits (`94fb7b8c`, `72188b8c`) found in git history on `worktree-agent-a9be153563776feff`.
