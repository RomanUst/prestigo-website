---
phase: 75-e2e-verification-launch
plan: 11
subsystem: i18n
tags: [next-intl, content-model, en-leak-fix, translation, static-pages, getPathname]

requires:
  - phase: 75-e2e-verification-launch (plan 06/07/08/09/10)
    provides: content-model + getPathname refactor pattern (golden-snapshot-first commit ordering) reused directly for the services hub, 7 service pages, and 6 static pages
  - phase: 71-content-externalization-marketing-seo-pages
    provides: content/pages/<locale>/<page>.json content model + getPageContent() EN-fallback loader
  - phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
    provides: '@/i18n/routing getPathname() locale-aware navigation bridge (I18N-04)'
provides:
  - "lib/localized-href.ts — localizedHref(locale, href) wraps content-provided and literal internal hrefs (raw <a href>, template-literal route links) through getPathname(); returns external/mailto/tel/hash/protocol-relative/static-asset hrefs and the empty/undefined edge cases unchanged (T-75-23). Reusable wrapper for plans 75-13/75-14."
  - "All 14 static/service pages (services hub, airport-transfer, city-rides, concierge, corporate-accounts, group-transfers, intercity-routes, vip-events, about, terms, privacy, faq, blog index, data-deletion) route every internal href through localizedHref() — closes ~30 locale-dropping-navigation findings from 75-EN-LEAK-AUDIT.md (R3, owning plan 75-11 rows)"
  - "hero.imageAlt in content/pages/<locale>/services/{airport-transfer,city-rides,concierge,corporate-accounts,group-transfers,intercity-routes,vip-events}.json and about.json (7 locales x 8 units) — EN byte-identical to the prior hardcoded alt, ru/es/fr/ar/hi/zh hand-translated"
  - "D-09 fix: hi/zh content/pages/corporate.json usagePatterns.headingItalic and hi content/pages/data-deletion.json section3.facebookLinkLabel translated (were English-identical at planning time, WINDOWS #6 extended)"
  - "tests/localized-href.test.ts, tests/static-pages-locale.test.tsx — full behavior-contract + render-proof coverage across all 14 pages"
  - ".planning/phases/75-e2e-verification-launch/freeze/75-11.freeze — 10 pattern lines queuing this plan's translated units for the 75-18 manifest freeze"
affects: [75-13, 75-14, 75-18, 75-20]

actuals:
  tokens: 68000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "lib/localized-href.ts is the single wrapper for internal hrefs that are NOT already routed through next-intl's <Link>/useRouter bridge — raw <a href> anchors, template-literal route links, and content-JSON-provided hrefs (s.href/s.bookHref/c.href). Rule: exactly one leading slash AND no file extension on the last path segment -> getPathname({ locale, href }); everything else (external URLs, mailto:, tel:, hash-only, protocol-relative '//...', static assets, empty/undefined) returned unchanged."
    - "hero.imageAlt lives as the LAST key in each content file's hero object, mirroring 75-10's convention — added mechanically via targeted line-based sed inserts (not JSON.parse+stringify) to avoid reformatting any other field."
    - "Content-provided hrefs (services hub's s.href/s.bookHref, concierge's pairsWell[].href) are wrapped with localizedHref() at the render call site, same as literal/template-literal hrefs — no special-casing by href source."
    - "getLocale()-based pages (services hub, city-rides, concierge, intercity-routes, data-deletion, airport-transfer) call localizedHref(locale, ...) using the already-resolved `locale` local; params-based pages (corporate-accounts, group-transfers, vip-events, about, terms, privacy, faq, blog index) destructure `{ locale }` from the awaited `params` prop the same way generateMetadata() already does."

key-files:
  created:
    - lib/localized-href.ts
    - tests/localized-href.test.ts
    - tests/static-pages-locale.test.tsx
    - .planning/phases/75-e2e-verification-launch/freeze/75-11.freeze
  modified:
    - app/[locale]/services/page.tsx
    - app/[locale]/services/airport-transfer/page.tsx
    - app/[locale]/services/city-rides/page.tsx
    - app/[locale]/services/concierge/page.tsx
    - app/[locale]/services/corporate-accounts/page.tsx
    - app/[locale]/services/group-transfers/page.tsx
    - app/[locale]/services/intercity-routes/page.tsx
    - app/[locale]/services/vip-events/page.tsx
    - app/[locale]/about/page.tsx
    - app/[locale]/terms/page.tsx
    - app/[locale]/privacy/page.tsx
    - app/[locale]/faq/page.tsx
    - app/[locale]/blog/page.tsx
    - app/[locale]/data-deletion/page.tsx
    - content/pages/{en,ru,es,fr,ar,hi,zh}/services/{airport-transfer,city-rides,concierge,corporate-accounts,group-transfers,intercity-routes,vip-events}.json (49 files, hero.imageAlt)
    - content/pages/{en,ru,es,fr,ar,hi,zh}/about.json (7 files, hero.imageAlt)
    - content/pages/hi/corporate.json, content/pages/zh/corporate.json (usagePatterns.headingItalic)
    - content/pages/hi/data-deletion.json (section3.facebookLinkLabel)

