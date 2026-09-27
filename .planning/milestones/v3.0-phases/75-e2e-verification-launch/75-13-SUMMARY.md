---
phase: 75-e2e-verification-launch
plan: 13
subsystem: i18n
tags: [next-intl, i18n, en-leak-fix, translation, content-model, blog, booking]

requires:
  - phase: 75-e2e-verification-launch (plan 11)
    provides: "lib/localized-href.ts — localizedHref(locale, href) wrapper for raw <a href> anchors and content-JSON-provided hrefs, reused for the blog CTA and author page CTA links"
  - phase: 75-e2e-verification-launch (plan 12)
    provides: "messages/*.json edits serialized before this plan (D-08 sequencing) — no concurrent-write conflict with Corporate.form/ContactForm namespaces"
  - phase: 71-content-externalization-marketing-seo-pages
    provides: "content/pages/<locale>/<page>.json content model + getPageContent() EN-fallback loader, reused for the new authors/roman-ustyugov.json unit"
provides:
  - "BookingSection/HourlyBookingSection/RoutesSection/BlogCard/StepStub/NotFound/BlogPost.cta/Common.loadingBooking catalog namespaces (all 7 locales) — closes the airport-transfer/home/concierge booking block, the homepage Routes section, the blog card, the booking-step placeholder, the 404 page, the /book loading state, and the blog-post bottom CTA EN leaks named in 75-EN-LEAK-AUDIT.md"
  - "messages/hi.json Booking.entryBar.flightNumberAriaLabel translated (was byte-identical to EN, D-07/D-08)"
  - "content/pages/<locale>/authors/roman-ustyugov.json (7 locales) — author page section labels, jobTitle, bio, knowsAbout, imageAlt, and CTA now render in the visitor's locale; lib/authors.ts and the Person/Breadcrumb JSON-LD stay English by design"
  - "Every shared component's internal links (RoutesBento tiles, Routes 'Explore routes', BlogCard post link, not-found buttons, blog CTA buttons, author page CTA) now route through the i18n Link / localizedHref bridge instead of raw <a>/next/link"
  - "tests/shared-sections-i18n.test.tsx — full behavior-contract coverage across all three tasks; tests/BlogCard.test.tsx migrated to renderWithIntl with ru locale-link + CTA assertions"
  - ".planning/phases/75-e2e-verification-launch/freeze/75-13.freeze — 10 pattern lines queuing this plan's translated units for the 75-18 manifest freeze"
affects: [75-18, 75-20]

actuals:
  tokens: 24500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Server Components that render only catalog text (no async data dependency) use synchronous useTranslations() from 'next-intl' directly — same pattern as components/Services.tsx — rather than async getTranslations()/getLocale() from 'next-intl/server'. Used for app/[locale]/not-found.tsx and app/[locale]/book/loading.tsx (both special Next.js files with no params/generateMetadata hook to resolve locale from explicitly)."
    - "A page whose default export is already async for an unrelated reason (blog/[slug]/page.tsx's dynamic MDX import) and has already resolved `locale` via a single `getLocale()` call reuses that value with `getTranslations({ locale, namespace })` rather than calling getLocale() a second time — avoids the Phase-73 bare-getLocale-on-force-static-route EN-leak bug class."
    - "RoutesBento/RoutesMap/Routes/BlogCard/StepStub all route their internal links through the i18n Link (@/i18n/routing) instead of next/link or raw <a href>, matching the components/Services.tsx precedent for components that are NOT wrapped by localizedHref (i.e. hardcoded literal hrefs, not content-JSON-provided ones)."

key-files:
  created:
    - tests/shared-sections-i18n.test.tsx
    - content/pages/en/authors/roman-ustyugov.json
    - content/pages/ru/authors/roman-ustyugov.json
    - content/pages/es/authors/roman-ustyugov.json
    - content/pages/fr/authors/roman-ustyugov.json
    - content/pages/ar/authors/roman-ustyugov.json
    - content/pages/hi/authors/roman-ustyugov.json
    - content/pages/zh/authors/roman-ustyugov.json
    - .planning/phases/75-e2e-verification-launch/freeze/75-13.freeze
    - .planning/phases/75-e2e-verification-launch/deferred-items.md
  modified:
    - components/BookingSection.tsx
    - components/HourlyBookingSection.tsx
    - components/Routes.tsx
    - components/RoutesBento.tsx
    - components/RoutesMap.tsx
    - components/BlogCard.tsx
    - components/booking/steps/StepStub.tsx
    - app/[locale]/not-found.tsx
    - app/[locale]/book/loading.tsx
    - app/[locale]/blog/[slug]/page.tsx
    - app/[locale]/authors/roman-ustyugov/page.tsx
    - app/sitemap.ts
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/BlogCard.test.tsx
    - .planning/WINDOWS.md

