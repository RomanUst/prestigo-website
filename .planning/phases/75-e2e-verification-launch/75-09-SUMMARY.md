---
phase: 75-e2e-verification-launch
plan: 09
subsystem: i18n
tags: [next-intl, content-model, en-leak-fix, translation, routes-hub]

requires:
  - phase: 75-e2e-verification-launch (plan 06)
    provides: the /book content-model refactor pattern (golden-snapshot-first commit ordering, structural+DNT parity test shape) reused directly for this plan
  - phase: 71-content-externalization-marketing-seo-pages
    provides: content/pages/<locale>/<page>.json content model + getPageContent() EN-fallback loader
  - phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
    provides: getAlternates() content-ref translation-aware hreflang (D-07); D-09 Service/Breadcrumb/per-item-structural-data-stays-English convention
provides:
  - "content/pages/{en,ru,es,fr,ar,hi,zh}/routes.json — every visible EN chrome string on the /routes hub (hero, popular-cards chrome, why-private, country grouping headings/labels, how-it-works, borders, luggage, long-distance quote block, FAQ, CTA, image alt, metadata/OG) plus destinationNames (30 slugs) and countryNames (6 countries) maps, moved verbatim into EN, hand-translated into all 6 other locales"
  - "app/[locale]/routes/page.tsx wired to getPageContent('routes', locale) with params-derived locale in generateMetadata and the page body; content: { kind: 'page', key: 'routes' } makes the hreflang cluster translation-aware (Phase 74 D-07); FAQPage JSON-LD built from content.faq.items; every internal href (template-literal /routes/<slug> card links, /book, /contact including the long-distance destination query param) resolves through getPathname(); per-route h2/description/notes deliberately stay in lib/routes.ts (structural, English by design, out of this plan's scope — files_modified never named lib/routes.ts)"
  - "tests/routes-hub-render.test.tsx — EN golden byte-parity snapshot, ru render + FAQPage-schema-match + generateMetadata assertions, ar/zh render + href-locale-prefix assertions, and a structural+DNT parity block across all 6 non-EN locales plus a destinationNames<->route-file hero.label consistency check"
  - ".planning/phases/75-e2e-verification-launch/freeze/75-09.freeze — content/pages/en/routes.json queued for the plan 75-18 manifest freeze"
affects: [75-18, 75-20]

actuals:
  tokens: 44700
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Structural/translated split extended to shared-string templates: fromToLabel ('Prague → {city}') and countries.bookButton ('Book Prague → {city}') hold the whole translated phrase (including the origin-city word), with only {city} substituted at render time via interpolate() — reused across the top-10 popular cards, the per-country route cards, and the long-distance quote-on-request list"
    - "Per-route h2/description/notes intentionally left in lib/routes.ts (English, unchanged) while the surrounding chrome (section headings, repeated card labels, buttons) moves to the content model — matches the plan's files_modified list, which never named lib/routes.ts, and the must_haves wording ('cards chrome'/'headings and labels', not 'every route's unique prose')"
    - "destinationNames (30 entries) and countryNames (6 entries) maps replace both the DB-sourced top10.toLabel and the lib/routes.ts city/country fields for DISPLAY purposes only — EN values equal today's values so EN parity holds, while each locale shows its own exonym sourced from the matching content/routes/<locale>/<slug>.json hero.label (a dedicated parity test asserts this per-slug consistency)"
    - "Structural long-distance destination list (LONG_DISTANCE_CITIES_EN) stays a code-level array driving the /contact?destination= query param (functional, locale-invariant); content.longDistance.destinations is the zipped-by-index translated display array"
    - "Country H2 count/route-word template split into headingOne/headingMany + introOne/introMany (avoiding a fragile ICU-plural-in-a-plain-{token}-interpolate() attempt) — {count} stays a code-driven number, only the surrounding words are per-locale text"
    - "Byte-identical-to-EN leak-check test refinement: excluded destinationNames/countryNames/fromToLabel/longDistance.destinations from the 'no translated value == EN' assertion (many Central European place/country names and the word 'Prague' have no distinct exonym in some locales — that is a correct translation, not a leak), plus a narrow 3-item cognate allowlist (e.g. French 'Distance') for genuine coincidental same-spelling translations elsewhere"
    - "Golden-snapshot-first commit ordering (75-06/07/08 pattern) — reused verbatim, including two JSX-whitespace fixes (hero h1 and CTA h2) discovered by diffing byte-for-byte against the golden snapshot rather than assumed from the source"

key-files:
  created:
    - content/pages/en/routes.json
    - content/pages/ru/routes.json
    - content/pages/es/routes.json
    - content/pages/fr/routes.json
    - content/pages/ar/routes.json
    - content/pages/hi/routes.json
    - content/pages/zh/routes.json
    - tests/routes-hub-render.test.tsx
    - tests/__snapshots__/routes-hub-render.test.tsx.snap
    - .planning/phases/75-e2e-verification-launch/freeze/75-09.freeze
  modified:
    - app/[locale]/routes/page.tsx