key-decisions:
  - "localizedHref() treats exactly-one-leading-slash + no-file-extension-on-last-segment as the internal-path rule, matching the plan's full behavior contract including the T-75-23 protocol-relative-URL negative case ('//evil.com' never treated as internal)"
  - "Content-provided hrefs are wrapped at the same call site as literal hrefs (no separate helper for JSON-sourced links) — keeps the pattern uniform for future content fields"
  - "hero.imageAlt inserted via targeted single-line sed edits (matching each locale's unique ctaSecondary/intro line) rather than JSON.parse+stringify, preserving every other field's exact formatting across 56 touched content files"
  - "BlogCard's own href (`/blog/${slug}`) is left untouched and mocked out in the blog-index render test — it is a real, unrelated locale-dropping defect explicitly owned by plan 75-13 per 75-EN-LEAK-AUDIT.md, not in this plan's files_modified"
  - "The pre-existing Uber-comparison FAQ answer in services/airport-transfer.json (content, not authored by this plan) was left untouched — out of this plan's scope (content-fix rules only cover D-07/D-08/D-09 named units)"

requirements-completed: [VER-01]  # frontmatter mirrors this plan's own `requirements` field per template convention; NOT run through requirements.mark-complete here — VER-01 is shared by all 21 phase-75 plans and stays Pending in REQUIREMENTS.md until every plan finishes and the phase verifier passes. Per worktree-mode instructions, STATE.md/ROADMAP.md/REQUIREMENTS.md are NOT touched by this executor — the orchestrator owns those writes after merge.

coverage:
  - id: D1
    description: "lib/localized-href.ts exports localizedHref(locale, href) implementing the full behavior contract (internal root-relative prefixing, external/mailto/tel/hash/protocol-relative/static-asset pass-through, empty/undefined edge cases)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/localized-href.test.ts > localizedHref() (11 cases covering every behavior + T-75-23)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every internal link on all 14 touched pages (services hub, 7 service pages, about, terms, privacy, faq, blog index, data-deletion) — literal, template-literal, and content-provided hrefs — resolves through localizedHref() so a non-EN locale never drops its prefix"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/static-pages-locale.test.tsx > All touched pages — locale:'ar' renders every single-slash href prefixed with /ar/ (75-11 Task 2) (13 pages, it.each) + Task 1 tracer en/ru assertions on airport-transfer"
        status: pass
      - kind: other
        ref: "grep -L 'localizedHref|getPathname' app/[locale]/services/*/page.tsx app/[locale]/services/page.tsx app/[locale]/about/page.tsx returns no file"
        status: pass
    human_judgment: false
  - id: D3
    description: "The hero image alt of the services hub's 7 service pages + about comes from content hero.imageAlt (EN byte-identical to the prior hardcoded alt, 6 locales translated)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/static-pages-locale.test.tsx > hero.imageAlt content-model rollout — 7 service pages + about x 7 locales (D-07) (8 units x EN-byte-identical + 6-locale-non-empty check)"
        status: pass
    human_judgment: false
  - id: D4
    description: "hi/zh corporate.json usagePatterns.headingItalic and hi data-deletion.json section3.facebookLinkLabel are translated (D-09, were byte-identical to EN at planning time)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/static-pages-locale.test.tsx > D-09 content-fix units (3 assertions: hi/zh headingItalic differ from EN, hi facebookLinkLabel differs from EN and keeps the Facebook token in Latin)"
        status: pass
    human_judgment: false
  - id: D5
    description: "EN output of every touched page is unchanged (EN hrefs identical because getPathname returns the unprefixed path for en; EN alts moved verbatim)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/static-pages-locale.test.tsx > ServicesPage (hub) and AboutPage — locale:'en' hrefs stay unchanged (regression backstop) + Task 1 tracer en assertions on airport-transfer"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit reports zero errors under every file this plan touched"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 11: Services Hub, Service Pages & Static Pages — Locale Links + Content-Driven Alts Summary