key-decisions:
  - "not-found.tsx and loading.tsx use synchronous useTranslations() (Services.tsx's server-component pattern) rather than async getTranslations()/getLocale() — neither special file has a params prop or generateMetadata hook to resolve locale from explicitly, and next-intl's RSC integration resolves the request-scoped locale for a plain synchronous Server Component the same way it already does for Services.tsx in production."
  - "not-found.tsx's static `metadata` title stays the single EN string — documented inline as a D-09 allowlisted exception, since Next.js's special not-found.tsx file has no per-request generateMetadata()/params hook to resolve a locale from; the visible page content (heading, body, buttons) is fully localized."
  - "Author page's visible bio/expertise/jobTitle/imageAlt text moved into content/pages/<locale>/authors/roman-ustyugov.json (EN byte-identical, verified against lib/authors.ts's exact source strings including \\u2019 apostrophes); lib/authors.ts itself is untouched and still backs the Person/Breadcrumb JSON-LD in English, per the plan's explicit D-09 scope."
  - "components/ArticleByline.tsx's own next/link locale-dropping href (75-EN-LEAK-AUDIT.md row 85, attributed to 75-13) is NOT in this plan's files_modified/task list — logged to deferred-items.md and WINDOWS.md (#20) instead of silently expanding scope, mocked out in the blog-CTA test so it doesn't interfere with this plan's own assertions."
  - "RoutesBento/RoutesMap/Routes/BlogCard use the i18n Link directly (not localizedHref) since their hrefs are hardcoded literal/template-literal strings in component code, matching the components/Services.tsx precedent; localizedHref stays reserved for content-JSON-provided hrefs and Server Component raw anchors that can't use the Link component (per 75-11's established split)."

requirements-completed: [VER-01]  # frontmatter mirrors this plan's own `requirements` field per template convention; NOT run through requirements.mark-complete here — VER-01 is shared by all 21 phase-75 plans and stays Pending in REQUIREMENTS.md until every plan finishes and the phase verifier passes. Per worktree-mode instructions, STATE.md/ROADMAP.md/REQUIREMENTS.md are NOT touched by this executor — the orchestrator owns those writes after merge.

coverage:
  - id: D1
    description: "BookingSection (home/airport-transfer/concierge 'Book your chauffeur now' block) renders label, headline, subhead, and 4 trust bullets from a BookingSection catalog namespace in all 7 locales"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/shared-sections-i18n.test.tsx > BookingSection (75-13 Task 1 tracer) (en-unchanged + ru-no-EN-leak)"
        status: pass
      - kind: unit
        ref: "tests/i18n-catalog-array-types.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "HourlyBookingSection, the homepage Routes section (label/heading/intro/exploreRoutes/footnote), RoutesBento ('View route', 'from €{price}'), the RoutesMap aria-label, BlogCard ('Read article'), and StepStub (ICU 'Step {step} of 6') render only catalog text in every locale; their internal links (RoutesBento tiles, Routes 'Explore routes', BlogCard post link) keep the locale prefix via the i18n Link"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/shared-sections-i18n.test.tsx > HourlyBookingSection/Routes/RoutesBento/RoutesMap/StepStub (75-13 Task 2) (16 assertions incl. href-prefix checks)"
        status: pass
      - kind: unit
        ref: "tests/BlogCard.test.tsx (migrated to renderWithIntl, ru locale-link + CTA assertions)"
        status: pass
    human_judgment: false
  - id: D3
    description: "messages/hi.json Booking.entryBar.flightNumberAriaLabel is Hindi (was byte-identical to EN at planning time)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/shared-sections-i18n.test.tsx > messages/hi.json Booking.entryBar.flightNumberAriaLabel (75-13 Task 2 D-07/D-08 fix)"
        status: pass
      - kind: other
        ref: "node -e assertion (hi !== en) — plan's own acceptance criteria command"
        status: pass
    human_judgment: false
  - id: D4
    description: "The [locale] not-found page, the /book loading-state aria-label, the /blog/[slug] bottom CTA block, and the /authors/roman-ustyugov page (labels + visible bio/expertise/CTA) render in the visitor's locale; their links keep the locale; JSON-LD Person/Breadcrumb stay English by design"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/shared-sections-i18n.test.tsx > NotFound / /book loading aria-label / Blog post bottom CTA / Author page (75-13 Task 3) (en+ru/ar/zh render + href-prefix + unchanged-Person-JSON-LD assertions)"
        status: pass
    human_judgment: false
  - id: D5
    description: "All 7 catalogs contain every new key translated (--check completeness + type parity), EN strings are verbatim, and each component renders under ru without any of its EN strings"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/i18n-catalog-array-types.test.ts"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit — clean under every file this plan touched"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-09-26