key-decisions:
  - "Golden EN snapshot committed in its own commit before touching page.tsx (git log shows d6727f8a test commit predating 8f80e82b refactor commit)"
  - "Per-route h2/description/notes (30 unique route blurbs from lib/routes.ts) intentionally NOT moved into the content model or translated — the plan's files_modified list omits lib/routes.ts and the must_haves wording scopes the hub's translatable surface to chrome/labels/headings, not each route's unique prose; this is a large pre-existing EN-leak backlog item explicitly out of this plan's scope, distinct from the already-translated dedicated /routes/<slug> pages"
  - "destinationNames/countryNames drive display everywhere a destination or country name appears on the hub (top-10 cards, per-country route cards, country H2 headings) instead of the DB toLabel or lib/routes.ts city/country fields directly, so EN output is provably unchanged (parity test) while every locale shows a consistent exonym already established on that destination's own /routes/<slug> page"
  - "fromToLabel and countries.bookButton hold the FULL translated phrase (word for 'Prague' included) rather than trying to interpolate 'Prague' as a second token — grammatically simpler per locale and avoids composing two independently-translated fragments into a sentence"
  - "Long-distance destination href query param stays the structural EN city name (e.g. ?destination=Cologne) while the visible label is the translated content.longDistance.destinations[i] — matches the structural/translated split used elsewhere in this phase"
  - "JSX literal-space bugs on the hero h1 and CTA h2 (a stray extra space between the {headlineLine1} expression and <br />, since headlineLine1 already carries its own trailing space) were caught and fixed via a direct diff against the golden snapshot before the first byte-parity run, not discovered as a test failure"

requirements-completed: [VER-01]  # frontmatter mirrors this plan's own `requirements` field per template convention; NOT run through requirements.mark-complete here — VER-01 is shared by all 21 phase-75 plans and stays Pending in REQUIREMENTS.md until every plan finishes and the phase verifier passes

