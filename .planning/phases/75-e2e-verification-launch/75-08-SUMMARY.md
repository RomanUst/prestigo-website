---
phase: 75-e2e-verification-launch
plan: 08
subsystem: i18n
tags: [next-intl, content-model, en-leak-fix, translation, fleet-page]

requires:
  - phase: 75-e2e-verification-launch (plan 06)
    provides: the /book content-model refactor pattern (golden-snapshot-first commit ordering, structural+DNT parity test shape) reused directly for this plan
  - phase: 71-content-externalization-marketing-seo-pages
    provides: content/pages/<locale>/<page>.json content model + getPageContent() EN-fallback loader
  - phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
    provides: getAlternates() content-ref translation-aware hreflang (D-07); D-09 Service/ItemList/Breadcrumb-stays-English convention
provides:
  - "content/pages/{en,ru,es,fr,ar,hi,zh}/fleet.json — every visible EN string on /fleet (hero, per-vehicle descriptive text, standards, marque, maintenance, technology onboard, selection criteria, FAQ, CTA, image alts, metadata/OG) moved verbatim into EN, hand-translated into all 6 other locales"
  - "app/[locale]/fleet/page.tsx wired to getPageContent('fleet', locale) with params-derived locale in generateMetadata and the page body; content: { kind: 'page', key: 'fleet' } makes the hreflang cluster translation-aware (Phase 74 D-07); FAQPage JSON-LD built from content.faq.items (D-06); Service/ItemList/Breadcrumb JSON-LD stays English via EN-only categoryEn/descriptionEn struct fields (Phase 74 D-09)"
  - "tests/fleet-page-render.test.tsx — EN golden byte-parity snapshot, ru/ar/zh real-render + FAQPage-schema-match assertions, and a structural+DNT parity block across all 6 non-EN locales"
  - ".planning/phases/75-e2e-verification-launch/freeze/75-08.freeze — content/pages/en/fleet.json queued for the plan 75-18 manifest freeze"
affects: [75-18, 75-20]

actuals:
  tokens: 40500
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Structural/translated split extended one level further than 75-06/75-07: the per-vehicle structural facts (model name, photo path, seating/luggage counts, fuel/transmission/drive type, cargoVolume, wheelbase, vehicleConfiguration) stay in a code-level VehicleSpec[] array; only category/description/features/idealFor move into content.vehicles[i], zipped by index"
    - "EN-only categoryEn/descriptionEn fields on the structural VehicleSpec type, used exclusively for the Vehicle ItemList JSON-LD (Phase 74 D-09) — decoupled from the localized category/description shown on the page, so JSON-LD stays byte-identical EN across all locales while the visible card text is genuinely translated"
    - "Numeric-with-word templates ({n} passengers, {cases} large cases + {bags} cabin bags) for spec-table values that mix a structural number with translatable words — the number stays a code-driven String() substitution, only the surrounding words are locale text"
    - "Entity-handling triage confirmed empirically via a direct golden-snapshot diff (not just inferred from the about.json convention): a literal HTML entity inside an ORIGINAL JS STRING LITERAL (e.g. FAQ prose `child&rsquo;s`) must stay literal entity text in the content JSON — plain-JSX-expression rendering never decodes it, unlike JSX text children (which the TSX compiler decodes at build time, so those need the literal Unicode character instead)"
    - "Golden-snapshot-first commit ordering (75-06/75-07 pattern) — reused verbatim"

key-files:
  created:
    - content/pages/en/fleet.json
    - content/pages/ru/fleet.json
    - content/pages/es/fleet.json
    - content/pages/fr/fleet.json
    - content/pages/ar/fleet.json
    - content/pages/hi/fleet.json
    - content/pages/zh/fleet.json
    - tests/fleet-page-render.test.tsx
    - tests/__snapshots__/fleet-page-render.test.tsx.snap
    - .planning/phases/75-e2e-verification-launch/freeze/75-08.freeze
  modified:
    - app/[locale]/fleet/page.tsx

