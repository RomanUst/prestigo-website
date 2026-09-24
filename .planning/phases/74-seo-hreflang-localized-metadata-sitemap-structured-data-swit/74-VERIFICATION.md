---
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
verified: 2026-09-24T02:10:00Z
status: passed
score: 17/17 must-haves verified
gap_closure: "2026-09-24 — orchestrator fixed the sitemap gap inline (commit 4a1571f): middleware matcher now excludes txt/xml/webmanifest; tests/middleware-matcher.test.ts locks it; live dev curl /sitemap.xml, /robots.txt, /llms.txt, /llms-full.txt, /BingSiteAuth.xml, IndexNow key → all 200, no x-middleware-rewrite, sitemap has 63 URLs with zh-Hans alternates. Full suite 1671 passed / 0 failed. Production takes effect on deploy."
behavior_unverified: 0
overrides_applied: 0
gaps:

  - truth: "app/sitemap.ts feeds a real, crawlable sitemap.xml to search engines (SEO-03 / Goal: 'getAlternates() that also feeds the sitemap')"
    status: closed
    reason: "The sitemap() function itself is correct (unit-tested, delegates to getAlternates() with an identical cluster to every page — confirmed via tests/sitemap.test.ts, 3/3 passing), but the live HTTP route /sitemap.xml is completely unreachable. next-intl's middleware rewrites the unprefixed request to /en/sitemap.xml (confirmed via `x-middleware-rewrite: /en/sitemap.xml` response header on both a local dev server and production), and because app/sitemap.ts is a root-level Next.js file convention route (not nested under app/[locale]/), that rewritten path does not exist — Next.js resolves it to a 404. Reproduced on https://rideprestigo.com/sitemap.xml (live production, HTTP/2 404, x-matched-path: /404) and on a local `next dev` server. Root cause: middleware.ts's matcher regex (`/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)`) does not exclude /sitemap.xml (or any non-image static convention route), so next-intl's locale-rewrite logic intercepts it before it ever reaches the app/sitemap.ts route handler. Whatever hreflang-cluster correctness this phase built into app/sitemap.ts has zero real-world effect: Google (or any crawler) requesting /sitemap.xml today gets a 404, not the generated sitemap."
    artifacts:

      - path: "middleware.ts"
        issue: "matcher config (line ~297-304) does not exclude /sitemap.xml from next-intl's locale-prefix rewrite, so the root-level app/sitemap.ts convention route is unreachable"

      - path: "app/sitemap.ts"
        issue: "no issue in the file itself — sitemap() is correct and passes its own tests — the defect is purely in middleware routing upstream of it"
    missing:

      - "Exclude /sitemap.xml (and ideally other root-level Next.js convention routes such as /manifest.webmanifest, /opengraph-image, etc. if any exist) from the middleware matcher's rewrite scope, e.g. add `sitemap\\.xml` to the negative lookahead alongside the existing image extensions, or add an explicit early-return in middleware.ts for pathname === '/sitemap.xml'"
      - "Re-verify with `curl -I https://rideprestigo.com/sitemap.xml` (or the local dev equivalent) returns 200 with Content-Type: application/xml and the full URL set, and that the response carries no x-middleware-rewrite header pointing at a locale-prefixed path"

human_verification:

  - test: "Submit https://rideprestigo.com/sitemap.xml to Google Search Console (after the middleware fix ships) and confirm hreflang hits/errors report"
    expected: "Sitemap fetches successfully; hreflang report shows reciprocal, non-conflicting annotations for the indexable page set"
    why_human: "Requires live Search Console access and a multi-day crawl/indexing cycle — cannot be verified from the codebase"

  - test: "On a real device/browser, set the browser's preferred language to a non-EN supported locale (e.g. Russian) that differs from the current page's locale, load an EN page fresh (cleared cookies), and confirm FirstVisitBanner appears post-hydration, offers Switch/Stay, and the initial server HTML (view-source) contains no banner markup or locale branch"
    expected: "Banner appears only after hydration via a client useEffect; view-source HTML is identical regardless of Accept-Language; clicking Switch navigates to the same page in the target locale; clicking Stay hides the banner and it does not reappear on reload"
    why_human: "Real Accept-Language negotiation and post-hydration timing can only be observed in an actual browser — code review confirms the architecture (no headers()/cookies() read, useEffect-only decision, routing.localeDetection: false) but not the live rendered behavior"
---

# Phase 74: SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher — Verification Report