coverage:
  - id: D1
    description: "/routes hub hero, popular-cards chrome, why-private, country grouping headings/labels, how-it-works, borders, luggage, long-distance quote block, FAQ, CTA, hero alt, and metadata/OG sourced from content/pages/<locale>/routes.json via getPageContent('routes', locale) with a params-derived locale; EN render byte-identical to the pre-refactor golden snapshot"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/routes-hub-render.test.tsx > RoutesPage — render byte-parity proof (EN golden) > renders and matches the golden EN snapshot"
        status: pass
      - kind: other
        ref: "grep -c \"getLocale()\" app/[locale]/routes/page.tsx == 0; grep -n \"key: 'routes'\" app/[locale]/routes/page.tsx matches; grep -c \"beats the train\" app/[locale]/routes/page.tsx == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "destinationNames/countryNames drive locale-aware destination and country names everywhere on the hub (EN values equal today's lib/routes.ts values); each locale's destinationNames[slug] is consistent with that locale's own content/routes/<locale>/<slug>.json hero.label exonym"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/routes-hub-render.test.tsx > routes.json — structural + DNT parity across all 6 non-EN locales > %s: destinationNames[slug] occurs in content/routes/%s/<slug>.json hero.label (it.each ru/es/fr/ar/hi/zh)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ru render shows the localized hero headline, the ru destination name for Berlin, and the ru first FAQ question, contains neither 'beats the train' nor 'Most popular routes', every single-slash href starts with /ru/ (including template-literal /routes/<slug> card links), the FAQPage JSON-LD first question matches the visible first question, and generateMetadata('ru') returns the ru title"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/routes-hub-render.test.tsx > RoutesPage — ru render shows localized content, not EN (VER-01) (3 tests: hero/destination/FAQ+hrefs, FAQPage JSON-LD match, generateMetadata title)"
        status: pass
    human_judgment: false
  - id: D4
    description: "es/fr/ar/hi/zh translations exist with exact EN key set/leaf types/array lengths (30 destinationNames, same FAQ count), every DNT token reproduced verbatim, and ar/zh render their localized hero headline with every href locale-prefixed"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/routes-hub-render.test.tsx > routes.json — structural + DNT parity across all 6 non-EN locales (it.each ru/es/fr/ar/hi/zh)"
        status: pass
      - kind: unit
        ref: "tests/routes-hub-render.test.tsx > RoutesPage — ar and zh render show localized content with locale-prefixed hrefs (VER-01)"
        status: pass
    human_judgment: false
  - id: D5
    description: "freeze/75-09.freeze queues content/pages/en/routes.json for the plan 75-18 translation-manifest freeze"
    requirement: VER-01
    verification:
      - kind: other
        ref: "test -s .planning/phases/75-e2e-verification-launch/freeze/75-09.freeze"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 09: /routes Hub Content-Model Localization Summary

**The /routes hub's chrome — hero, popular-route cards, country grouping headings, how-it-works, borders/luggage/long-distance blocks, FAQ, CTA, and metadata — moved into `content/pages/<locale>/routes.json` and hand-translated into all 6 non-EN locales, with new `destinationNames`/`countryNames` maps driving locale-aware exonyms everywhere a destination or country name appears and every internal link locale-prefixed via `getPathname()`, closing the known `/ru/routes` etc. whole-page EN leak with a proven byte-identical EN baseline.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-25T16:14:00+02:00 (approx.)
- **Completed:** 2026-09-25T17:09:00+02:00 (approx.)
- **Tasks:** 2
- **Files modified:** 11 (1 modified, 10 created)

## Accomplishments
- `tests/routes-hub-render.test.tsx`: golden EN snapshot committed **before** any refactor (`d6727f8a`), then extended with ru hero/destination-name/FAQ + href-locale-prefix + FAQPage JSON-LD + `generateMetadata` assertions, a structural+DNT parity block across all 6 non-EN locales (plus a destinationNames↔route-file `hero.label` consistency check), and ar/zh render + href-locale-prefix assertions (18 tests total, all passing).
- `content/pages/en/routes.json`: every visible EN chrome string moved verbatim — hero label/headline/intro, hero image alt, the shared `fromToLabel`/`countries.bookButton` templates, popular-cards labels (E/S/V-Class "from", "View route"), why-private label/heading/3 paragraphs, country-grouping label/heading-count templates/intro templates/card labels/buttons, `destinationNames` (30 entries) and `countryNames` (6 entries), how-it-works heading + 3 steps, borders label/heading/3 items, luggage label/heading/intro/6 items, long-distance label/heading/intro/20 destination names, 6 FAQ items, CTA heading/intro/2 buttons, and metadata title/description/ogTitle/ogDescription (with `{viennaPrice}`/`{berlinPrice}`/`{munichPrice}`/`{budapestPrice}` placeholders).
- `app/[locale]/routes/page.tsx`: `generateMetadata` and `RoutesPage` both resolve `{ locale } = await params` and call `getPageContent('routes', locale)`; `getAlternates` now receives `content: { kind: 'page', key: 'routes' }`. The FAQPage JSON-LD's `mainEntity` is built from `content.faq.items` (matches the visible FAQ, D-06). Every internal href — the top-10 and per-country `/routes/<slug>` card links, the `/book` buttons, the bottom CTA's `/book`/`/contact` links, and the long-distance `/contact?destination=` links — resolves through `getPathname({ locale, href })`. Per-route `h2`/`description`/`notes` deliberately stay English, sourced unchanged from `lib/routes.ts` (structural, out of this plan's scope per its own `files_modified` list).
- Full in-session translations for `content/pages/{ru,es,fr,ar,hi,zh}/routes.json` — formal register per `i18n/glossary.json`'s per-locale tone guides; all 30 `destinationNames` values taken directly from the matching `content/routes/<locale>/<slug>.json` `hero.label` exonym (verified programmatically per locale); `countryNames` and the 20 long-distance destination names translated with standard locale exonyms, cross-checked against existing `content/pages/<locale>/services/intercity-routes.json` / `book/multi-day.json` country-list precedent where available.
- `.planning/phases/75-e2e-verification-launch/freeze/75-09.freeze`: queues `content/pages/en/routes.json` for plan 75-18's translation-manifest freeze.

## Task Commits

Each task was committed atomically (Task 1 split into two commits per its own explicit "commit the golden snapshot alone first" instruction):

1. **Task 1a: golden EN snapshot (pre-refactor)** - `d6727f8a` (test)
2. **Task 1b: content-model wiring + ru translation** - `8f80e82b` (feat)
3. **Task 2: es/fr/ar/hi/zh translations, parity test, freeze** - `096a1edd` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

## Files Created/Modified
- `content/pages/en/routes.json` - EN source content (hero, popular/country/how-it-works/borders/luggage/long-distance/FAQ/CTA chrome, destinationNames, countryNames, metadata)
- `content/pages/ru/routes.json`, `es/routes.json`, `fr/routes.json`, `ar/routes.json`, `hi/routes.json`, `zh/routes.json` - full in-session translations
- `app/[locale]/routes/page.tsx` - refactored to `getPageContent('routes', locale)`-driven generateMetadata + page body, with destinationNames/countryNames-driven display names and getPathname-resolved links
- `tests/routes-hub-render.test.tsx` - EN golden snapshot, ru/ar/zh render + JSON-LD/metadata assertions, 6-locale structural+DNT+consistency parity block
- `tests/__snapshots__/routes-hub-render.test.tsx.snap` - golden EN snapshot (committed before the refactor)
- `.planning/phases/75-e2e-verification-launch/freeze/75-09.freeze` - manifest-freeze queue entry for plan 75-18

## Decisions Made
- Committed the golden snapshot in its own commit before touching `page.tsx`, so `git log` itself is the proof of byte-parity discipline.
- Scoped the hub's translatable surface to chrome/labels/headings (matching `files_modified`, which never named `lib/routes.ts`) and deliberately left each route's unique `h2`/`description`/`notes` in English — a large, separately-tracked EN-leak backlog item, not this plan's job.
- Introduced `destinationNames`/`countryNames` as the single source of locale-aware display names across every place the hub shows a destination or country (top-10 cards, per-country route cards, country headings), verified programmatically to agree with each locale's own `/routes/<slug>` page `hero.label` exonym.
- Held `fromToLabel`/`countries.bookButton` as whole translated phrase templates (not composed from two separately-translated fragments) for grammatical simplicity per locale.
- Refined the byte-identical-to-EN structural parity check to exclude place/country-name fields and a small cognate allowlist, after discovering that many Central European destinations (Linz, Brno, Innsbruck, etc.) and some country/common-word translations are legitimately spelled identically to EN in es/fr — a correct translation, not a leak; the dedicated destinationNames↔route-file consistency check remains the real fidelity backstop for that field.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a stray JSX whitespace character on the hero h1 and CTA h2**
- **Found during:** Task 1, while diffing the pre-refactor golden snapshot's exact text-node boundaries before writing the content JSON
- **Issue:** The original source rendered `Central Europe, <br />` and `Not seeing your destination? <br />` as a single JSX text child with one trailing space before `<br />`. A naive refactor to `{content.hero.headlineLine1} <br />` (content already carrying the trailing space, plus a second JSX-level space before `<br />`) would have introduced a double space not present in the original — a real, if minor, EN byte-parity regression.
- **Fix:** Removed the JSX-level space (`{content.hero.headlineLine1}<br />` / `{content.cta.headingLine1}<br />`), relying solely on the trailing space already baked into the content string.
- **Files modified:** `app/[locale]/routes/page.tsx`
- **Verification:** `npx vitest run tests/routes-hub-render.test.tsx` — EN golden snapshot matches byte-for-byte on first run after the refactor (no snapshot diff needed).
- **Commit:** `8f80e82b`

**2. [Rule 1 - Bug] Excluded place/country-name fields from the "no value byte-identical to EN" structural parity check**
- **Found during:** Task 2, first parity-test run against es/fr
- **Issue:** The initial parity-check design (copied from the 75-06/07/08 precedent) flagged `es`/`fr` failures on values that are correct, intentional translations coincidentally spelled the same as EN — city names with no distinct exonym (Linz, Brno, Karlovy Vary, Innsbruck…), the country name "Austria" (es), and the word "Distance" (fr, a genuine Latin-root cognate). None of these are leaks.
- **Fix:** Excluded `destinationNames`, `countryNames`, `fromToLabel`, and `longDistance.destinations` from the byte-identical check (the dedicated destinationNames↔route-file consistency test already covers place-name fidelity), and added a narrow 3-item cognate allowlist for the remaining genuine coincidences.
- **Files modified:** `tests/routes-hub-render.test.tsx`
- **Verification:** Re-ran the full suite — 18/18 passing, including all 6 locales' structural+DNT parity checks.
- **Commit:** `096a1edd`

---

**Total deviations:** 2 auto-fixed (2 Rule 1 — bug fixes to the refactor and to the test's own leak-detection logic). **Impact:** No scope creep; both fixes make the byte-parity proof and the leak detector more accurate, not looser in a way that would hide a real leak.

## Issues Encountered
None beyond the two auto-fixed items documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/routes` hub chrome is fully localized in all 7 locales with EN byte-parity, structural/DNT/consistency parity proven by test, and its translation units queued in `freeze/75-09.freeze` for plan 75-18's manifest freeze.
- **Deferred, out of this plan's scope:** the 30 individual route cards' unique `h2`/`description`/`notes` text (from `lib/routes.ts`) remain English on every locale's hub — a separate, larger content-translation effort distinct from the already-translated dedicated `/routes/<slug>` pages. Should be tracked as a follow-up EN-leak item if not already covered by `75-EN-LEAK-AUDIT.md`.
- Ready for the next owning plan in `75-EN-LEAK-AUDIT.md`'s fix-plan map; `75-18` applies all accumulated freeze files to `i18n/translation-manifest.json`; `75-20` re-runs both EN-leak scanners for the phase-wide before/after diff.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*

## Self-Check: PASSED

All created/modified files found on disk; all 3 task commits (`d6727f8a`, `8f80e82b`, `096a1edd`) found in git history on `worktree-agent-ac5d14cbbb2c38766`.
