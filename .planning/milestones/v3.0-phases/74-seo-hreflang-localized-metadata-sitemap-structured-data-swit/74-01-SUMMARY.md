---
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
plan: 01
subsystem: seo
tags: [nextjs, next-intl, hreflang, jsonld, sitemap, metadata, i18n]

requires:
  - phase: 73-non-latin-rtl-infra-ar-hi-zh
    provides: 7 fully-populated locale content trees (routes/pages/blog), BCP-47 script needs (zh Simplified)
provides:
  - "getAlternates(path, opts) — index-aware (D-06) + translation-aware (D-07) hreflang cluster helper in lib/seo.ts, the single source of truth for both page-level generateMetadata and app/sitemap.ts"
  - "LOCALE_ENDONYMS + BCP47_TAG (zh -> zh-Hans) structural maps in i18n/locales.ts"
  - "buildRouteJsonLd(route, slug, opts) — locale-aware inLanguage + EN-byte-parity-preserving name/description in lib/jsonld.ts"
  - "app/sitemap.ts entry() delegating to getAlternates() — SEO-03 complete (full site sitemap cluster)"
  - "prague-vienna wired end-to-end (helper -> page -> jsonld) as the proven tracer contract for the Wave-2 55-call-site sweep"
affects: [74-02, 74-03, 74-04, 74-05, 74-06]

actuals:
  tokens: 27100
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "getAlternates(path, opts) single choke point read by every generateMetadata() and app/sitemap.ts entry() — cannot diverge"
    - "hasLocaleContent() fs.existsSync probe against content/{routes,pages,blog}/<locale>/ mirrors lib/blog.ts's D-07 precedent"
    - "BCP47_TAG map feeds both hreflang keys (getAlternates) and JSON-LD inLanguage (buildRouteJsonLd)"
    - "Locale-conditional JSON-LD text: EN keeps its pre-phase hardcoded template; only non-EN locales branch to content-sourced opts.name/description"

key-files:
  created:
    - tests/seo.test.ts
  modified:
    - lib/seo.ts
    - i18n/locales.ts
    - lib/jsonld.ts
    - app/sitemap.ts
    - app/[locale]/routes/prague-vienna/page.tsx
    - tests/sitemap.test.ts
    - tests/jsonld.test.ts
    - tests/__snapshots__/route-page-render.test.tsx.snap

key-decisions:
  - "Partial-translation RED test grounded against a real JSX_POSTS blog slug (prague-airport-to-city-center) rather than a hypothetical fixture — the real content/routes and content/pages trees are 100% translated across all 7 locales (RESEARCH's own finding), so no genuine 'some locales present, some absent' case exists there; the 3 legacy JSX blog articles (zero content/blog files in any locale) are the only real grounded exclusion case in the repo"
  - "Home-page hreflang URL for the default locale (en) collapses getPathname's bare '/' result to the bare BASE URL (no trailing slash) so it matches the canonical/x-default URL shape"
  - "/fleet, /authors/roman-ustyugov, /book, /book/multi-day, /routes (hub) treated as chrome-only pages (no content ref) per the plan's literal instruction — all 7 locales included in their hreflang cluster even though /fleet's body is still hardcoded EN (Deferred Idea, explicitly out of Phase 74 scope per PROJECT.md); UI chrome around these pages is otherwise already externalized via message catalogs"
  - "JSX_POSTS sitemap/page entries pass a blog content ref (not omitted) so the D-07 exclusion gate naturally collapses them to en + x-default, since no content/blog/<locale> file exists for these 3 legacy articles in any locale including en"

requirements-completed: [SEO-01, SEO-03, SEO-04]