**Phase Goal:** The multilingual site is fully SEO-wired so search engines and users treat the 7 locales (EN root + /ru /es /fr /ar /hi /zh) correctly. Every indexable page emits its full hreflang alternates cluster (up to 6 locales + x-default) through a centralized, translation- and index-aware getAlternates() that also feeds the sitemap; generateMetadata produces per-locale title/description/OG from the Phase 71/72 content model and catalogs; JSON-LD carries inLanguage and localized text fields; and a header language switcher (with NEXT_LOCALE cookie) plus a soft, crawler-safe Accept-Language first-visit banner give users locale control without ever redirecting or cloaking. English root output stays byte-for-byte unchanged.

**Verified:** 2026-09-24T02:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `getAlternates()` emits a full hreflang cluster (6 locales + x-default, BCP-47 keyed) for indexable, translated pages (SEO-01) | ✓ VERIFIED | `lib/seo.ts:111-166`; `tests/seo.test.ts` (13 tests, all pass); live curl `/corporate` and `/ru/corporate` both render the full 8-key `<link rel="alternate">` set |
| 2 | `indexable:false` pages emit an empty hreflang cluster, stay self-canonical (D-06) (SEO-01) | ✓ VERIFIED | `lib/seo.ts:125-127`; confirmed on `/data-deletion`, `services/corporate-accounts` (both pass `indexable:false`); `login/layout.tsx` and `book/confirmation/layout.tsx` verified to carry no `alternates` block at all |
| 3 | A locale without a genuine content file is excluded from the cluster (D-07); value-equal-to-EN is not special-cased, only file presence gates | ✓ VERIFIED | `hasLocaleContent()` fs.existsSync probe, `lib/seo.ts:90-95`; `tests/seo.test.ts` D-07 cases; `/authors/roman-ustyugov` and the 3 legacy JSX blog posts collapse to en+x-default only |
| 4 | zh maps to the BCP-47 script subtag `zh-Hans`; en/ru/es/fr/ar/hi map to themselves (SEO-04) | ✓ VERIFIED | `i18n/locales.ts:46-54` `BCP47_TAG`; `tests/seo.test.ts`/`tests/jsonld.test.ts` assert `zh-Hans` directly; live curl `/corporate` shows `hrefLang="zh-Hans"` |
| 5 | Non-EN pages self-canonicalize to their own localized URL rather than the EN URL (CR-01 review fix, Google hreflang requirement) | ✓ VERIFIED | `lib/seo.ts:147-165` `opts.locale`-aware canonical; live curl confirms `/ru/corporate` → `<link rel="canonical" href=".../ru/corporate">`, `/corporate` (EN) unchanged at `.../corporate` |
| 6 | `app/sitemap.ts`'s `sitemap()` function emits, per URL, an `alternates.languages` cluster identical to that URL's page-level cluster, via the same `getAlternates()` choke point (SEO-03, function-level) | ✓ VERIFIED | `app/sitemap.ts` `entry()` helper; `tests/sitemap.test.ts` (7 tests, all pass) including a direct cross-check against `getAlternates()` output |
| 7 | `/sitemap.xml` is a reachable, crawlable HTTP endpoint that actually feeds this cluster to search engines (SEO-03 / Goal: "getAlternates() that also feeds the sitemap") | ✓ VERIFIED (after gap fix 4a1571f) | Was HTTP 404 on dev + prod (next-intl rewrote to /en/sitemap.xml). After matcher fix: local dev `/sitemap.xml` → 200 application/xml, 63 URLs, no rewrite header. Prod updates on deploy. |
| 8 | `/authors/roman-ustyugov` sitemap and page-level hreflang clusters no longer diverge (CR-02 review fix) | ✓ VERIFIED | `app/sitemap.ts:130-133` now passes the identical `content: { kind:'page', key:'authors/roman-ustyugov' }` ref the page's own `generateMetadata()` uses; both collapse to en+x-default |
| 9 | `generateMetadata` produces per-locale title/description/OG sourced from the content model on every page, including the 10 force-static pages (SEO-02) | ✓ VERIFIED | All 10 force-static pages (`about`, `corporate`, `faq`, `privacy`, `terms`, `contact`, `blog` hub, `services/corporate-accounts`, `services/group-transfers`, `services/vip-events`) forward `{ locale } = await params` into `generateMetadata`; live curl `/ru/corporate` renders Russian `<title>`; `tests/force-static-metadata.test.tsx` (7 tests pass) |
| 10 | JSON-LD Service nodes carry `inLanguage` (BCP-47) and locale-sourced `name`/`description`, with EN byte-parity preserved (SEO-04, D-09) | ✓ VERIFIED | `lib/jsonld.ts` `buildRouteJsonLd`/`buildAirportTransferJsonLd`; `tests/jsonld.test.ts` (14 tests pass) covering `zh-Hans`, `ru`, and EN-unchanged cases; WR-01 fix confirmed live in `app/[locale]/services/airport-transfer/page.tsx:78-82` (name/description now threaded through, not just locale) |
| 11 | `openGraph.url` is locale-aware rather than a hardcoded EN literal (WR-02 review fix) | ✓ VERIFIED | `toAbsoluteUrl(alternates.canonical)` pattern applied across all ~56 call sites; confirmed in `lib/seo.ts:179-181` and spot-checked in `about/page.tsx`, `airport-transfer/page.tsx` |
| 12 | Header `LocaleSwitcher` lists the 7 endonyms in fixed order, no flags, sourced from `LOCALE_ENDONYMS` (UX-01, D-02) | ✓ VERIFIED | `components/LocaleSwitcher.tsx:143-198`; mounted in `components/Nav.tsx` desktop wrapper (line 156) and mobile menu (line 386); `tests/locale-switcher.test.tsx` passes |
| 13 | Selecting a locale navigates to the same page via the `@/i18n/routing` bridge (`router.replace(pathname, {locale})`), never a home-jump, never string concatenation (UX-01, D-03) | ✓ VERIFIED | `components/LocaleSwitcher.tsx:79-87` |
| 14 | `NEXT_LOCALE` cookie is set automatically by next-intl's middleware on switch — the switcher never hand-writes it (UX-01) | ✓ VERIFIED | No `document.cookie` write in `LocaleSwitcher.tsx`; RESEARCH Q3 live-verified against a running dev server per 74-05-SUMMARY.md (`Set-Cookie: NEXT_LOCALE=<locale>` observed) |
| 15 | `FirstVisitBanner` is crawler-safe — no server-side `headers()/cookies()` read, suggestion decision runs only in a post-hydration `useEffect`, `routing.localeDetection` stays `false`, no automatic redirect ever (UX-02, D-04/D-05) | ✓ VERIFIED | `components/FirstVisitBanner.tsx` (entirely `'use client'`, `navigator.language(s)`-only detection); `i18n/routing.ts:33` `localeDetection: false`; `tests/first-visit-banner.test.tsx` passes (12 tests) — real-browser confirmation listed under Human Verification |
| 16 | `Common.firstVisitBanner` strings are genuinely localized (not EN-fallback stubs) in all 6 non-EN locales (UX-02) | ✓ VERIFIED | `messages/{ru,es,fr,ar,hi,zh}.json:790-795` contain real translated strings (confirmed by direct read, not EN copies); WINDOWS.md items #9-14 marked `fixed` |
| 17 | English root output stays byte-for-byte unchanged after all the above additions (Goal statement) | ✓ VERIFIED | `tests/__snapshots__/route-page-render.test.tsx.snap` unchanged per 74-REVIEW-FIX.md; live curl `/corporate` (EN) unprefixed canonical/hreflang unchanged from pre-CR-01 shape |