key-decisions:
  - "Golden EN snapshot committed in its own commit before touching page.tsx (git log shows 3fa507aa test commit predating 1ce74b9f refactor commit)"
  - "Split the FAQ item[5].a entity fix the opposite direction from the marque/selection paragraphs: reverted an initial (incorrect) Unicode-decode of `child&rsquo;s` back to the literal entity, after a direct diff against the freshly-rendered golden snapshot proved the original FAQ array is a plain JS string literal (never JSX-decoded), while the marque/selection paragraphs were literal JSX text children (compiler-decoded) — same-looking source entity, two different runtime behaviors, verified empirically rather than assumed"
  - "DNT_TOKENS deliberately excludes formatted numeric facts from FAQ prose (540, 1,410, 25,000, etc.) — thousands-separator style is a locale-formatting concern (ru/fr use a space, not a comma), not a do-not-translate concern; the actual structural specs live in code (VehicleSpec), never in content JSON, so there is nothing to accidentally mistranslate"
  - "vehicleListSchema (Vehicle ItemList JSON-LD) reads from the structural VehicleSpec's categoryEn/descriptionEn, not the localized content.vehicles[i] fields — keeps Service/ItemList/Breadcrumb JSON-LD English by design (Phase 74 D-09) while the visible card text is genuinely translated per locale"
  - "Both /book anchors (the 3 per-vehicle 'Book {className}' buttons and the CTA 'Book a Transfer' button) resolve through a single getPathname({ locale, href: '/book' }) computed once per render, per the plan's explicit must_haves requirement"
  - "Vehicle-class category names (Business Sedan / Executive Sedan / Executive Van) translated per-locale using terminology consistent with the homepage Fleet namespace and services/city-rides.json's existing Business/First Class/Business Van conventions (e.g. ar فان الأعمال precedent extended to فان تنفيذي, hi बिज़नेस वैन precedent extended to एग्ज़ीक्यूटिव वैन)"
  - "Mid-plan git-branch incident (see Deviations): an external, concurrent `git checkout fix/payment-link-pi-succeeded` in the same working tree (no worktree isolation) moved HEAD out from under the Task 2 commit; recovered via checkout back to main + cherry-pick (not revert/reset --hard) so no work was lost and the unrelated branch was restored exactly to its already-pushed origin state"

requirements-completed: [VER-01]  # frontmatter mirrors this plan's own `requirements` field per template convention (matches 75-06/75-07); NOT run through requirements.mark-complete here — VER-01 is shared by all 21 phase-75 plans and stays Pending in REQUIREMENTS.md until every plan finishes and the phase verifier passes

coverage:
  - id: D1
    description: "/fleet hero, per-vehicle descriptive text, standards, marque, maintenance, technology onboard, selection criteria, FAQ, CTA, image alts, and metadata/OG sourced from content/pages/<locale>/fleet.json via getPageContent('fleet', locale); EN render byte-identical to the pre-refactor golden snapshot"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/fleet-page-render.test.tsx > FleetPage — render byte-parity proof (EN golden) > renders and matches the golden EN snapshot"
        status: pass
      - kind: other
        ref: "grep -c \"Part of the experience\" app/[locale]/fleet/page.tsx == 0 (string exists only in content/pages/en/fleet.json); grep -n \"key: 'fleet'\" app/[locale]/fleet/page.tsx matches"
        status: pass
    human_judgment: false
  - id: D2
    description: "ru render shows the translated hero italic line and first FAQ question with zero EN leakage; generateMetadata returns the ru title; the FAQPage JSON-LD first question equals the ru visible first question (D-06)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/fleet-page-render.test.tsx > FleetPage — ru render shows localized content, not EN (VER-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "es/fr/ar/hi/zh translations exist with exact EN key set/leaf types/array lengths, DNT tokens (PRESTIGO, Mercedes-Benz, E-Class/S-Class/V-Class, email, structural placeholders) reproduced verbatim, and ar/zh render their localized hero italic line with a FAQPage JSON-LD first question matching the visible first question"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/fleet-page-render.test.tsx > fleet.json — structural + DNT parity across all 6 non-EN locales (it.each ru/es/fr/ar/hi/zh)"
        status: pass
      - kind: unit
        ref: "tests/fleet-page-render.test.tsx > FleetPage — ar and zh render show localized content with matching FAQ schema (VER-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "freeze/75-08.freeze queues content/pages/en/fleet.json for the plan 75-18 translation-manifest freeze"
    requirement: VER-01
    verification:
      - kind: other
        ref: "test -s .planning/phases/75-e2e-verification-launch/freeze/75-08.freeze"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 08: /fleet Content-Model Localization Summary