status: complete
---

# Phase 75 Plan 13: Shared Booking/Homepage Components, 404, Blog CTA & Author Page i18n Summary

**BookingSection, HourlyBookingSection, Routes/RoutesBento/RoutesMap, BlogCard, StepStub, the [locale] 404 page, the /book loading state, the blog-post bottom CTA, and the roman-ustyugov author page (7 new content files) all now render translated catalog/content text in every locale with locale-preserving internal links; fixed the last hi-catalog English-identical aria label (D-07/D-08).**

## Performance

- **Duration:** 70 min (approx.)
- **Started:** 2026-09-26T15:17:00Z (approx.)
- **Completed:** 2026-09-26T16:27:18Z
- **Tasks:** 3
- **Files modified:** 31 (7 components, 5 app pages/routes, 7 message catalogs, 7 new author content files, 2 test files, 1 freeze file, 1 deferred-items file, 1 WINDOWS.md entry)

## Accomplishments

- **Task 1 (tracer):** `components/BookingSection.tsx` — the airport-transfer/home/concierge "Book your chauffeur now" block — now renders `useTranslations('BookingSection')` for its label, two-line headline, subhead, and 4-item trust array. Added the `BookingSection` namespace to all 7 catalogs (EN verbatim, 6 hand-translated). New `tests/shared-sections-i18n.test.tsx` proves en output is byte-unchanged and ru contains none of the EN strings.
- **Task 2:** `HourlyBookingSection` (own namespace), `Routes.tsx`/`RoutesBento.tsx`/`RoutesMap.tsx` (shared `RoutesSection` namespace covering the section header, intro, footnote, the bento card's "View route"/"from €{price}" ICU string, and the map's aria-label), `BlogCard.tsx` (`BlogCard.readArticle`, migrated to the i18n `Link` for its post href — closing the last locale-dropping link 75-EN-LEAK-AUDIT.md attributed to this plan), and `StepStub.tsx` (`StepStub` namespace with an ICU "Step {step} of 6" string) are all externalized across all 7 locales. Fixed `messages/hi.json`'s `Booking.entryBar.flightNumberAriaLabel` (was byte-identical to EN). Migrated `tests/BlogCard.test.tsx` to `renderWithIntl` with new ru locale-link/CTA assertions.
- **Task 3:** `app/[locale]/not-found.tsx` (new `NotFound` namespace, synchronous `useTranslations()` since the special file has no locale-resolving hook), `app/[locale]/book/loading.tsx` (`Common.loadingBooking` aria-label), `app/[locale]/blog/[slug]/page.tsx`'s bottom CTA (new `BlogPost.cta` namespace, both hrefs through `localizedHref()`), and `app/[locale]/authors/roman-ustyugov/page.tsx` (converted to receive `params`, section labels/jobTitle/bio/knowsAbout/imageAlt/CTA sourced from 7 new `content/pages/<locale>/authors/roman-ustyugov.json` files, EN byte-identical to the prior `lib/authors.ts`-sourced hardcoded text; `lib/authors.ts` and the Person/Breadcrumb JSON-LD stay English by design). Updated a now-stale comment in `app/sitemap.ts` describing hreflang-cluster behavior that changed once the new content files exist. Created `freeze/75-13.freeze` with the 10 required patterns.
- Verification: `npx vitest run tests/shared-sections-i18n.test.tsx tests/BlogCard.test.tsx tests/blog.test.ts tests/blog-jsonld.test.ts tests/i18n-catalog-array-types.test.ts` — 53/53 pass; `npx tsc --noEmit` clean under every file this plan touched; full `npx vitest run` — 2260/2260 executable tests pass (5 pre-existing, unrelated worktree-environment test-suite failures, documented below).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — BookingSection localized in all 7 catalogs** - `f86ab4db` (feat)
2. **Task 2: HourlyBookingSection, Routes/RoutesBento/RoutesMap, BlogCard, StepStub (+ hi aria fix)** - `8ee17ef7` (feat)
3. **Task 3: not-found, /book loading aria, blog post CTA, author page + freeze patterns** - `efe63b4f` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

