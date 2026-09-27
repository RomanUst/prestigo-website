---
phase: 75-e2e-verification-launch
plan: 07
subsystem: i18n
tags: [next-intl, content-model, en-leak-fix, translation, multi-day-page]

requires:
  - phase: 75-e2e-verification-launch (plan 02)
    provides: 75-EN-LEAK-AUDIT.md pre-fix inventory identifying /book/multi-day (app/[locale]/book/multi-day/page.tsx) as a whole-EN chrome leak owned by this plan
  - phase: 75-e2e-verification-launch (plan 06)
    provides: the /book content-model refactor pattern (golden-snapshot-first commit ordering, structural+DNT parity test shape, dayTypeLabels-style structural/translated split) reused directly for this plan
  - phase: 71-content-externalization-marketing-seo-pages
    provides: content/pages/<locale>/<page>.json content model + getPageContent() EN-fallback loader (nested-key support already validated for 'book/multi-day')
provides:
  - "content/pages/{en,ru,es,fr,ar,hi,zh}/book/multi-day.json — every visible EN string on /book/multi-day (hero, 'Everything included', 'How it works' steps, the 6 EXAMPLES itineraries, 'Example itineraries' heading/intro, FAQ, 'Build your itinerary' block, both image alt texts, metadata/OG) moved verbatim into EN, hand-translated into all 6 other locales"
  - "app/[locale]/book/multi-day/page.tsx wired to getPageContent('book/multi-day', locale) with params-derived locale in both generateMetadata and the page body; content: { kind: 'page', key: 'book/multi-day' } makes the hreflang cluster translation-aware (Phase 74 D-07)"
  - "TRANSFER/HOURLY example-day badge text translated per locale via examples.dayTypeLabels, reusing the exact terms already established in messages/*.json's Booking.dayCard.transferTab/hourlyTab, closing a badge-level EN leak the plan's must_haves did not explicitly name but the phase's overall EN-leak objective requires"
  - "tests/multi-day-page-render.test.tsx — EN golden byte-parity snapshot, ru/ar/hi real-render assertions, and a structural+DNT parity block across all 6 non-EN locales"
  - ".planning/phases/75-e2e-verification-launch/freeze/75-07.freeze — content/pages/en/book/multi-day.json queued for the plan 75-18 manifest freeze"
affects: [75-18, 75-20]