**14 pages (services hub, 7 service pages, about/terms/privacy/faq/blog-index/data-deletion) now keep visitors in their locale on every internal link via a new `localizedHref()` bridge, carry translated hero image alts in the content model, and the last 2 English-identical content units (hi/zh corporate headings, hi Facebook-deletion label) are fixed.**

## Performance

- **Duration:** 20 min (approx.)
- **Started:** 2026-09-25T15:09:00Z (approx.)
- **Completed:** 2026-09-25T15:29:31Z
- **Tasks:** 2
- **Files modified:** 78 (1 lib helper, 14 pages, 60 content files, 2 test files, 1 freeze file)

## Accomplishments

- **Task 1 (tracer):** created `lib/localized-href.ts` — `localizedHref(locale, href)` wraps every internal `<a href>` through `getPathname({ locale, href })` from `@/i18n/routing`, while returning external URLs, `mailto:`/`tel:`, hash-only anchors, protocol-relative URLs (`//host`, T-75-23), static asset paths (file extension on the last segment), and the empty/undefined edge cases completely unchanged. Applied it to `app/[locale]/services/airport-transfer/page.tsx` (3 anchors) and moved its hero `Image` alt to `content.hero.imageAlt` across all 7 locale content files (EN byte-identical to the prior hardcoded alt). New `tests/localized-href.test.ts` (11 cases) and `tests/static-pages-locale.test.tsx` (en/ru tracer proof) both green.
- **Task 2:** repeated the same link treatment across the other 13 pages — the services hub (including its content-provided `s.href`/`s.bookHref` card links and `c.href` pairs-well links on concierge), city-rides, corporate-accounts, group-transfers, vip-events, intercity-routes (including the template-literal `/routes/${slug}` cards), about (including the template-literal `/authors/${slug}` link), terms, privacy, faq, blog index, and data-deletion. Moved `hero.imageAlt` into content for city-rides/concierge/corporate-accounts/group-transfers/intercity-routes/vip-events/about (49 + 7 = 56 files total across Task 1+2). Translated the last 2 D-09 English-identical units: hi/zh `corporate.json` `usagePatterns.headingItalic` and hi `data-deletion.json` `section3.facebookLinkLabel` (kept the "Facebook" brand token in Latin per D-08 rule 2). Extended `tests/static-pages-locale.test.tsx` with hero-alt coverage (8 units x 7 locales), the D-09 fix assertions, an EN-unchanged regression backstop for the hub + about, and an all-13-pages `locale:'ar'` href-prefix sweep (dynamic per-page import, two invocation shapes: `getLocale()`-based and `params`-based). Created `freeze/75-11.freeze` with 10 pattern lines.
- Verification: `npx vitest run tests/static-pages-locale.test.tsx tests/services-a.test.ts tests/services-b.test.ts tests/pages-a.test.ts tests/legal.test.ts` — 63/63 pass; `npx tsc --noEmit` clean under every file this plan touched; `grep -L "localizedHref|getPathname" app/[locale]/services/*/page.tsx app/[locale]/services/page.tsx app/[locale]/about/page.tsx` returns no file; full `npx vitest run` — 2185/2185 tests pass (5 pre-existing, unrelated worktree-environment test-suite failures, documented below).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — localizedHref helper + /services/airport-transfer end-to-end** - `bd6e68e3` (feat)
2. **Task 2: Remaining 13 pages + hero alts + D-09 content fixes + tests + freeze** - `e0540eeb` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

_Note: no TDD tasks in this plan (type="tracer" and type="auto"), so no separate RED/GREEN commits._

## Files Created/Modified