coverage:
  - id: D1
    description: "getAlternates(path, opts) emits a full BCP-47-tagged hreflang cluster (all 7 locales incl. zh-Hans) + x-default for an indexable, fully-translated page"
    requirement: "SEO-01"
    verification:
      - kind: unit
        ref: "tests/seo.test.ts#getAlternates > emits one key per locale (BCP-47 tag) + x-default for an indexable, fully-translated route"
        status: pass
      - kind: unit
        ref: "tests/seo.test.ts#getAlternates > key order is deterministic — routing.locales order with x-default last"
        status: pass
    human_judgment: false
  - id: D2
    description: "No hreflang cluster is ever emitted for a noindex page (D-06); canonical is preserved"
    requirement: "SEO-01"
    verification:
      - kind: unit
        ref: "tests/seo.test.ts#getAlternates > returns an empty languages cluster (but keeps canonical) for a noindex page — D-06"
        status: pass
    human_judgment: false
  - id: D3
    description: "A locale with no genuine translation file is excluded from the cluster (D-07); en + x-default always present"
    requirement: "SEO-01"
    verification:
      - kind: unit
        ref: "tests/seo.test.ts#getAlternates > excludes locales with no genuine translation file, keeping en + x-default — D-07"
        status: pass
    human_judgment: false
  - id: D4
    description: "app/sitemap.ts emits the same getAlternates()-sourced cluster as page-level metadata for any URL (SEO-03)"
    requirement: "SEO-03"
    verification:
      - kind: unit
        ref: "tests/sitemap.test.ts#sitemap alternates cluster (SEO-03, delegates to getAlternates) > a fully-translated route entry (prague-vienna) carries the full 7-locale + x-default cluster"
        status: pass
      - kind: unit
        ref: "tests/sitemap.test.ts#sitemap alternates cluster (SEO-03, delegates to getAlternates) > a legacy JSX_POSTS blog entry (no content/blog file in any locale) collapses to en + x-default only"
        status: pass
    human_judgment: false
  - id: D5
    description: "buildRouteJsonLd emits inLanguage (BCP-47, zh -> zh-Hans); EN name/description stay byte-for-byte the pre-phase hardcoded template; non-EN locales use content-sourced text (SEO-04, D-09)"
    requirement: "SEO-04"
    verification:
      - kind: unit
        ref: "tests/jsonld.test.ts#buildRouteJsonLd — inLanguage + locale-conditional name/description (SEO-04) > EN with no opts keeps the pre-phase hardcoded template and inLanguage=\"en\""
        status: pass
      - kind: unit
        ref: "tests/jsonld.test.ts#buildRouteJsonLd — inLanguage + locale-conditional name/description (SEO-04) > a non-EN locale uses opts.name/description and the zh-Hans BCP-47 tag for zh"
        status: pass
    human_judgment: false
  - id: D6
    description: "prague-vienna renders end-to-end with the new helper: head alternates from getAlternates(), JSON-LD carries inLanguage, proving the seo.ts -> page -> sitemap -> jsonld spine on one path; EN byte-parity preserved apart from the added inLanguage key"
    requirement: "SEO-01, SEO-04"
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueViennaPage — render byte-parity proof > renders and matches the golden EN snapshot"
        status: pass
      - kind: other
        ref: "scratch script diff: stripping \"inLanguage\":\"en\", from the regenerated snapshot reproduces the prior committed snapshot byte-for-byte"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-23
status: complete
---

# Phase 74 Plan 01: SEO Spine Tracer — hreflang, sitemap, JSON-LD inLanguage Summary

**Extended `getAlternates(path, opts)` into an index-aware + translation-aware BCP-47 hreflang cluster helper consumed identically by `app/sitemap.ts` and `prague-vienna`'s `generateMetadata`, plus localized JSON-LD `inLanguage` with EN structured-data byte-parity preserved.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments

- `lib/seo.ts`: `getAlternates(canonicalPath, opts)` now accepts `{ indexable?, content? }` — noindex pages emit `languages: {}` (D-06), and a `content` ref gates the cluster to locales with a genuine translation file via a new `hasLocaleContent()` fs probe (D-07), validated against `routing.locales` before any filesystem access
- `i18n/locales.ts`: added `LOCALE_ENDONYMS` and `BCP47_TAG` (`zh` → `zh-Hans`) as `const` exports, keeping the file's zero next-intl/next/React import constraint intact
- `app/sitemap.ts`: `entry()` now delegates `alternates.languages` to `getAlternates()` instead of a hand-rolled `{en, x-default}` literal — the sitemap and every page's hreflang `<link>` tags read from one source of truth (SEO-03 complete for the whole site)
- `lib/jsonld.ts`: `buildRouteJsonLd()` gained an optional `{ locale, name, description }` param — adds `inLanguage` to the Service node; the EN template stays byte-for-byte unchanged (only non-EN locales branch to content-sourced text), closing the SEO-04 byte-parity constraint
- `app/[locale]/routes/prague-vienna/page.tsx`: wired end-to-end — `generateMetadata` now calls `getAlternates()` with the route content ref, and the page body's `buildRouteJsonLd` call passes locale + plain-`interpolate()`'d title/description
- Regenerated the golden byte-parity snapshot and proved programmatically (scratch diff) that the only change versus the prior committed snapshot is the added `inLanguage` key — no price, `priceValidUntil`, name, description, or other body drift

## Task Commits

1. **Task 1: RED — tests/seo.test.ts pins the new getAlternates contract** - `8528fa3` (test)
2. **Task 2: GREEN — extend getAlternates + locales maps + full sitemap cluster** - `dc93c53` (feat)
3. **Task 3: Wire prague-vienna end-to-end + JSON-LD inLanguage + snapshot regen** - `544d16a` (feat)

_TDD gate sequence: RED (`test(74-01)`) precedes GREEN (`feat(74-01)`) — verified via `git log --grep`._

## Files Created/Modified

