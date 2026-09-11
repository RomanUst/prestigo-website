---
phase: 71-content-externalization-marketing-seo-pages
verified: 2026-09-11T20:31:45Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 71: Content Externalization — Marketing & SEO Pages Verification Report

**Phase Goal:** All long-form marketing and SEO page content across the public site — Home long-form sections, the 8 service pages, about/faq/contact/corporate, the legal pages, the 30 route-page bodies, and the blog — is moved out of hardcoded JSX/inline literals into a locale-aware content model (`content/routes/<locale>/`, `content/pages/<locale>/`, `content/blog/<locale>/`) resolved with English fallback. English output stays byte-for-byte unchanged; no non-EN translation happens this phase.

**Verified:** 2026-09-11T20:31:45Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The 30 route-page bodies are served from a locale-aware content model; no route-body copy remains hardcoded (SC1) | ✓ VERIFIED | `content/routes/en/*.json` = 30 files, matching 30 `app/[locale]/routes/*/` dirs. `grep -RlE "const (inclusions\|dayTripConfigurations\|whyBook\|faqs\|relatedRoutes) = \["` across all 30 `page.tsx` returns nothing. All 30 import `getRouteContent`. |
| 2 | Every route page renders identical English output at its current URL; indexable/noindex split preserved | ✓ VERIFIED | `tests/route-page-render.test.tsx` committed golden snapshot (full rendered `<main>` HTML incl. JSON-LD) for prague-vienna matches; diff of `e5af59f` shows literal→content mapping 1:1 with identical JSX tree. `grep -l noindex` across the 30 route pages unchanged from pre-phase structure (none of the 30 dedicated pages carry noindex; tier handling lives in the hub, untouched). |
| 3 | Home long-form, 8 service pages, about/faq/contact/corporate, and legal pages render from the locale-aware source; no hardcoded body copy remains (SC2) | ✓ VERIFIED | `content/pages/en/` holds `home.json`, `services.json` + 7 service subpages, `about.json`, `faq.json`, `contact.json`, `corporate.json`, `privacy.json`, `terms.json`, `data-deletion.json`, `blog.json` (17 page-content files). All 17 corresponding `page.tsx` files import `getPageContent`. |
| 4 | The blog moves to per-locale content (`content/blog/<locale>/`); `/blog` and `/blog/[slug]` render the active locale with EN fallback; existing EN posts stay at canonical `/blog/*` (SC3) | ✓ VERIFIED | `content/blog/en/` holds 10 relocated MDX posts (git-mv, history preserved). `lib/blog.ts` exports `contentDirFor`/`resolveLocalizedMdx`/`blogCanonical`; `app/[locale]/blog/[slug]/page.tsx` resolves localized→EN fallback and sets `canonical` via `blogCanonical(slug, isFallback)`. `JSX_POSTS` (3 legacy articles) untouched, still EN-only, still merged into `getAllPosts()`. |
| 5 | English site renders byte-for-byte unchanged; sitemap, canonical URLs, FAQPage/AggregateRating structured data, route SEO metadata unaffected; non-EN locales still render EN content (SC4) | ✓ VERIFIED | Full suite green (below). `tests/sitemap.test.ts`, `tests/jsonld.test.ts`, `tests/blog-jsonld.test.ts`, `tests/llms-content.test.ts`, `tests/route-prices-match.test.ts` all pass. FAQ/AboutPage/AggregateRating JSON-LD builders read from the same `content` object the visible copy renders (grep-verified in about/faq/home pages — no duplicate literal). |
| 6 | `getRouteContent`/`getPageContent` resolve with EN fallback for all locales (no 404) | ✓ VERIFIED | Both loaders implement identical `fs.existsSync(localized) ? localized : fallback` pattern reading `content/{routes,pages}/en/...json`; `tests/route-content.test.ts` explicitly asserts `getRouteContent('prague-vienna','ru')` deep-equals the `'en'` result. |
| 7 | `interpolate()` reproduces price-bearing strings byte-identically | ✓ VERIFIED | `lib/content-interpolate.ts` exists; used consistently across all 30 route pages and validated via `tests/route-content.test.ts` and `tests/routes-{a,b,c}.test.ts` parity assertions. |
| 8 | Content files authored as JSON, no executable content modules; shared type validates shape at the loader boundary (D-03) | ✓ VERIFIED | All `content/routes/en/*.json` and `content/pages/en/**/*.json` parse as pure JSON (no `.ts`/`.js` content files). `lib/route-content.ts` exports `type RouteContent` used as the loader's return-type cast. |
| 9 | Chrome-vs-content split follows short-reusable-label vs long-form-prose rule (D-05) | ✓ VERIFIED | `messages/en.json` `RoutePage` namespace holds only short chrome labels (section headings, button text); prose bodies (hero, FAQs, inclusions, narrative) live in `content/routes/en/*.json`. Namespace strings are consumed via `t('sectionLabels.*')` etc. in all 30 route pages (`getTranslations('RoutePage')` present in every page). |
| 10 | Phase delivered as a single phase across 71-01…71-09 with wave-based parallelization, one verify (D-09) | ✓ VERIFIED | 9 PLAN/SUMMARY pairs under this single phase directory; wave 1 = 71-01 (tracer), wave 2 = 71-02..71-09 (parallel groups); this is the single phase verification. |
| 11 | `getRouteContent`/`getPageContent` validate slug/page (incl. nested segments) against `^[a-z0-9-]+$` and locale against the typed allowlist BEFORE `path.join` (threat model T-71-01) | ✓ VERIFIED | Both `lib/route-content.ts` and `lib/page-content.ts` run the regex/segment + `routing.locales` checks and `throw` before any `path.join` call — read directly from source. `lib/blog.ts`'s `resolveLocalizedMdx` applies the equivalent guard (T-71-BLOG-01) before its own `path.join`/`fs.existsSync`. |
| 12 | No non-EN content authored anywhere (only `en/` populated) | ✓ VERIFIED | `find content/routes content/pages content/blog -mindepth 1 -maxdepth 1 -type d` returns only `en` under each root. |
| 13 | No shared `<RoutePageBody>`/`<PageBody>` renderer introduced (D-04) | ✓ VERIFIED | `grep -RIl "RoutePageBody\|PageBody" app lib components` returns nothing. |
| 14 | Locale-invariant route data (prices/distanceKm/duration/tier/metadataTitle) NOT moved out of `lib/routes.ts` (D-02) | ✓ VERIFIED | `lib/routes.ts` unchanged in shape — `Route` type and `ROUTES` array still carry `prices`, `distanceKm`, `duration`, `tier`, `metadataTitle`; file's own header comment confirms per-route body content stays in each `page.tsx`/its content JSON. |
| 15 | No new npm package added | ✓ VERIFIED | `git log --name-only <71-01>..<71-09-end> -- package.json package-lock.json` returns no hits; `package.json`'s only `next-intl` addition predates Phase 71 (Phase 68 commit `7d52265`). |