- `lib/localized-href.ts` (new) - `localizedHref(locale, href)` locale-aware href wrapper
- `app/[locale]/services/page.tsx` - hub CTA + content-provided `s.href`/`s.bookHref` links
- `app/[locale]/services/airport-transfer/page.tsx` - hero/CTA links + content-driven hero alt
- `app/[locale]/services/city-rides/page.tsx` - hero/CTA links + content-driven hero alt
- `app/[locale]/services/concierge/page.tsx` - hero/CTA/pairsWell links + content-driven hero alt
- `app/[locale]/services/corporate-accounts/page.tsx` - hero/CTA links + content-driven hero alt
- `app/[locale]/services/group-transfers/page.tsx` - hero/CTA links + content-driven hero alt
- `app/[locale]/services/intercity-routes/page.tsx` - hero/CTA/template-literal route links + content-driven hero alt
- `app/[locale]/services/vip-events/page.tsx` - hero/CTA links + content-driven hero alt
- `app/[locale]/about/page.tsx` - authors template link + CTA links + content-driven hero alt
- `app/[locale]/terms/page.tsx` - inline booking/privacy links + CTA links
- `app/[locale]/privacy/page.tsx` - CTA secondary link
- `app/[locale]/faq/page.tsx` - CTA links
- `app/[locale]/blog/page.tsx` - emptyState/CTA links
- `app/[locale]/data-deletion/page.tsx` - CTA secondary link
- `content/pages/{en,ru,es,fr,ar,hi,zh}/services/*.json` (49 files) - `hero.imageAlt` added as the last hero key
- `content/pages/{en,ru,es,fr,ar,hi,zh}/about.json` (7 files) - `hero.imageAlt` added as the last hero key
- `content/pages/hi/corporate.json`, `content/pages/zh/corporate.json` - `usagePatterns.headingItalic` translated
- `content/pages/hi/data-deletion.json` - `section3.facebookLinkLabel` translated
- `tests/localized-href.test.ts` (new) - full behavior-contract coverage (11 cases)
- `tests/static-pages-locale.test.tsx` (new) - tracer + all-14-pages coverage (28 tests)
- `.planning/phases/75-e2e-verification-launch/freeze/75-11.freeze` (new) - 10 pattern lines for plan 75-18's manifest freeze

## Decisions Made

- Wrapped content-provided hrefs (`s.href`, `s.bookHref`, `c.href`) at the same render-site call as literal/template-literal hrefs — no separate helper needed, keeping the pattern uniform regardless of href source.
- Inserted `hero.imageAlt` via targeted single-line `sed` edits (locating each locale file's unique `ctaSecondary`/`intro` line) rather than a JSON parse/stringify round-trip, to avoid reformatting any other field across the 56 touched content files.
- Left `BlogCard`'s own unprefixed href untouched (mocked out in the render test) — it is a real, distinct locale-dropping defect that 75-EN-LEAK-AUDIT.md explicitly assigns to plan 75-13, not this plan's `files_modified`.
- Left the pre-existing Uber-comparison FAQ answer in `services/airport-transfer.json` untouched — it predates this plan and is out of scope (only the D-07/D-08/D-09 named content units were fixed).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Pre-existing, out-of-scope `tsc --noEmit` failures** (not introduced by this plan, files never touched by this plan, last modified 2026-09-23 — two days before this plan started): `tests/i18n-translate-dnt.test.ts` (2 errors), `tests/nav-auth.test.tsx` (5 errors), `tests/passenger-actions.test.ts` (1 error). Zero `tsc` errors exist under any file this plan modified. Identical to the issue documented in 75-10-SUMMARY.md.
- **Pre-existing, out-of-scope full-suite `vitest run` failures** (5 suites, worktree-environment-specific, not introduced by this plan): `tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts` all fail with `Cannot find module '../node_modules/next-intl/dist/esm/development/server.react-server.js'` — a relative path into `node_modules` that only resolves in the main checkout, not this worktree's symlinked stub `node_modules`. None of the 5 failing files were touched by this plan. Identical to the issue documented in 75-10-SUMMARY.md; all 2185 other tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 14 touched pages keep visitors in their locale on every internal link, carry translated hero alts in all 7 locales, and the last 2 D-09 English-identical content units are closed.
- `lib/localized-href.ts` is ready for reuse by plans 75-13 and 75-14 (blog/route-adjacent components and booking-widget navigation).
- `freeze/75-11.freeze` queues this plan's translated units (8 `hero.imageAlt` + 2 D-09 fixes) for plan 75-18's `i18n/translation-manifest.json` freeze.
- The two pre-existing/unrelated issue clusters noted above (tsc errors in 3 test files; 5 worktree-environment test failures) remain for whichever plan owns them, or for the main-checkout merge to resolve naturally (the node_modules symlink issue is worktree-specific and will not reproduce after merge).

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*

## Self-Check: PASSED

All created/modified files found on disk (`lib/localized-href.ts`, `tests/localized-href.test.ts`, `tests/static-pages-locale.test.tsx`, `freeze/75-11.freeze`, content files); both task commits (`bd6e68e3`, `e0540eeb`) found in git history on `worktree-agent-a0acd6f0c0627e1d1`.
