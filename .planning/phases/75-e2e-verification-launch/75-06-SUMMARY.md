---
phase: 75-e2e-verification-launch
plan: 06
subsystem: i18n
tags: [next-intl, content-model, en-leak-fix, translation, book-page]

requires:
  - phase: 75-e2e-verification-launch (plan 02)
    provides: 75-EN-LEAK-AUDIT.md pre-fix inventory identifying /book (app/[locale]/book/page.tsx) as a whole-EN chrome leak owned by this plan
  - phase: 71-content-externalization-marketing-seo-pages
    provides: content/pages/<locale>/<page>.json content model + getPageContent() EN-fallback loader; about/page.tsx as the reference generateMetadata + content-driven page pattern
provides:
  - "content/pages/{en,ru,es,fr,ar,hi,zh}/book.json — every visible EN string on /book (hero, guarantees, how-it-works, after-you-book, why-book-direct, FAQ, metadata/OG) moved verbatim into EN, hand-translated into all 6 other locales"
  - "app/[locale]/book/page.tsx wired to getPageContent('book', locale) with params-derived locale in both generateMetadata and the page body; content: { kind: 'page', key: 'book' } makes the hreflang cluster translation-aware (Phase 74 D-07)"
  - "tests/book-page-render.test.tsx — EN golden byte-parity snapshot, ru/ar/zh real-render assertions, and a structural+DNT parity block across all 6 non-EN locales"
  - ".planning/phases/75-e2e-verification-launch/freeze/75-06.freeze — content/pages/en/book.json queued for the plan 75-18 manifest freeze"
affects: [75-18, 75-20]