**Score:** 15/15 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/route-content.ts` | `RouteContent` type + `getRouteContent` | ✓ VERIFIED | Present, exports match, validates before path.join |
| `lib/page-content.ts` | `getPageContent(page, locale): unknown` | ✓ VERIFIED | Present, segment-wise validation for nested keys |
| `lib/content-interpolate.ts` | `interpolate(template, values)` | ✓ VERIFIED | Present, used across all converted pages |
| `content/routes/en/*.json` (30) | Full RouteContent shape per slug | ✓ VERIFIED | All 30 present, all parse, all satisfy the required-key shape |
| `content/pages/en/**/*.json` (17) | Bespoke per-page content | ✓ VERIFIED | services hub+7 subpages, home, about, faq, contact, corporate, privacy, terms, data-deletion, blog listing chrome |
| `content/blog/en/*.mdx` (10) | Relocated MDX posts | ✓ VERIFIED | `git mv` history preserved; JSX_POSTS (3) untouched, EN-only |
| `messages/en.json` `RoutePage` namespace | 30/30-verified chrome strings only | ✓ VERIFIED | 12 top-level keys, all consumed via `t()` in every route page |
| `tests/route-content.test.ts`, `tests/route-page-render.test.tsx`, `tests/routes-{a,b,c}.test.ts`, `tests/services-{a,b}.test.ts`, `tests/pages-a.test.ts`, `tests/legal.test.ts`, `tests/blog-locale-fallback.test.ts` | Parity + fallback + traversal test coverage | ✓ VERIFIED | All present and passing (see Behavioral Spot-Checks) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| 30 route `page.tsx` | `lib/route-content.ts` | `getRouteContent(slug, locale)` import + call | ✓ WIRED | Confirmed present in all 30 |
| 30 route `page.tsx` | `messages/en.json` `RoutePage` | `getTranslations('RoutePage')` + `t('sectionLabels.*')` etc. | ✓ WIRED | Confirmed present in all 30 |
| 17 non-route pages | `lib/page-content.ts` | `getPageContent(page, locale)` | ✓ WIRED | Confirmed present in all 17 |
| `app/[locale]/blog/[slug]/page.tsx` | `lib/blog.ts` | `resolveLocalizedMdx` + `blogCanonical` | ✓ WIRED | canonical → EN branch confirmed in `generateMetadata` |
| FAQ/About/Home JSON-LD builders | loaded `content` object | direct field reference (no duplicate literal) | ✓ WIRED | Confirmed in `app/[locale]/faq/page.tsx`, `app/[locale]/about/page.tsx`, `app/[locale]/page.tsx` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite green | `npx vitest run` | 118 files / 1348 tests passed, 10 skipped, 139 todo | ✓ PASS |
| `npx tsc --noEmit` no new errors | `npx tsc --noEmit` | Only 2 pre-existing errors in `tests/nav-auth.test.tsx`/`tests/passenger-actions.test.ts`, last touched Phase 70-08, unrelated to Phase 71 files | ✓ PASS |
| Loader path-traversal + invalid-locale rejection | `npx vitest run tests/route-content.test.ts` | 5/5 cases pass incl. traversal + invalid-locale throw | ✓ PASS |
| Golden EN render snapshot (prague-vienna) | `npx vitest run tests/route-page-render.test.tsx` | Full rendered `<main>` HTML (incl. JSON-LD) matches committed snapshot | ✓ PASS |
| SEO/JSON-LD/sitemap regression | `npx vitest run tests/sitemap.test.ts tests/jsonld.test.ts tests/blog-jsonld.test.ts tests/llms-content.test.ts tests/route-prices-match.test.ts` | 35/35 pass | ✓ PASS |
| Legal + blog-fallback + route-content suites | `npx vitest run tests/legal.test.ts tests/blog-locale-fallback.test.ts tests/route-content.test.ts tests/route-page-render.test.tsx` | 24/24 pass | ✓ PASS |
| Deferred-items "5 failing files" claim re-checked on main | worktree-only `node_modules` gap, not present on main | Confirmed: full suite on this (main-branch) checkout is 100% green | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CNT-01 | 71-01, 71-02, 71-03, 71-04 | Route-page bodies → locale-aware content model | ✓ SATISFIED | 30/30 route content JSON + wired pages |
| CNT-02 | 71-05, 71-06, 71-07, 71-08 | Home/service/about-faq-contact-corporate/legal pages localizable | ✓ SATISFIED | 17/17 page-content JSON + wired pages |
| CNT-03 | 71-09 | Blog per-locale content, listing + `[slug]` render active locale | ✓ SATISFIED | `content/blog/en/`, `lib/blog.ts` locale-aware, canonical→EN fallback |

No orphaned requirements — REQUIREMENTS.md's CNT-01/02/03 all map to a declared plan `requirements:` field.

### Anti-Patterns Found

None. `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` scan across all 121 phase-71-touched files under `content/`, `lib/`, `app/`, `tests/` returned zero debt markers (2 informational matches were a JSON prose sentence describing Ostrava's geography and a doc-comment explaining the interpolation mechanism — not stubs).

### Prohibitions Checked

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| No non-EN content authored | ✓ HOLDS | Only `en/` subdirs exist under `content/routes`, `content/pages`, `content/blog` |
| No shared `<RoutePageBody>`/`<PageBody>` renderer | ✓ HOLDS | grep across app/lib/components returns nothing |
| Locale-invariant route data not moved out of `lib/routes.ts` | ✓ HOLDS | `Route` type/`ROUTES` array unchanged in shape |
| No new npm package added | ✓ HOLDS | No phase-71 commit touches package.json/package-lock.json |
| Loaders never imported into a client component | ✓ HOLDS | No `'use client'` file imports `route-content`/`page-content` |
| Legal entity details reproduced verbatim | ✓ HOLDS | `chelautotrans s.r.o.`, `IČO: 05650801`, `Spojovací 685, Vysoký Újezd` all present verbatim in privacy.json/terms.json |
| Pitfall-1 non-uniform section labels stay per-route (not in shared namespace) | ✓ HOLDS | `prague-berlin.json.dayTripLabel = "Trip Configurations"`, `prague-hradec-kralove.json.faqsHeading = "Common questions"`, both read from content, not `t()` |

### Human Verification Required

None. All must-haves resolved programmatically with direct codebase evidence (grep, JSON parsing, git history, full test-suite execution).

### Gaps Summary

No gaps. One minor documented deviation (test file named `tests/pages-a.test.ts` instead of the PLAN.md frontmatter's `tests/marketing.test.ts`) was explicitly logged in `71-07-SUMMARY.md` as a naming-convention alignment with sibling plans' `tests/services-a.test.ts`/`tests/routes-a/b/c.test.ts` pattern — content and coverage match the plan's intent; this is not a functional gap.

---

_Verified: 2026-09-11T20:31:45Z_
_Verifier: Claude (gsd-verifier)_