_Note: no TDD RED/GREEN split commits — `type="tracer"`/`type="auto"` tasks with `tdd="true"` were verified via each task's own `<verify>` test run (RED confirmed before the fix, GREEN after) inline within the single task commit, matching plans 75-11/75-12's precedent._

## Files Created/Modified

- `components/BookingSection.tsx` — `BookingSection` namespace (label, headline, subhead, trust array)
- `components/HourlyBookingSection.tsx` — `HourlyBookingSection` namespace
- `components/Routes.tsx` — `RoutesSection` namespace + i18n Link for "Explore routes"
- `components/RoutesBento.tsx` — `RoutesSection.viewRoute`/`fromPrice` + i18n Link for tile hrefs (also fixed a variable-shadowing bug introduced by this change, see Deviations)
- `components/RoutesMap.tsx` — `RoutesSection.mapAriaLabel`
- `components/BlogCard.tsx` — `BlogCard.readArticle` + i18n Link for the post href
- `components/booking/steps/StepStub.tsx` — `StepStub` namespace with ICU step-of-6
- `app/[locale]/not-found.tsx` — `NotFound` namespace, i18n Link, D-09 metadata-title exception documented inline
- `app/[locale]/book/loading.tsx` — `Common.loadingBooking` aria-label
- `app/[locale]/blog/[slug]/page.tsx` — `BlogPost.cta` namespace, `localizedHref()` on both CTA buttons
- `app/[locale]/authors/roman-ustyugov/page.tsx` — converted to `params`-based content-model rendering
- `app/sitemap.ts` — updated stale CR-02 comment
- `content/pages/{en,ru,es,fr,ar,hi,zh}/authors/roman-ustyugov.json` (new, 7 files) — labels/jobTitle/bio/knowsAbout/imageAlt/cta
- `messages/{en,ru,es,fr,ar,hi,zh}.json` — `BookingSection`, `HourlyBookingSection`, `RoutesSection`, `BlogCard`, `StepStub`, `NotFound`, `BlogPost.cta`, `Common.loadingBooking` namespaces; hi `Booking.entryBar.flightNumberAriaLabel` fix
- `tests/shared-sections-i18n.test.tsx` (new) — full behavior-contract coverage, all 3 tasks
- `tests/BlogCard.test.tsx` — migrated to `renderWithIntl`, ru locale-link + CTA assertions
- `.planning/phases/75-e2e-verification-launch/freeze/75-13.freeze` (new) — 10 pattern lines
- `.planning/phases/75-e2e-verification-launch/deferred-items.md` (new) — logged the out-of-scope ArticleByline finding
- `.planning/WINDOWS.md` — recorded the same finding as ledger entry #20

## Decisions Made

- `not-found.tsx`/`loading.tsx` use synchronous `useTranslations()` (the `components/Services.tsx` server-component pattern) rather than async `getTranslations()`/`getLocale()` — neither special Next.js file has a `params` prop or `generateMetadata()` hook to resolve a locale from explicitly.
- `not-found.tsx`'s static `metadata.title` stays the single EN string, documented inline as a D-09 allowlisted exception (no per-request hook exists for this special file to localize it from).
- Author page bio/expertise/jobTitle/imageAlt content moved into the content model (EN byte-identical to `lib/authors.ts`'s exact source, verified character-for-character including `’` apostrophes); `lib/authors.ts` itself and the Person/Breadcrumb JSON-LD stay English, per the plan's explicit scope.
- `components/ArticleByline.tsx`'s own `next/link` locale-dropping defect (audit-attributed to 75-13 but outside this plan's `files_modified`) was logged to `deferred-items.md`/`WINDOWS.md` rather than silently fixed — respects the scope boundary rule.
- `RoutesBento`/`RoutesMap`/`Routes`/`BlogCard` use the i18n `Link` directly (hardcoded literal/template-literal hrefs) rather than `localizedHref()`, matching the `Services.tsx` precedent; `localizedHref()` stays reserved for content-JSON-provided hrefs and raw-anchor Server Components per 75-11's established split.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a variable-shadowing bug introduced while wiring RoutesBento's translations**
- **Found during:** Task 2 (`RoutesBento.tsx` — `tiles.map((tile, t) => ...)`)
- **Issue:** The tile map callback's index parameter was named `t`, shadowing the outer `const t = useTranslations('RoutesSection')` translation function within that scope — every `t('viewRoute')`/`t('fromPrice', ...)` call inside the map threw `TypeError: t is not a function`.
- **Fix:** Renamed the map callback's index parameter to `i` (and the two places it indexed `assign`/`fading`), leaving the translation function's `t` binding intact.
- **Files modified:** `components/RoutesBento.tsx`
- **Verification:** `tests/shared-sections-i18n.test.tsx`'s RoutesBento/Routes suites pass.
- **Committed in:** `8ee17ef7` (Task 2 commit)