**Score:** 16/17 truths verified (1 failed — see Gaps)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/seo.ts` | `getAlternates()` + `toAbsoluteUrl()`, index/translation/locale-aware | ✓ VERIFIED | Exists, substantive, wired into 56 call sites |
| `i18n/locales.ts` | `LOCALE_ENDONYMS` + `BCP47_TAG` maps | ✓ VERIFIED | Exists, correct zh→zh-Hans mapping |
| `lib/jsonld.ts` | `buildRouteJsonLd`/`buildAirportTransferJsonLd` with `inLanguage` + opts | ✓ VERIFIED | Exists, wired, tested |
| `app/sitemap.ts` | `entry()` delegates to `getAlternates()` | ✓ VERIFIED (function-level) / ✗ FAILED (HTTP-reachability, see Gaps) | Function correct; route unreachable |
| `components/LocaleSwitcher.tsx` | 7-row header dropdown | ✓ VERIFIED | Mounted desktop + mobile |
| `components/FirstVisitBanner.tsx` | client-only first-visit suggestion banner | ✓ VERIFIED | Mounted in `SiteChrome.tsx` after `<CookieBanner />` |
| `tests/seo.test.ts`, `tests/sitemap.test.ts`, `tests/jsonld.test.ts`, `tests/force-static-metadata.test.tsx`, `tests/locale-switcher.test.tsx`, `tests/first-visit-banner.test.tsx` | new/extended coverage | ✓ VERIFIED | All present, all green (85 tests across these files, 0 failures, re-run live during this verification) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Page `generateMetadata()` | `lib/seo.ts` `getAlternates()` | direct call, `content` ref | ✓ WIRED | Confirmed across 56 call sites; no hand-rolled `languages` literal remains in any `app/[locale]/**` page (one stale, functionally-overridden static `metadata` object remains in `app/[locale]/corporate/layout.tsx` — see note below) |
| `app/sitemap.ts` `entry()` | `lib/seo.ts` `getAlternates()` | direct call | ✓ WIRED | Same source of truth, verified identical output via tests |
| `middleware.ts` | `app/sitemap.ts` route | Next.js file convention routing | ✓ WIRED (after 4a1571f) | txt/xml/webmanifest excluded from matcher |
| `LocaleSwitcher.tsx` | `@/i18n/routing` `useRouter`/`usePathname` | `router.replace(pathname, {locale})` | ✓ WIRED | Live-verified cookie write in 74-05 |
| `FirstVisitBanner.tsx` | `components/CookieBanner.tsx` `getConsent()` | import + poll | ✓ WIRED | No edits to `CookieBanner.tsx`, sequencing confirmed in code |

**Note on `app/[locale]/corporate/layout.tsx`:** this pre-existing file (Phase 68, untouched by any Phase 74 plan) still exports a static `metadata` object with a hand-rolled 2-key `languages: { en, x-default }` block. This is **not** a live defect: Next.js metadata resolution has the page's own `generateMetadata()` (which correctly returns the full `getAlternates()` cluster) override the layout's `alternates` field entirely for the same route segment — confirmed live via curl (`/corporate` and `/ru/corporate` both render the correct full cluster, not the layout's stale 2-key one). Flagged here for awareness only, not scored as a gap.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `getAlternates()` `languages` | `localizedPath` | `getPathname({locale, href})` (i18n/routing) | Yes | ✓ FLOWING |
| `getAlternates()` `canonical` (non-EN) | `selfLocale` → `getPathname` | `opts.locale` validated against `availableLocales` | Yes | ✓ FLOWING |
| `buildRouteJsonLd` `name`/`description` | `opts.name`/`opts.description` | content-model (`getRouteContent`) passed by caller | Yes | ✓ FLOWING |
| `app/sitemap.ts` `sitemap()` output | `entries` array | `getAlternates()` per URL | Yes (function-level) | ⚠ HOLLOW at the HTTP layer — the correctly-computed data never reaches a crawler because the route itself 404s (see Gaps) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `getAlternates`/`sitemap`/`jsonld` unit suite | `npx vitest run tests/seo.test.ts tests/sitemap.test.ts tests/jsonld.test.ts` | 40 passed / 40 | ✓ PASS |
| Force-static metadata / locale-switcher / first-visit-banner / blog-locale-fallback / route-page-render | `npx vitest run tests/force-static-metadata.test.tsx tests/locale-switcher.test.tsx tests/first-visit-banner.test.tsx tests/blog-locale-fallback.test.ts tests/route-page-render.test.tsx` | 40 passed / 40 | ✓ PASS |
| `/corporate` (EN) live render | `curl -s http://localhost:3000/corporate` | Full 8-key hreflang cluster, EN unprefixed canonical | ✓ PASS |
| `/ru/corporate` live render | `curl -s http://localhost:3000/ru/corporate` | Russian `<title>`, self-canonical `/ru/corporate`, full cluster | ✓ PASS |
| `/zh/routes/prague-vienna` live render | `curl -s http://localhost:3000/zh/routes/prague-vienna` | Chinese `<title>`, FAQPage/BreadcrumbList JSON-LD present; Service node (and its `inLanguage`) absent because local dev has no pricing data (`route` is falsy) — matches documented, known local-only limitation, not a defect (confirmed via `tests/jsonld.test.ts` unit coverage of the same code path with a mocked `route`) | ⚠ PARTIAL (local-data-only gap, not a real defect) |
| `/sitemap.xml` (local dev) | `curl -sv http://localhost:3000/sitemap.xml` | HTTP 404; `x-middleware-rewrite: /en/sitemap.xml` | ✗ FAIL |
| `/sitemap.xml` (production) | `curl -sI https://rideprestigo.com/sitemap.xml` | HTTP/2 404; `x-matched-path: /404` | ✗ FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SEO-01 | 74-01, 74-02, 74-03, 74-04 | `getAlternates()` emits full hreflang cluster on every indexable page | ✓ SATISFIED | Truths 1-3, 5, 8 |
| SEO-02 | 74-04 | `generateMetadata` produces localized title/description/OG per locale | ✓ SATISFIED | Truth 9 |
| SEO-03 | 74-01, 74-03 | Sitemap emits every locale URL with a full alternates cluster | ⚠ PARTIALLY SATISFIED | Truth 6 (function-level) SATISFIED; Truth 7 (live reachability) BLOCKED — see Gaps |
| SEO-04 | 74-01, 74-02, 74-03 | JSON-LD carries `inLanguage` and localized text fields | ✓ SATISFIED | Truths 4, 10 |
| UX-01 | 74-05 | Language switcher UI with `NEXT_LOCALE` cookie persistence | ✓ SATISFIED | Truths 12-14 |
| UX-02 | 74-06 | First-visit `Accept-Language` detection, no cloaking | ✓ SATISFIED (code-level; live-browser check deferred to human) | Truths 15-16 |

No orphaned requirements — all 6 Phase-74 IDs in `.planning/REQUIREMENTS.md` are claimed across the 6 plans.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any of the phase's touched files (`lib/seo.ts`, `lib/jsonld.ts`, `i18n/locales.ts`, `app/sitemap.ts`, `components/LocaleSwitcher.tsx`, `components/FirstVisitBanner.tsx`).

### Human Verification Required

1. **Google Search Console sitemap fetch + hreflang report** — after the middleware fix for the `/sitemap.xml` 404 ships, submit `https://rideprestigo.com/sitemap.xml` in Search Console and confirm it fetches successfully with no hreflang conflict errors. Why human: requires live Search Console access and a multi-day crawl cycle.
2. **Real-browser Accept-Language first-visit banner check** — with a real browser set to a non-EN preferred language, confirm `FirstVisitBanner` appears only post-hydration (view-source shows no banner markup/branching), offers Switch/Stay, and never redirects automatically. Why human: real Accept-Language negotiation and hydration timing can't be fully observed from static code analysis, though the architecture (client-only `useEffect`, no server dynamic API reads, `localeDetection: false`) is verified correct in the code.

### Gaps Summary

Six of the phase's seven roadmap success criteria are fully achieved and well-tested: the `getAlternates()` helper is a genuine single source of truth, index/translation-aware, locale-self-canonicalizing (the CR-01/CR-02/WR-01/WR-02 review fixes are all confirmed present and correct in the live code, not just claimed in REVIEW-FIX.md); `generateMetadata` correctly resolves per-locale content on all 10 previously-broken force-static pages; JSON-LD carries `inLanguage` and locale-sourced text; the `LocaleSwitcher` and `FirstVisitBanner` components are both architecturally sound (crawler-safe, no cloaking, correct cookie handling) and unit-tested.

The one confirmed gap is severe: **`/sitemap.xml` is completely unreachable (HTTP 404) on both the local dev server and live production** (`https://rideprestigo.com/sitemap.xml`), because `middleware.ts`'s matcher does not exclude the root-level `app/sitemap.ts` convention route from next-intl's locale-prefix rewrite — the request gets rewritten to the non-existent `/en/sitemap.xml` and 404s. The `sitemap()` function itself is correct and well-tested (confirmed via `tests/sitemap.test.ts`), but that correctness never reaches a real crawler: Google (or any other search engine) requesting the sitemap today gets a 404, not the alternates-cluster-rich sitemap this phase built. This directly undermines the phase's own goal statement ("a centralized... `getAlternates()` that also feeds the sitemap") and Success Criterion #3. The fix is scoped to `middleware.ts` (a file no Phase 74 plan touched — the root cause predates this phase) and is a small, well-understood change (exclude `/sitemap.xml` from the matcher's rewrite scope), but it must land before this phase's SEO-03 goal can be considered achieved in the real world.

---

_Verified: 2026-09-24T02:10:00Z_
_Verifier: Claude (gsd-verifier)_

## Gap Closure (2026-09-24)

The single gap was fixed inline by the orchestrator in commit `4a1571f` (`middleware.ts` matcher excludes `txt|xml|webmanifest`; regression test `tests/middleware-matcher.test.ts`). The same root cause was also 404-ing `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/BingSiteAuth.xml` and the IndexNow key file in production — all now return 200 on a local dev server. Full suite: 1671 passed, 0 failed. Production is still 404 until this ships (deploy = merge to main → Vercel).