actuals:
  tokens: 40600
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Structural config split, extended from 75-06: EXAMPLE_DAYS (day number + TRANSFER/HOURLY type per itinerary) stays a code-level array of arrays zipped by index with the translated examples.items[i].daySummaries catalog array; the 4 how-it-works step numbers ('01'-'04') stay a flat code array zipped with howItWorks.steps (Phase 69 convention, reused verbatim from 75-06's /book refactor)"
    - "Structural-enum-with-translated-label split: the TRANSFER/HOURLY day-type badge stays a structural code-level union ('TRANSFER' | 'HOURLY') used only as an object key, while the displayed badge text is looked up per locale via examples.dayTypeLabels[d.type] — reusing messages/*.json's Booking.dayCard.transferTab/hourlyTab values verbatim so the same UI concept is never translated twice with two different results"
    - "{day} plain-string placeholder (not next-intl ICU) for the DAY {n} badge label, replaced via String.prototype.replace at render time — appropriate here because the page has no i18n framework dependency, only getPageContent()'s plain JSON lookup"
    - "Structural+DNT-only parity test extended with a per-locale identical-value exemption list (PER_LOCALE_IDENTICAL_EXEMPTIONS), narrower than the global DNT_TOKENS list, to allow hi's intentional Latin-script 'TRANSFER' badge (matching established precedent) without loosening the byte-identical check for the other 5 locales that correctly translate it"
    - "Golden-snapshot-first commit ordering (75-06 pattern): the byte-parity snapshot test is written and committed against the unchanged, still-hardcoded page before any refactor commit, so git history itself proves the 'before' baseline rather than relying on the test result alone"

key-files:
  created:
    - content/pages/en/book/multi-day.json
    - content/pages/ru/book/multi-day.json
    - content/pages/es/book/multi-day.json
    - content/pages/fr/book/multi-day.json
    - content/pages/ar/book/multi-day.json
    - content/pages/hi/book/multi-day.json
    - content/pages/zh/book/multi-day.json
    - tests/multi-day-page-render.test.tsx
    - tests/__snapshots__/multi-day-page-render.test.tsx.snap
    - .planning/phases/75-e2e-verification-launch/freeze/75-07.freeze
  modified:
    - app/[locale]/book/multi-day/page.tsx

key-decisions:
  - "Golden EN snapshot committed in its own commit before touching page.tsx (git log shows c17c9507 test commit predating 89badc85 refactor commit), matching the plan's own acceptance criterion requiring git history to prove snapshot-before-refactor ordering"
  - "Moved the TRANSFER/HOURLY example-day badge text into content.examples.dayTypeLabels even though the plan's must_haves list didn't explicitly name it, because leaving it hardcoded in English would have contradicted the phase's own 'no English outside the allowlist in any locale' success criterion and this page's whole raison d'etre (closing an EN leak); reused messages/*.json's Booking.dayCard.transferTab/hourlyTab values verbatim rather than inventing a second translation for the same UI concept"
  - "Kept the day number + TRANSFER/HOURLY type as a code-level structural array (EXAMPLE_DAYS) zipped by index with the translated daySummaries — the day count and type sequencing themselves are itinerary facts, not prose, matching the Phase 69 convention's own boundary between structural and translatable data"
  - "Used a per-locale identical-value exemption list in the parity test (not a global DNT token) for hi's intentional Latin-script 'TRANSFER' — a global exemption would have silently hidden a real leak if any other locale had left the badge untranslated"
  - "generateMetadata now passes content: { kind: 'page', key: 'book/multi-day' } to getAlternates — /book/multi-day's hreflang cluster is translation-aware (Phase 74 D-07) instead of the pre-existing 'chrome-only, all locales assumed valid' behavior; harmless since all 7 locale files exist by the end of Task 2"
  - "Left the getPathname requirement as a documented no-op: the page body has no internal <a href> links (Nav/Footer are separate, untouched components), so there is nothing to route through getPathname on this page"
  - "Service/Breadcrumb JSON-LD (businessNodeDoc + breadcrumbSchema) left English by design, unchanged — Phase 74 D-09; no FAQPage JSON-LD exists on this page today, so the plan's conditional 'if the page emits FAQ structured data, build it from content.faq.items' is a no-op, matching 75-06's identical finding for /book"

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "/book/multi-day hero, included, how-it-works, examples (including day-type badges), FAQ, builder block and metadata/OG sourced from content/pages/<locale>/book/multi-day.json via getPageContent('book/multi-day', locale); EN render byte-identical to the pre-refactor golden snapshot"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/multi-day-page-render.test.tsx > MultiDayPage — render byte-parity proof (EN golden) > renders and matches the golden EN snapshot"
        status: pass
      - kind: other
        ref: "grep -c \"Example itineraries\" app/[locale]/book/multi-day/page.tsx == 0 (string exists only in content/pages/en/book/multi-day.json); grep -n \"key: 'book/multi-day'\" app/[locale]/book/multi-day/page.tsx matches"
        status: pass
    human_judgment: false
  - id: D2
    description: "ru render shows the translated first example itinerary title and first FAQ question with zero EN leakage (title, question, or the 'Example itineraries' heading)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/multi-day-page-render.test.tsx > MultiDayPage — ru render shows localized content, not EN (VER-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "es/fr/ar/hi/zh translations exist with exact EN key set/leaf types/array lengths (6 examples, 6 FAQ items), every DNT token (PRESTIGO, E-Class/S-Class/V-Class, {day}) reproduced verbatim, and ar/hi render their localized first example title with zero EN leakage"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/multi-day-page-render.test.tsx > book/multi-day.json — structural + DNT parity across all 6 non-EN locales (it.each ru/es/fr/ar/hi/zh)"
        status: pass
      - kind: unit
        ref: "tests/multi-day-page-render.test.tsx > MultiDayPage — ar and hi render show the localized first example title (VER-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "freeze/75-07.freeze queues content/pages/en/book/multi-day.json for the plan 75-18 translation-manifest freeze"
    requirement: VER-01
    verification:
      - kind: other
        ref: "test -s .planning/phases/75-e2e-verification-launch/freeze/75-07.freeze"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 07: /book/multi-day Content-Model Localization Summary

**Every visible English string on `/book/multi-day` — hero, "Everything included", "How it works" steps, the 6 EXAMPLES itineraries (including the TRANSFER/HOURLY day-type badges), FAQ, "Build your itinerary" block, both image alt texts, and metadata/OG — moved into `content/pages/<locale>/book/multi-day.json` and hand-translated into all 6 non-EN locales, closing the known whole-page `/book/multi-day` EN-leak with a proven byte-identical EN baseline.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-25T15:10:00+02:00 (approx.)
- **Completed:** 2026-09-25T15:28:26+02:00
- **Tasks:** 2
- **Files modified:** 11 (1 modified, 10 created)

## Accomplishments
- `tests/multi-day-page-render.test.tsx`: golden EN snapshot committed **before** any refactor (`c17c9507`), then extended with a ru real-render assertion, a structural+DNT parity block across all 6 non-EN locales, and ar/hi real-render assertions (10 tests total, all passing).
- `content/pages/en/book/multi-day.json`: every visible EN string outside `MultiDayForm` — hero label/two-line headline/two intro paragraphs, 8 "Everything included" items, "How it works" label + 4 steps, "Example itineraries" heading/intro + 6 itineraries (title, subtitle, description, per-day summaries) + the TRANSFER/HOURLY badge labels, 6 FAQ items, "Build your itinerary" heading/intro, and both image alt texts, plus metadata title/description/ogTitle/ogDescription — moved verbatim, converting the two plain-JSX-text `&rsquo;` entities to their literal Unicode `’` character (75-06's entity-decoding convention: `{expr}` interpolation does not decode HTML entities the way JSX text children did).
- `app/[locale]/book/multi-day/page.tsx`: `generateMetadata` and `MultiDayPage` both resolve `{ locale } = await params` and call `getPageContent('book/multi-day', locale)`; `getAlternates` now receives `content: { kind: 'page', key: 'book/multi-day' }`, making the hreflang cluster translation-aware. Day numbers and TRANSFER/HOURLY type per example stay a structural code array (`EXAMPLE_DAYS`) zipped by index with the translated `daySummaries` catalog; the 4 how-it-works step numbers (`01`–`04`) stay a flat structural array zipped with `howItWorks.steps` (Phase 69 convention, reused from 75-06). The TRANSFER/HOURLY badge text itself is looked up via `examples.dayTypeLabels[d.type]`, reusing `messages/*.json`'s `Booking.dayCard.transferTab`/`hourlyTab` values verbatim. Service/Breadcrumb JSON-LD stays English by design (Phase 74 D-09).
- Full in-session translations for `content/pages/{ru,es,fr,ar,hi,zh}/book/multi-day.json` — formal register per `i18n/glossary.json`'s per-locale tone guides; place-name exonyms verified against `content/routes/<locale>/*.json` (Vienna, Český Krumlov, Salzburg, Munich, Brno, Warsaw, Karlovy Vary, Mariánské Lázně, Františkovy Lázně, and the 6-country FAQ list); vehicle-class terms (Business/First Class/Business Van) verified against `content/pages/<locale>/services/city-rides.json`; hi reuses the established `शोफ़र`/`ट्रांसफ़र`/`यात्रा-कार्यक्रम`/`रोडशो` loanwords from `content/pages/hi/services.json`.
- `.planning/phases/75-e2e-verification-launch/freeze/75-07.freeze`: queues `content/pages/en/book/multi-day.json` for plan 75-18's translation-manifest freeze.

## Task Commits

Each task was committed atomically (Task 1 split into two commits per its own explicit "commit the golden snapshot alone first" instruction):

1. **Task 1a: golden EN snapshot (pre-refactor)** - `c17c9507` (test)
2. **Task 1b: content-model wiring + ru translation** - `89badc85` (feat)
3. **Task 2: es/fr/ar/hi/zh translations, parity test, freeze** - `15132774` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

## Files Created/Modified
- `content/pages/en/book/multi-day.json` - EN source content (hero, included, how-it-works, examples, FAQ, builder, image alts, metadata)
- `content/pages/ru/book/multi-day.json`, `es/book/multi-day.json`, `fr/book/multi-day.json`, `ar/book/multi-day.json`, `hi/book/multi-day.json`, `zh/book/multi-day.json` - full in-session translations
- `app/[locale]/book/multi-day/page.tsx` - refactored to `getPageContent('book/multi-day', locale)`-driven generateMetadata + page body, with a translated TRANSFER/HOURLY day-type badge
- `tests/multi-day-page-render.test.tsx` - EN golden snapshot, ru/ar/hi render assertions, 6-locale structural+DNT parity block
- `tests/__snapshots__/multi-day-page-render.test.tsx.snap` - golden EN snapshot (committed before the refactor)
- `.planning/phases/75-e2e-verification-launch/freeze/75-07.freeze` - manifest-freeze queue entry for plan 75-18

## Decisions Made
- Committed the golden snapshot in its own commit before touching `page.tsx`, so `git log` itself is the proof of byte-parity discipline.
- Translated the TRANSFER/HOURLY example-day badge (not explicitly named in the plan's must_haves) because leaving it hardcoded in English would leak English on every non-EN render, directly contradicting the phase's stated objective; reused the exact terms already established in `messages/*.json`'s day-card labels rather than inventing a second, possibly inconsistent translation.
- Kept day numbers and TRANSFER/HOURLY type as a structural code-level array (`EXAMPLE_DAYS`) zipped by index with the translated `daySummaries` — itinerary structure (day count, transfer-vs-hourly sequencing) is a fact of the itinerary, not prose to translate.
- Used a narrow per-locale exemption (not a global DNT token) in the parity test for hi's intentional Latin-script "TRANSFER" badge, so the "no value byte-identical to EN" check still catches a genuine leak in any other locale.
- Left `getPathname` as a documented no-op — the page body has no internal `<a href>` links to route through it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Translated the TRANSFER/HOURLY example-day badge text**
- **Found during:** Task 1 (page refactor)
- **Issue:** The plan's must_haves and artifact spec did not explicitly call out the small `TRANSFER`/`HOURLY` badge rendered next to each example-itinerary day (`<strong>{d.type}</strong>`). Leaving it as a hardcoded English literal would have left an English string visible on every non-EN render of the page, contradicting the plan's own objective ("no English outside the allowlist in any locale") and the phase's overall EN-leak-closure goal.
- **Fix:** Added `examples.dayTypeLabels: { TRANSFER, HOURLY }` to the content model, reusing the exact translated values already established in `messages/*.json`'s `Booking.dayCard.transferTab`/`hourlyTab` (the same UI concept, already localized in Phase 70's `MultiDayForm`). The structural `'TRANSFER' | 'HOURLY'` union stays in code as an object key only; the displayed text is now locale-driven.
- **Files modified:** `app/[locale]/book/multi-day/page.tsx`, all 7 `content/pages/<locale>/book/multi-day.json` files.
- **Verification:** Structural+DNT parity test confirms `dayTypeLabels.TRANSFER`/`HOURLY` differ from EN in 5 of 6 locales (hi intentionally keeps `TRANSFER` in Latin script, matching established precedent, and is exempted via a narrow per-locale list, not a global DNT token).
- **Commit:** `89badc85` (EN wiring), `15132774` (5-locale translations of the new field).

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical functionality). **Impact:** closes an EN-leak gap the plan's must_haves list did not explicitly enumerate but the plan's and phase's own success criteria required; no scope creep beyond the plan's stated objective.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/book/multi-day` is fully localized in all 7 locales with EN byte-parity, structural and DNT-token parity proven by test, and its translation units queued in `freeze/75-07.freeze` for plan 75-18's manifest freeze.
- Ready for the next owning plan in `75-EN-LEAK-AUDIT.md`'s fix-plan map (75-08 through 75-16 cover the remaining leak inventory; 75-18 applies all accumulated freeze files to `i18n/translation-manifest.json`; 75-20 re-runs both EN-leak scanners for the phase-wide before/after diff).

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*

## Self-Check: PASSED

All created/modified files found on disk; all 3 task commits (`c17c9507`, `89badc85`, `15132774`) found in git history.