**Every visible English string on `/fleet` — hero, per-vehicle descriptive text, "Every vehicle, every time" standards, "One marque. Three silhouettes." section, "Maintenance & Safety", technology onboard, selection criteria, FAQ, CTA, image alts, and metadata/OG — moved into `content/pages/<locale>/fleet.json` and hand-translated into all 6 non-EN locales, closing the Phase 74-deferred `/fleet` localization gap with a proven byte-identical EN baseline.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-25T15:40:34+02:00
- **Completed:** 2026-09-25T15:58:00+02:00
- **Tasks:** 2
- **Files modified:** 11 (1 modified, 10 created)

## Accomplishments
- `tests/fleet-page-render.test.tsx`: golden EN snapshot committed **before** any refactor (`3fa507aa`), then extended with ru visible/JSON-LD/metadata assertions, a structural+DNT parity block across all 6 non-EN locales, and ar/zh render + FAQPage-schema-match assertions (11 tests total, all passing).
- `content/pages/en/fleet.json`: every visible EN string moved verbatim — hero label/headline/intro, per-vehicle category/description/features/idealFor (structural model/photo/specs stay in code), spec-table labels and numeric-with-word templates, standards heading + 4 items, marque label/heading/3 paragraphs, maintenance label/heading/3 items, technology onboard label/heading/intro/6 items, selection-criteria label/heading/2 paragraphs, 6 FAQ items, CTA heading/intro/button, image alt templates, and metadata title/description/ogTitle/ogDescription.
- `app/[locale]/fleet/page.tsx`: `generateMetadata` and `FleetPage` both resolve `{ locale } = await params` and call `getPageContent('fleet', locale)`; `getAlternates` now receives `content: { kind: 'page', key: 'fleet' }`. The structural `VehicleSpec[]` array (model, photo, specs, and EN-only `categoryEn`/`descriptionEn` for JSON-LD) is zipped by index with translated `content.vehicles`. FAQPage JSON-LD's `mainEntity` is built from `content.faq.items` (one source with the visible FAQ, D-06); the Vehicle ItemList/Breadcrumb JSON-LD stays English by design via the EN-only structural fields (Phase 74 D-09). Both `/book` anchors resolve through a single `getPathname({ locale, href: '/book' })`.
- Full in-session translations for `content/pages/{ru,es,fr,ar,hi,zh}/fleet.json` — formal register per `i18n/glossary.json`'s per-locale tone guides; vehicle-class category terms aligned with the homepage `Fleet` namespace and `services/city-rides.json`'s existing Business/First Class/Business Van conventions; place-name exonyms (Warsaw, Central Europe, Czech Republic, EU) and the "vignette" toll-sticker term verified against existing route content per locale.
- `.planning/phases/75-e2e-verification-launch/freeze/75-08.freeze`: queues `content/pages/en/fleet.json` for plan 75-18's translation-manifest freeze.

## Task Commits

Each task was committed atomically (Task 1 split into two commits per its own explicit "commit the golden snapshot alone first" instruction):

1. **Task 1a: golden EN snapshot (pre-refactor)** - `3fa507aa` (test)
2. **Task 1b: content-model wiring + ru translation** - `1ce74b9f` (feat)
3. **Task 2: es/fr/ar/hi/zh translations, parity test, freeze** - `494ef7f9` (feat) — cherry-picked onto `main` from its original commit `98795c9a`, which had accidentally landed on `fix/payment-link-pi-succeeded` (see Deviations)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

## Files Created/Modified
- `content/pages/en/fleet.json` - EN source content (hero, per-vehicle text, standards, marque, maintenance, technology, selection, FAQ, CTA, image alts, metadata)
- `content/pages/ru/fleet.json`, `es/fleet.json`, `fr/fleet.json`, `ar/fleet.json`, `hi/fleet.json`, `zh/fleet.json` - full in-session translations
- `app/[locale]/fleet/page.tsx` - refactored to `getPageContent('fleet', locale)`-driven generateMetadata + page body, with structural/translated vehicle-data split
- `tests/fleet-page-render.test.tsx` - EN golden snapshot, ru/ar/zh render + JSON-LD assertions, 6-locale structural+DNT parity block
- `tests/__snapshots__/fleet-page-render.test.tsx.snap` - golden EN snapshot (committed before the refactor)
- `.planning/phases/75-e2e-verification-launch/freeze/75-08.freeze` - manifest-freeze queue entry for plan 75-18