**2. [Rule 1 - Bug] Updated a stale comment in app/sitemap.ts**
- **Found during:** Task 3 (author page content-model rollout)
- **Issue:** A CR-02 comment on the `/authors/roman-ustyugov` sitemap entry asserted "no content/pages/<locale>/authors/roman-ustyugov.json exists for any locale, so this collapses to en + x-default only" — no longer true once this plan added that content file for all 7 locales; the D-07 fs-probe now legitimately expands the hreflang cluster.
- **Fix:** Rewrote the comment to describe the new (correct) behavior; no code change needed (`getAlternates(..., { content: {...} })` already probed the content path correctly and now returns the fuller cluster on its own).
- **Files modified:** `app/sitemap.ts`
- **Verification:** No test asserts the old (now-incorrect) behavior; `npx tsc --noEmit` clean.
- **Committed in:** `efe63b4f` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs — one a self-introduced regression caught by the plan's own tests, one a documentation-accuracy fix caused directly by this plan's content-model change).
**Impact on plan:** Both fixes are necessary for correctness. No scope creep.

## Issues Encountered

- **Out-of-scope finding, logged not fixed (per scope-boundary rule):** `components/ArticleByline.tsx` uses `next/link`'s default import instead of the i18n `Link`, dropping the locale prefix on its byline link (75-EN-LEAK-AUDIT.md row 85, attributed to plan 75-13 by the audit's ownership column) — but this file is NOT in this plan's `files_modified` frontmatter or task list. Logged to `.planning/phases/75-e2e-verification-launch/deferred-items.md` and `.planning/WINDOWS.md` (entry #20) for a future plan (or 75-20's final EN-leak re-verify) to fix. Mocked out in the blog-CTA test so it doesn't interfere with this plan's own assertions.
- **Pre-existing, out-of-scope `tsc --noEmit` failures** (not introduced by this plan, files never touched by this plan): `tests/i18n-translate-dnt.test.ts` (2 errors), `tests/nav-auth.test.tsx` (5 errors), `tests/passenger-actions.test.ts` (1 error). Zero `tsc` errors exist under any file this plan modified. Identical to the issue documented in 75-11-SUMMARY.md/75-12-SUMMARY.md.
- **Pre-existing, out-of-scope full-suite `vitest run` failures** (5 suites, worktree-environment-specific, not introduced by this plan): `tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts` all fail at import time with `Cannot find module '../node_modules/next-intl/dist/esm/development/server.react-server.js'` — a relative path into `node_modules` that only resolves in the main checkout, not this worktree's symlinked `node_modules`. None of the 5 failing files were touched by this plan. Identical to the issue documented in 75-11-SUMMARY.md/75-12-SUMMARY.md; all 2260 other tests pass.
- **Vitest debugging note (resolved, no lingering issue):** while building the blog-CTA test, a dynamic-import relative-path depth mismatch in a scratch debug test briefly resolved into the MAIN CHECKOUT's `content/` directory instead of this worktree's (caused by copying the page source's 4-levels-up specifier into a test file only 1 level deep) — this was a test-authoring bug on my part, not a project/environment bug; the final test file uses the correct 1-level-up relative depth and was verified to resolve inside the worktree.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All shared homepage/booking components, the 404 page, the /book loading state, the blog CTA, and the author page now render fully localized text with locale-preserving links in all 7 locales.
- `freeze/75-13.freeze` queues this plan's 10 translated units for plan 75-18's `i18n/translation-manifest.json` freeze.
- `messages/*.json` edits for this plan are complete — the next sequential `messages/*.json`-touching plan can proceed without a concurrent-write conflict.
- `.planning/phases/75-e2e-verification-launch/deferred-items.md` + `WINDOWS.md` #20 flag `components/ArticleByline.tsx`'s own locale-dropping link for a future plan or 75-20's final re-verify.
- The two pre-existing/unrelated issue clusters noted above (tsc errors in 3 test files; 5 worktree-environment test failures) remain for whichever plan owns them, or resolve naturally once this worktree merges into the main checkout.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-26*

## Self-Check: PASSED
