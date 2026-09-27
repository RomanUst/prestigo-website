---
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
reviewed: 2026-09-23T21:41:46Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - lib/seo.ts
  - i18n/locales.ts
  - lib/jsonld.ts
  - app/sitemap.ts
  - components/FirstVisitBanner.tsx
  - components/LocaleSwitcher.tsx
  - components/Nav.tsx
  - components/SiteChrome.tsx
  - app/[locale]/about/page.tsx
  - app/[locale]/authors/roman-ustyugov/page.tsx
  - app/[locale]/blog/[slug]/page.tsx
  - app/[locale]/corporate/page.tsx
  - app/[locale]/routes/prague-vienna/page.tsx
  - app/[locale]/services/airport-transfer/page.tsx
  - lib/blog.ts (called by app/[locale]/blog/[slug]/page.tsx — read to verify blogCanonical())
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 74: Code Review Report

**Reviewed:** 2026-09-23T21:41:46Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the Phase 74 hreflang/canonical/sitemap/structured-data implementation. `lib/seo.ts`'s `getAlternates()` correctly builds a per-locale `languages` cluster gated by a real filesystem probe (`hasLocaleContent`), and the vast majority of page files (about, corporate, faq, contact, privacy, terms, blog hub, all 30 route pages, all service pages) call it with `content` refs that match `app/sitemap.ts` exactly — good single-source-of-truth discipline for the `languages` map specifically.

However, two BLOCKER-class defects undercut the phase's core objective. First, `alternates.canonical` (in `getAlternates()` and in `lib/blog.ts`'s `blogCanonical()`) is **never locale-aware** — it always resolves to the plain, unprefixed (English) URL regardless of which locale is rendering the page. Every non-English page in the site (including pages with real, live Russian/Spanish/French translations already shipped in Phase 72) emits `<link rel="canonical">` pointing at the English URL instead of self-referencing its own localized URL, which directly contradicts Google's hreflang requirement that each language version carry a self-referential canonical, and risks Google consolidating/dropping every non-English URL from the index. Second, `/authors/roman-ustyugov` has a real, provable divergence between `app/sitemap.ts` (which omits the `content` ref, producing a full 7-locale hreflang cluster) and the page's own `generateMetadata()` (which supplies a `content` ref that collapses to EN-only) — violating the explicitly documented "single source of truth ... can never diverge" invariant in `lib/seo.ts`'s own top-of-file comment.

A supporting WARNING was found in `buildAirportTransferJsonLd()`'s call site (only `locale` is threaded through, not the already-available localized `name`/`description`), producing structured data that declares `inLanguage: "ru"` (etc.) while the JSON-LD `name`/`description` stay hardcoded English — inconsistent with the correctly-implemented sibling pattern in `buildRouteJsonLd()`. A second WARNING covers the systemically hardcoded `openGraph.url` (same root-cause class as the canonical bug, lower severity).

## Critical Issues

### CR-01: `alternates.canonical` is never locale-prefixed — every non-English page self-canonicalizes to the English URL

**File:** `lib/seo.ts:89-121` (also `lib/blog.ts:165-176`, `blogCanonical()`)
**Issue:**
`getAlternates(canonicalPath, opts)` computes `canonical` purely from the literal `canonicalPath` string the caller passes — which is always the plain, unprefixed path (e.g. `/routes/prague-vienna`, `/corporate`, `/about`) regardless of the locale the page is actually being rendered under. No caller anywhere in `app/**` ever passes a locale-prefixed path (verified via `grep -rn "getAlternates(" app/` — zero matches for a template with `${locale}`), and `getAlternates()`'s signature doesn't even accept a `locale` parameter to make a self-referencing canonical possible.

Concretely: `generateMetadata()` on `app/[locale]/routes/prague-vienna/page.tsx` calls `getAlternates('/routes/prague-vienna', { indexable: true, content: { kind: 'route', key: 'prague-vienna' } })` — identically whether the request is for `/routes/prague-vienna` (en) or `/ru/routes/prague-vienna`. `canonical` resolves to `'/routes/prague-vienna'` in both cases, which Next.js resolves against `metadataBase` (`https://rideprestigo.com`, set once in `SiteChrome.tsx`, never locale-scoped) to the exact same absolute URL. So `/ru/routes/prague-berlin` — a page with **genuinely translated Russian content** (confirmed present at `content/routes/ru/prague-berlin.json`, shipped Phase 72) — emits `<link rel="canonical" href="https://rideprestigo.com/routes/prague-berlin">`, i.e. it declares the English page as its own canonical.

This is the textbook hreflang anti-pattern Google explicitly warns against: "Each language version must identify its own canonical URL" — https://developers.google.com/search/docs/specialty/international/localized-versions#use-canonical-link-tag. A page cannot both (a) advertise itself as a legitimate `ru`/`es`/`fr`/`ar`/`hi`/`zh` alternate in the `languages` hreflang cluster (which Phase 74 correctly builds) AND (b) declare that its real/canonical location is the English URL. Google's documented behavior in this situation is to treat the non-self-canonical URL as a duplicate and consolidate/index only the canonical target (English) — which would silently blackhole the localized-indexing goal that is the entire point of this phase, for every indexable page in every non-English locale.