- `tests/seo.test.ts` - New unit suite pinning the `getAlternates(path, opts)` contract (7 tests)
- `lib/seo.ts` - Extended `getAlternates` with `indexable`/`content` opts + `hasLocaleContent()`
- `i18n/locales.ts` - Added `LOCALE_ENDONYMS` + `BCP47_TAG` structural maps
- `lib/jsonld.ts` - Extended `buildRouteJsonLd` with `opts` + `inLanguage`
- `app/sitemap.ts` - `entry()` now delegates to `getAlternates()`; all 30 route entries + hub/service/blog pages wired with appropriate content refs
- `app/[locale]/routes/prague-vienna/page.tsx` - `generateMetadata` + JSON-LD call wired to the new helpers
- `tests/sitemap.test.ts` - Added cluster-identity assertions (fully-translated route, JSX_POSTS EN-fallback collapse)
- `tests/jsonld.test.ts` - Added `inLanguage` + locale-conditional name/description assertions
- `tests/__snapshots__/route-page-render.test.tsx.snap` - Regenerated (only `inLanguage` key added, verified)

## Decisions Made

- **Partial-translation RED test grounded in reality, not a hypothetical fixture.** RESEARCH found all 7 locale content trees for routes/pages/blog are 100% populated — there is no genuine "some locales present, some absent" content key anywhere in the repo. The only real exclusion case is the 3 legacy `JSX_POSTS` blog articles, which have zero `content/blog/<locale>/*.mdx` files in **any** locale (not even `en`). Used `prague-airport-to-city-center` (a real JSX_POSTS slug) as the grounded D-07 exclusion test case — it correctly demonstrates every non-en locale key being omitted while `en` is always force-included.
- **Home-page URL normalization.** `getPathname({ locale: 'en', href: '/' })` returns the bare `'/'` for the default locale; collapsed that to `BASE` (no trailing slash) so the hreflang `en` URL matches the `canonical`/`x-default` URL shape for the home page.
- **Chrome-only page classification.** `/fleet`, `/authors/roman-ustyugov`, `/book`, `/book/multi-day`, and the `/routes` hub have no `content/pages/*.json` file, so they're passed with no `content` ref per the plan's literal instruction — all 7 locales are included in their hreflang cluster. This matches the design intent ("UI chrome already externalized via message catalogs → all locales valid") but is a known imprecision for `/fleet` specifically, whose body is still hardcoded EN (explicitly listed as a Deferred Idea in PROJECT.md, out of Phase 74 scope — not introduced or worsened by this plan).
- **JSX_POSTS sitemap/page entries pass a blog content ref** (not omitted) — this makes the D-07 gate naturally collapse them to `en + x-default` only, which is the semantically correct behavior for EN-only legacy articles, without any special-casing.

## Deviations from Plan

None — plan executed exactly as written. The one adaptation (grounding the partial-translation test case in the JSX_POSTS blog slug rather than a hypothetical routes/pages key) is documented above under Decisions since it follows directly from the plan's own instruction to "choose one by reading the tree so the test is grounded, not hypothetical" — the tree simply doesn't contain a routes/pages partial case, so the grounded alternative was used instead.

## Issues Encountered

- **Worktree `node_modules` was an empty stub** (0 items) — symlinked to the main checkout's `node_modules` per the worktree execution protocol; not committed.
- **5 pre-existing test suites fail in this worktree** (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`) due to a documented worktree-only limitation: they resolve `next-intl/server`'s react-server build via a relative `../node_modules/...` path, which Vite's dev-server `fs.strict` denies once that path resolves through a symlink outside the worktree root. This is the exact limitation `tests/route-page-render.test.tsx`'s own header comment already documents and works around (by mocking `next-intl/server` directly instead). None of the 5 failing files reference anything touched by this plan (`seo`/`jsonld`/`sitemap`/`prague-vienna` — confirmed via grep, zero hits) — out of scope per the Scope Boundary rule, not fixed here.
- Pre-existing TypeScript errors in `tests/i18n-translate-dnt.test.ts`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts` (unrelated files) — confirmed pre-existing per PROJECT.md's "Clear pre-existing red test baseline" tracked item; not touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `getAlternates(path, opts)` contract is now proven end-to-end on `prague-vienna` and is the locked signature for the Wave-2 sweep across the remaining ~55 call sites (74-02 through 74-06).
- `app/sitemap.ts` is fully wired — SEO-03 is complete for the entire site, not just the tracer page.
- `lib/jsonld.ts`'s `buildRouteJsonLd` signature (`opts?: { locale, name, description }`) is the pattern the remaining 29 route pages' JSON-LD calls should follow.
- No blockers for the next plan.

---
*Phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit*
*Plan: 01*
*Completed: 2026-09-23*

## Self-Check: PASSED

All created/modified files verified present on disk (`tests/seo.test.ts`, `lib/seo.ts`, `i18n/locales.ts`, `lib/jsonld.ts`, `app/sitemap.ts`, `app/[locale]/routes/prague-vienna/page.tsx`, `tests/__snapshots__/route-page-render.test.tsx.snap`). All 3 task commits (`8528fa3`, `dc93c53`, `544d16a`) verified present in `git log`. All 28 tests across `tests/seo.test.ts`, `tests/sitemap.test.ts`, `tests/jsonld.test.ts`, `tests/route-page-render.test.tsx` pass. Plan-level `<verification>` re-run and confirmed green.