actuals:
  tokens: 34200
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Structural config (the 4 how-it-works step numbers) stays a code-level array zipped by index with the translated howItWorks.steps catalog array — Phase 69 convention reused for a content/pages/*.json page rather than a messages/*.json component"
    - "EN-entity-preservation rule for byte-parity: fields already rendered via dangerouslySetInnerHTML keep their literal HTML-entity text unchanged in the content JSON (matches content/pages/en/about.json's existing convention); fields rendered as plain JSX text with inline entities are converted to their literal Unicode characters in the JSON, since {expr} interpolation does not decode HTML entities the way JSX text children do"
    - "Structural+DNT-only parity test: flatten each locale's JSON to a path->{type,arrayLength} map, diff key sets to prove structural fidelity, and separately assert DNT tokens (PRESTIGO, vehicle classes, phone, email) reappear verbatim — text VALUES are deliberately never compared to EN (that would fail every real translation)"

key-files:
  created:
    - content/pages/en/book.json
    - content/pages/ru/book.json
    - content/pages/es/book.json
    - content/pages/fr/book.json
    - content/pages/ar/book.json
    - content/pages/hi/book.json
    - content/pages/zh/book.json
    - tests/book-page-render.test.tsx
    - tests/__snapshots__/book-page-render.test.tsx.snap
    - .planning/phases/75-e2e-verification-launch/freeze/75-06.freeze
  modified:
    - app/[locale]/book/page.tsx

key-decisions:
  - "Golden EN snapshot committed in a separate, earlier commit than the refactor (git history literally proves 'before' vs 'after'), per the plan's own acceptance criteria requiring `git log` to show the snapshot commit predating the page-refactor commit"
  - "generateMetadata now passes content: { kind: 'page', key: 'book' } to getAlternates — /book's hreflang cluster is translation-aware (Phase 74 D-07) instead of the pre-existing 'chrome-only, all locales assumed valid' behavior documented in lib/seo.ts; harmless since all 7 locale files exist by the end of Task 2, so the cluster ends up identical either way"
  - "Service/Breadcrumb JSON-LD (bookingSchema) left English by design, unchanged — Phase 74 D-09"
  - "No FAQPage JSON-LD exists on /book today, so the plan's conditional 'if the page emits FAQ structured data, build it from content.faq.items' is a no-op — nothing added, nothing to keep in sync"

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "/book hero, guarantees, how-it-works, after-you-book, why-book-direct, FAQ and metadata/OG sourced from content/pages/<locale>/book.json via getPageContent('book', locale); EN render byte-identical to the pre-refactor golden snapshot"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/book-page-render.test.tsx > BookPage — render byte-parity proof (EN golden) > renders and matches the golden EN snapshot"
        status: pass
      - kind: other
        ref: "grep -c \"confirmed in seconds\" app/[locale]/book/page.tsx == 0; grep -n \"getPageContent('book', locale)\" (2 matches: generateMetadata + page body); grep -n \"kind: 'page', key: 'book'\" (1 match)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ru render shows the translated hero headline and step-1 title with zero EN leakage"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/book-page-render.test.tsx > BookPage — ru render shows localized content, not EN (VER-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "es/fr/ar/hi/zh translations exist with exact EN key set/leaf types/array lengths, every DNT token (PRESTIGO, E-Class/S-Class/V-Class, dispatch phone, booking email) reproduced verbatim, and ar/zh render their localized hero headline"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/book-page-render.test.tsx > book.json — structural + DNT parity across all 6 non-EN locales (it.each ru/es/fr/ar/hi/zh)"
        status: pass
      - kind: unit
        ref: "tests/book-page-render.test.tsx > BookPage — ar and zh render show the localized hero headline (VER-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "freeze/75-06.freeze queues content/pages/en/book.json for the plan 75-18 translation-manifest freeze"
    requirement: VER-01
    verification:
      - kind: other
        ref: "test -s .planning/phases/75-e2e-verification-launch/freeze/75-06.freeze"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 06: /book Content-Model Localization Summary

**Every visible English string on `/book` (hero, guarantees, how-it-works, after-you-book, why-book-direct, FAQ, metadata/OG) moved into `content/pages/<locale>/book.json` and hand-translated into all 6 non-EN locales, closing the known `/book` EN-leak with a proven byte-identical EN baseline.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-25T12:45:00Z
- **Completed:** 2026-09-25T13:01:00Z
- **Tasks:** 2
- **Files modified:** 11 (1 modified, 10 created)

## Accomplishments
- `tests/book-page-render.test.tsx`: golden EN snapshot committed **before** any refactor (proves byte-parity honestly, not retroactively), then extended with ru/ar/zh real-render assertions and a structural+DNT parity block across all 6 non-EN locales (10 tests total, all passing).
- `content/pages/en/book.json`: every visible EN string outside the `BookingWizard` — hero label/headline/subhead, 3 guarantees, "How booking works" + 4 steps, "After you book" intro + 6 items, "Why book direct" intro + 3 items, 6 FAQ items, and metadata title/description/ogTitle/ogDescription — moved verbatim, including preserving existing HTML-entity literals (`&rsquo;`, `&amp;`) exactly where the original relied on `dangerouslySetInnerHTML` to decode them, and converting two JSX-text-content entities (`&rsquo;`, `&ndash;`) to literal Unicode characters where the original relied on JSX's own entity decoding (which `{expr}` interpolation does not replicate).
- `app/[locale]/book/page.tsx`: `generateMetadata` and `BookPage` both resolve `{ locale } = await params` and call `getPageContent('book', locale)`; `getAlternates` now receives `content: { kind: 'page', key: 'book' }`, making the hreflang cluster translation-aware. The 4 how-it-works step numbers (`01`–`04`) stay a structural code array zipped by index with the translated `steps` catalog (Phase 69 convention). Service/Breadcrumb JSON-LD stays English by design (Phase 74 D-09).
- Full in-session translations for `content/pages/{ru,es,fr,ar,hi,zh}/book.json` — formal register per `i18n/glossary.json`'s per-locale tone guides (ru «Вы», es usted, fr vous, ar Modern Standard Arabic, hi आप with English travel terms kept in Latin, zh 您); every occurrence of PRESTIGO, E-Class/S-Class/V-Class, the dispatch phone number, and the booking email verified byte-identical across all 6 translations.
- `.planning/phases/75-e2e-verification-launch/freeze/75-06.freeze`: queues `content/pages/en/book.json` for plan 75-18's translation-manifest freeze.

## Task Commits

Each task was committed atomically (Task 1 split into two commits per its own explicit "commit the golden snapshot alone first" instruction):

1. **Task 1a: golden EN snapshot (pre-refactor)** - `53f53dab` (test)
2. **Task 1b: content-model wiring + ru translation** - `70ea8e2b` (feat)
3. **Task 2: es/fr/ar/hi/zh translations, parity test, freeze** - `23daa7aa` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

## Files Created/Modified
- `content/pages/en/book.json` - EN source content (hero, guarantees, how-it-works, after-you-book, why-book-direct, FAQ, metadata)
- `content/pages/ru/book.json`, `es/book.json`, `fr/book.json`, `ar/book.json`, `hi/book.json`, `zh/book.json` - full in-session translations
- `app/[locale]/book/page.tsx` - refactored to `getPageContent('book', locale)`-driven generateMetadata + page body
- `tests/book-page-render.test.tsx` - EN golden snapshot, ru/ar/zh render assertions, 6-locale structural+DNT parity block
- `tests/__snapshots__/book-page-render.test.tsx.snap` - golden EN snapshot (committed before the refactor)
- `.planning/phases/75-e2e-verification-launch/freeze/75-06.freeze` - manifest-freeze queue entry for plan 75-18

## Decisions Made
- Committed the golden snapshot in its own commit before touching `page.tsx`, so `git log` itself is the proof of byte-parity discipline, not just the test result.
- Kept the existing entity-handling split intact rather than normalizing it: `dangerouslySetInnerHTML`-rendered fields keep literal entity text (matches the established `content/pages/en/about.json` convention); plain-JSX-text fields get literal Unicode characters, because that's the only way `{content.x}` interpolation reproduces what JSX's own text-entity decoding did before the refactor.
- Left `app/sitemap.ts`'s `/book` entry untouched (it doesn't pass a `content` ref to `getAlternates`) since by the end of Task 2 all 7 locale files exist, so its "all locales assumed valid" behavior and the page's own now-translation-aware hreflang cluster produce an identical result — no functional divergence, no need to touch an out-of-scope file.
- Designed the Task 2 parity test to compare only structure (key set, leaf type, array length) and DNT tokens, never translated text values against EN — comparing text would fail on every genuine translation by definition.

## Deviations from Plan

None — plan executed exactly as written. The one entity-decoding subtlety (JSX text vs. plain-string-literal vs. `dangerouslySetInnerHTML`) was resolved by careful line-by-line analysis of the original `page.tsx` before writing `content/pages/en/book.json`, not by a runtime bug found afterward — so it is documented as a decision/pattern above, not a Deviation.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/book` is fully localized in all 7 locales with EN byte-parity, structural and DNT-token parity proven by test, and its translation units queued in `freeze/75-06.freeze` for plan 75-18's manifest freeze.
- Ready for the next owning plan in `75-EN-LEAK-AUDIT.md`'s fix-plan map (75-07 through 75-16 cover the remaining leak inventory; 75-18 applies all accumulated freeze files to `i18n/translation-manifest.json`; 75-20 re-runs both EN-leak scanners for the phase-wide before/after diff).

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*

## Self-Check: PASSED

All created/modified files found on disk; all 3 task commits (`53f53dab`, `70ea8e2b`, `23daa7aa`) found in git history.