The same defect is separately present (not just inherited) in `lib/blog.ts:172-176`:
```ts
export function blogCanonical(slug: string, isFallback: boolean): string {
  return isFallback
    ? `https://rideprestigo.com/blog/${slug}`
    : `/blog/${slug}`;   // <- claims to be "locale-relative" per the comment above it,
}                          //    but is actually just the unprefixed EN path in all cases
```
The doc comment directly above this function (`lib/blog.ts:165-171`) explicitly claims this returns "the current locale-relative /blog/<slug> form when the post is genuinely localized" — but the code never includes a locale segment, so even a genuinely-translated post (`isFallback: false`) resolves to the plain English URL via `metadataBase`, not a self-referencing `/ru/blog/<slug>` URL.

**Fix:** Thread the current locale into `getAlternates()` and compute a self-referencing canonical for locales where content actually exists (mirroring the existing `hasLocaleContent`/D-07 gate), falling back to the EN URL only for genuine EN-fallback cases:
```ts
// lib/seo.ts
export function getAlternates(
  canonicalPath: string,
  opts: GetAlternatesOpts & { locale?: AppLocale } = {}
): AlternatesConfig {
  const normPath = canonicalPath === '/' ? '' : canonicalPath
  const fullUrl = normPath === '' ? BASE : `${BASE}${normPath}`

  if (opts.indexable === false) {
    return { canonical: normPath === '' ? BASE : normPath, languages: {} }
  }

  const availableLocales = opts.content
    ? routing.locales.filter((l) => l === 'en' || hasLocaleContent(opts.content!, l))
    : routing.locales

  const href = normPath === '' ? '/' : canonicalPath
  const languages: Record<string, string> = {}
  for (const locale of availableLocales) {
    languages[BCP47_TAG[locale]] = BASE + (getPathname({ locale, href }) === '/' ? '' : getPathname({ locale, href }))
  }
  languages['x-default'] = fullUrl

  // Self-referencing canonical: use the current locale's own URL when it's
  // in the available set (genuinely localized, or chrome-only/no content
  // ref), otherwise fall back to the EN URL (D-07 EN-fallback case).
  const canonicalLocale = opts.locale && availableLocales.includes(opts.locale) ? opts.locale : 'en'
  const canonicalPathLocalized = getPathname({ locale: canonicalLocale, href })
  const canonical = canonicalPathLocalized === '/' ? BASE : BASE + canonicalPathLocalized

  return { canonical, languages }
}
```
Every call site would need to pass its resolved `locale` (all of them already have it in scope via `getLocale()`/`params`). Apply the equivalent fix to `blogCanonical()` so the `isFallback: false` branch returns a locale-prefixed path.

### CR-02: `/authors/roman-ustyugov` hreflang cluster diverges between sitemap and page metadata

**File:** `app/sitemap.ts:122`, `app/[locale]/authors/roman-ustyugov/page.tsx:28-31`
**Issue:** `lib/seo.ts`'s top-of-file doc comment states as an explicit invariant: *"getAlternates(path, opts) is the single source of truth consumed by both per-page generateMetadata() and app/sitemap.ts — they can never diverge."* This invariant is violated for `/authors/roman-ustyugov`:

- `app/sitemap.ts:122`: `entry('/authors/roman-ustyugov', 'app/[locale]/authors/roman-ustyugov/page.tsx', { indexable: true })` — **no `content` ref supplied.** Per the D-07 logic in `getAlternates()`, omitting `content` means `availableLocales = routing.locales` (all 7 locales, unconditionally) — the sitemap therefore emits a hreflang cluster claiming `/ru/authors/roman-ustyugov`, `/es/authors/roman-ustyugov`, `/fr/...`, `/ar/...`, `/hi/...`, `/zh/...` are all legitimate localized alternates of this page.
- `app/[locale]/authors/roman-ustyugov/page.tsx:28-31`: the page's own `metadata` export calls `getAlternates(`/authors/${author.slug}`, { indexable: true, content: { kind: 'page', key: 'authors/roman-ustyugov' } })`. Since no `content/pages/<locale>/authors/roman-ustyugov.json` file exists for **any** locale (verified: `content/pages/` has no `authors/` subdirectory in any locale), the D-07 fs-probe collapses this to **`en` + `x-default` only** — the page declares itself EN-only.

The result: the sitemap advertises six locale URLs as valid hreflang alternates for this page, while those same six URLs — when actually crawled — declare (via their own `<link rel="alternate">` tags) that no such localized versions exist, only English. This is a non-reciprocal, self-contradicting hreflang implementation: per Google's guidance, hreflang annotations must be confirmed by a matching return link on the target page, or Google may ignore the annotation entirely. Worse, all six locale URLs (`/ru/authors/roman-ustyugov` etc.) are still statically generated (via the root `generateStaticParams()` in `app/[locale]/layout.tsx`, which returns all 7 locales unconditionally) and rendered with `indexable: true` and hardcoded English content (the page component has no `useTranslations()`/`getPageContent()` calls at all — pure hardcoded English JSX) — meaning six near-duplicate-content, fully indexable English pages exist at non-English URLs, and the sitemap actively points crawlers at them as if they were legitimate localized destinations.

The sitemap comment at `app/sitemap.ts:88-90` claims *"/fleet and /authors/roman-ustyugov have no content-model backing ... treated as chrome-only pages, no content ref supplied"* — this is factually incorrect for `/authors/roman-ustyugov`: unlike `/fleet` (genuinely chrome-only, no translation needed since its copy comes from `messages/*.json`), the author page's own metadata explicitly opts into the `content`-ref-gated (D-07) EN-only behavior, which the sitemap entry does not mirror.

**Fix:** Make the sitemap entry match the page's own `content` ref exactly:
```ts
// app/sitemap.ts
entry('/authors/roman-ustyugov', 'app/[locale]/authors/roman-ustyugov/page.tsx', {
  indexable: true,
  content: { kind: 'page', key: 'authors/roman-ustyugov' },
}),
```
and update the stale comment at lines 88-90 to only describe `/fleet` as chrome-only. (Separately worth flagging to the team: since these six locale URLs are still statically generated with hardcoded English content, consider whether they should be `noindex`'d or redirected to the EN URL rather than left independently indexable — but that's a product decision beyond this review's scope; the minimal correctness fix is making the sitemap/page alternates agree.)

## Warnings

### WR-01: `buildAirportTransferJsonLd` declares `inLanguage` without translating `name`/`description`

**File:** `app/[locale]/services/airport-transfer/page.tsx:66`
**Issue:** The call site is:
```ts
const airportJsonLd = buildAirportTransferJsonLd(globals, sClassAirport, vClassAirport, { locale })
```
Only `locale` is passed. `buildAirportTransferJsonLd()` (`lib/jsonld.ts:149-154`) uses `isLocalized = opts.locale !== 'en'` to set `inLanguage` to the BCP-47 tag for the real locale, but since `opts.name`/`opts.description` are never supplied, `name`/`description` unconditionally fall back to the hardcoded English strings (`'Airport Transfer Prague'` / `'Premium airport transfer service at Prague Václav Havel Airport.'`). Result: on `/ru/services/airport-transfer` the emitted JSON-LD `Service` node has `inLanguage: "ru"` but `name`/`description` in English — a structured-data language mismatch. `content.metadata.title`/`content.metadata.description`/`content.metadata.ogTitle` are already loaded and localized at this exact call site (line 38, `getPageContent('services/airport-transfer', locale)`) but are not threaded through. This is the same page-content source `generateMetadata()` on the same file already uses correctly for the HTML `<title>`/`<meta description>` — only the JSON-LD call was missed. Every other JSON-LD-emitting page in the phase (`buildRouteJsonLd`, all 30 route pages) correctly passes localized `name`/`description`.

**Fix:**
```ts
const airportJsonLd = buildAirportTransferJsonLd(globals, sClassAirport, vClassAirport, {
  locale,
  name: content.metadata.ogTitle,
  description: content.metadata.description,
})
```

### WR-02: `openGraph.url` hardcoded to the English URL on every localized page

**File:** `app/[locale]/about/page.tsx:41`, `app/[locale]/corporate/page.tsx:21`, `app/[locale]/authors/roman-ustyugov/page.tsx:33`, `app/[locale]/routes/prague-vienna/page.tsx:33` (and the same pattern across all other route/service pages)
**Issue:** Same root-cause class as CR-01 but for the Open Graph tag rather than the canonical/hreflang system: `openGraph.url` is a literal EN URL string (e.g. `'https://rideprestigo.com/about'`), never locale-aware. Sharing `/ru/about` on a platform that reads `og:url` (Facebook, LinkedIn, etc.) reports the English URL as the canonical shared resource, which is incorrect for the localized page and undermines social-share attribution/analytics for non-English traffic. Lower severity than CR-01 (no indexing consequence), but it's a real, systemic defect touching every page reviewed and should be fixed alongside CR-01 since the same locale-aware URL helper would resolve both.

**Fix:** Once `getAlternates()` gains locale-aware canonical resolution (CR-01 fix), reuse its output (or the same `getPathname({ locale, href })` call) to set `openGraph.url` per-locale instead of a hardcoded string, e.g.:
```ts
openGraph: {
  url: getAlternates('/about', { indexable: true, content: {...}, locale }).canonical,
  ...
}
```

---

_Reviewed: 2026-09-23T21:41:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