## Decisions Made
- Committed the golden snapshot in its own commit before touching `page.tsx`, so `git log` itself is the proof of byte-parity discipline.
- Confirmed via a direct golden-snapshot diff (not assumption) that the FAQ item's `child&rsquo;s` entity must stay literal (plain JS string literal, no JSX-compiler decode), while the marque/selection paragraphs' `it&rsquo;s`/`you&rsquo;re` entities needed the decoded Unicode character (literal JSX text children, compiler-decoded at build time) — same-looking source, two different runtime paths.
- Excluded formatted numeric facts (540, 1,410, 25,000, etc.) from the DNT parity check — thousands-separator style is a locale-formatting concern, not a translation-fidelity concern; the actual structural specs live in code, never in content JSON.
- Kept `categoryEn`/`descriptionEn` as separate EN-only fields on the structural `VehicleSpec` type specifically so the Vehicle ItemList JSON-LD (Phase 74 D-09, English by design) never accidentally reads the localized visible-card text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Recovered Task 2's commit after a concurrent external `git checkout` moved HEAD mid-plan**
- **Found during:** Task 2, immediately after committing (post-commit `git log` check)
- **Issue:** This plan was executed sequentially on the shared main working tree per its explicit instructions (no worktree isolation). Between the Task 1 commit and the Task 2 commit, an external, concurrent process (another terminal/session working on an unrelated webhook fix) ran `git checkout fix/payment-link-pi-succeeded` in this same working directory and committed `ba4d4ad9` there. Because there is no worktree isolation, that checkout silently moved this session's HEAD too — the Task 2 commit (`98795c9a`) landed on `fix/payment-link-pi-succeeded`, stacked on top of the unrelated webhook commit, instead of on `main`.
- **Fix:** Verified `main`'s branch ref was untouched (still pointing at the Task 1 commit) and that `fix/payment-link-pi-succeeded` was already fully pushed to `origin` (merge-base confirmed it branched cleanly off Task 1's commit). Checked out `main`, cherry-picked `98795c9a` onto it (clean apply, producing `494ef7f9`), then restored `fix/payment-link-pi-succeeded`'s local branch ref to exactly match its already-pushed `origin` state (`git branch -f fix/payment-link-pi-succeeded origin/fix/payment-link-pi-succeeded`) — a no-op for that branch since it already matched origin, removing only the accidental stray commit. No `git reset --hard`, no force-push, no destructive operation on work that wasn't mine.
- **Files modified:** None beyond the already-committed Task 2 files; this was a pure git-history correction.
- **Verification:** Post-fix `git branch --show-current` confirms `main`; `git log --oneline -3` shows all 3 plan commits on `main`; `npx vitest run tests/fleet-page-render.test.tsx` re-run and passing (11/11) after the cherry-pick; `git log fix/payment-link-pi-succeeded` confirmed to match `origin/fix/payment-link-pi-succeeded` exactly.
- **Committed in:** `494ef7f9` (cherry-picked Task 2 commit on `main`)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking, git-history recovery). **Impact:** No scope creep, no lost work, no disturbance to the unrelated concurrent webhook fix. Confirms this repo has no per-plan worktree isolation for this execution — any future sequential plan on this repo should re-verify `git branch --show-current` before each commit, not just at plan start.

## Issues Encountered
None beyond the git-branch incident documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/fleet` is fully localized in all 7 locales with EN byte-parity, structural and DNT-token parity proven by test, and its translation units queued in `freeze/75-08.freeze` for plan 75-18's manifest freeze.
- Ready for the next owning plan in `75-EN-LEAK-AUDIT.md`'s fix-plan map (75-09 through 75-16 cover the remaining leak inventory; 75-18 applies all accumulated freeze files to `i18n/translation-manifest.json`; 75-20 re-runs both EN-leak scanners for the phase-wide before/after diff).
- **Operator note:** `fix/payment-link-pi-succeeded` is an unrelated branch actively being worked on in this same repo checkout — if further sequential plans run here, confirm the current branch before every commit, not only at plan start.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*

## Self-Check: PASSED

All created/modified files found on disk; all 3 task commits (`3fa507aa`, `1ce74b9f`, `494ef7f9`) found in git history on `main`.
