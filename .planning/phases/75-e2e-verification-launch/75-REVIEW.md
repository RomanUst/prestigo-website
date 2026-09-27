---
phase: 75-e2e-verification-launch
reviewed: 2026-09-27T14:30:00Z
depth: standard
scope: gap-closure diff e9ddb789..65a1eb4d (plans 75-22..75-30, PR #38)
files_reviewed: 30
files_reviewed_list:
  - app/[locale]/[...rest]/page.tsx
  - app/[locale]/authors/roman-ustyugov/page.tsx
  - app/[locale]/blog/[slug]/page.tsx
  - app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
  - app/[locale]/blog/prague-airport-to-city-center/page.tsx
  - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
  - app/[locale]/fleet/page.tsx
  - app/[locale]/login/layout.tsx
  - app/api/meta-capi/route.ts
  - components/ArticleByline.tsx
  - components/BlogCard.tsx
  - components/MetaPixel.tsx
  - components/TestimonialsCarousel.tsx
  - lib/blog-categories.ts
  - lib/google-reviews.ts
  - lib/meta-pixel-id.ts
  - mdx-components.tsx
  - scripts/qa/analytics_locale_audit.py
  - scripts/qa/en_leak_catalog.py
  - scripts/qa/en_leak_rendered.py
  - scripts/qa/en_leak_static.mjs
  - scripts/qa/notfound_audit.py
  - scripts/qa/overflow_audit.py
  - tests/locale-catch-all-not-found.test.ts
  - tests/mdx-locale-links.test.tsx
  - tests/meta-capi.test.ts
  - tests/meta-pixel-id.test.tsx
  - tests/login-metadata-i18n.test.ts
  - tests/author-surfaces-i18n.test.tsx
  - tests/TestimonialsCarousel.test.tsx
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

> Prior review (commit 7f7d42f5) covered plans 75-01..75-21. This report replaces it and covers only the gap-closure diff `e9ddb789..65a1eb4d` (plans 75-22..75-30, deployed via PR #38).

# Phase 75: Code Review Report (gap closure 75-22..75-30)

**Reviewed:** 2026-09-27T14:30:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

I reviewed the source, QA-script and test changes in `e9ddb789..65a1eb4d`. Source files at HEAD (`d1848b94`) match `65a1eb4d`. Where I could, I checked each claim against production (`rideprestigo.com`) using curl and a headless Playwright probe that blocked analytics.

What works and was confirmed in production:
- The catch-all `[...rest]` 404: status 404, localized `lang`/`dir`/h1/title on every locale.
- Locale-prefixed MDX and JSX blog links, e.g. 51/51 `/ru/` links on the translated MDX post and 0 leaks on the `ar` JSX post.
- Localized author page title and OG tags, `/login` title, blog category labels and testimonials.
- Normalizing the Meta pixel ID. The digits-only regex also closes the inline-script injection path (T-75-G06).

There are no security blockers. The main problems are gaps the new code leaves open while the gap-closure audit reports those areas as done:
1. `/<locale>/blog/<unknown-slug>` 404s still get an English title with the brand doubled. The catch-all only covers paths that match no route, and `notfound_audit.py` never tests a dynamic-segment 404.
2. `twitter:title` and `twitter:description` are the English site default on every page in every locale, including the author page that 75-28 just localized. This is broader than WINDOWS #26, and the rendered scanner cannot see it because it never reads `twitter:*`.
3. The rendered scanner checks one text node at a time. React splits interpolated JSX into separate nodes, so English like `Published` + `13 July 2026` is never flagged.

Known item confirmed, not re-reported: WINDOWS #26. `/login` and the catch-all 404 still inherit the English `og:*`/`twitter:*` tags and the 404 description from `siteMetadata`. In production, `/ru/login` returns `og:title="PRESTIGO — Premium Chauffeur Service Prague"`, and the hydrated `/ru/this-page-does-not-exist` has the same English `og:title`.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: A 404 on an unknown blog slug still shows an English title with the brand doubled

**File:** `app/[locale]/blog/[slug]/page.tsx:51-53`, `scripts/qa/notfound_audit.py:49`
**Issue:** GAP-4a fixed 404 titles only for paths that match no route, because only those reach `[...rest]`. `/<locale>/blog/<anything>` matches `blog/[slug]` (`dynamicParams = true`). Its `generateMetadata` returns the hard-coded, non-absolute `{ title: 'Not Found — Prestigo' }`, which the root template turns into `Not Found — Prestigo | PRESTIGO`. It also sets no noindex. Production probe after hydration:
```
/ru/blog/nonexistent-xyz   404 lang=ru  title='Not Found — Prestigo | PRESTIGO'
/ar/blog/nonexistent-xyz   404 lang=ar  title='Not Found — Prestigo | PRESTIGO'
/ru/routes/nonexistent-xyz 404 lang=ru  title='Страница не найдена — PRESTIGO'   (catch-all, OK)
```
Old or mistyped blog slugs are the most likely real 404s on this site. `notfound_audit.py` only tests `/this-page-does-not-exist` and `/qa/nested/missing-page`, both of which go to the catch-all, so this class passes unseen.
**Fix:**
```ts
// app/[locale]/blog/[slug]/page.tsx generateMetadata
if (!resolved || !post) {
  if (!hasLocale(locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'NotFound' })
  return { title: { absolute: t('metaTitle') }, robots: { index: false, follow: false } }
}
```
Also add a dynamic-segment miss to `MISSING_PATHS`, e.g. `'/blog/this-post-does-not-exist'`.

### WR-02: `twitter:title` and `twitter:description` are English on every page in every locale, and the scanner cannot detect it

**File:** `app/[locale]/authors/roman-ustyugov/page.tsx:54-65`, `scripts/qa/en_leak_rendered.py:204-214`
**Issue:** No page under `app/[locale]` overrides `twitter` (`grep -rl "twitter:" app/[locale]` returns 0 files, while 56 files set `openGraph`). As a result every page inherits the English `siteMetadata.twitter` block from `components/SiteChrome.tsx:98-104`. This includes indexable pages. Production:
```
/ru/fleet                 og:title="Наш автопарк — …"                 twitter:title="PRESTIGO — Premium Chauffeur Service Prague"
/ru/blog/beyond-transport og:title="Больше, чем перевозка: …"          twitter:title="PRESTIGO — Premium Chauffeur Service Prague"
/ru/authors/roman-ustyugov og:title="Roman Ustyugov — основатель …"   twitter:title/description = EN site default, twitter:image=/og-image.jpg
```
In 75-28, the author page's `generateMetadata` localized `openGraph` but left `twitter` alone. X/Twitter uses `twitter:*` when it is present, so share cards show the English generic text and a different image from OG. WINDOWS #26 covers only `/login` and the 404. This affects the whole site and is not in any ledger. The scanner misses it because `metaTexts()` reads only `<title>`, `description`, `og:title` and `og:description`.
**Fix:** Make the locale layout's default `twitter` block locale-aware in a `generateMetadata` on `app/[locale]/layout.tsx`, and/or mirror `openGraph.title/description/images` into `twitter` in each page's metadata. A shared helper would do the second, for example `withTwitter(meta)` that copies `openGraph` values into `twitter`. In `EXTRACT_JS.metaTexts`, also push `meta[name="twitter:title"]` and `meta[name="twitter:description"]`. Log this as a new WINDOWS entry.

### WR-03: The rendered scanner checks one DOM text node at a time, so English split by JSX interpolation is never flagged

**File:** `scripts/qa/en_leak_rendered.py:178-191` (`visibleTextNodes`), `350-368` (2-word threshold)
**Issue:** React emits `Published {formatBylineDate(d)}` as two text nodes (`"Published "` and `"13 July 2026"`), and `By{' '}<Link>` as `"By"`. Each node has fewer than 2 Latin words, so `has_significant_words(text, 2)` is false and the page is reported clean. The 75-30 production evidence (`evidence/75-30-en-leak-rendered.json`) shows 0 leaks on `/{ru,ar,hi,zh}/blog/beyond-transport-luxury-chauffeur-service-prague`. Curl shows those pages render `By`, `Published 13 July 2026` and English month names on `/ru/blog` cards. So the gate that certifies GAP-4 as closed cannot see a whole class of short, interpolated English UI strings: labels built as `{t(...)} {value}`, dates, and `X · Y` joins.
**Fix:** Also evaluate text per element. For each visible element whose children are only text and inline elements (`p, li, h1-h6, span, a, button, label, td, th`), take its normalized `innerText`, and flag it when the joined text qualifies. De-duplicate against the node-level results. Add a regression test to `test_en_leak_rendered.py` with split fixture nodes `["Published ", "13 July 2026"]` whose parent text is flagged.

### WR-04: The byline still renders "By", "Published", "Updated" and an `en-GB` date on every localized post and blog card

**File:** `components/ArticleByline.tsx:71,82-83`, `components/BlogCard.tsx:55`
**Issue:** 75-28 localized the byline's job title, alt text and aria-label but left the visible `By`, `Published` and `Updated` words, plus `formatBylineDate()` (hard-coded `en-GB`, English month names). Production `/ru/blog/beyond-transport-…` renders `By · Основатель и директор… · Published 13 July 2026`, and `/ru/blog` cards show `13 July 2026`, `29 August 2026` and so on. These are visible English strings on the pages this phase certifies as leak-free. `deferred-items.md:120-129` records this, but it has no WINDOWS ledger row, and because of WR-03 the scanner will never raise it.
**Fix:** Add `labels.by/published/updated` (ICU `{date}`) to `content/pages/*/authors/roman-ustyugov.json`. Format with `new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })`, passing `locale` into BlogCard via `useLocale()`. Keep `lib/authors.ts` English for the Person JSON-LD. Promote the deferred item to a WINDOWS row.

### WR-05: `blog/[slug]` now renders server-side locale `Link`s but never calls `setRequestLocale`

**File:** `app/[locale]/blog/[slug]/page.tsx:86-91`
**Issue:** 75-27 routed every internal MDX link through the server `Link` from `@/i18n/routing`, which resolves the locale from next-intl's request config. The 75-27 SUMMARY (deviation, line 91) records that the force-static JSX posts rendered 0 `/ru/` hrefs, including in Nav/Footer, until each page called `setRequestLocale`. That fix went into the three JSX pages, but `[slug]` also runs on a force-static route and still does not call it; 75-28 even removed its only request-scoped locale read. It works in production today (51/51 `/ru/` links) only because the layout's `setRequestLocale` runs first in the same render. next-intl says not to rely on that and to call it in every page. A rendering-order change (partial prerender, segment-level revalidation) would silently bring back the locale-dropping link leak on every translated MDX post.
**Fix:**
```ts
const { slug, locale } = await params
setRequestLocale(locale)   // import { setRequestLocale } from 'next-intl/server'
```

### WR-06: A malformed Meta pixel ID or CAPI token still turns tracking off silently

**File:** `lib/meta-pixel-id.ts:14-18`, `app/api/meta-capi/route.ts:13-16,46-47`, `components/MetaPixel.tsx:12`
**Issue:** WINDOWS #15 was a silent outage: a bad env value quietly disabled the pixel. The new normalizer still fails silently. It just fails earlier. If the value is set but invalid (non-numeric, stray quote, pasted label), `normalizeMetaPixelId` returns `undefined`, `MetaPixel` renders nothing, and CAPI returns `{ ok: true, skipped: true }` with HTTP 200. Nothing is logged anywhere. If `META_PIXEL_ID` is invalid, CAPI also silently falls back to the public ID. If the two IDs differ, browser/server deduplication by `eventId` breaks without any sign.
**Fix:** Warn once at module init on the server when a raw value is set but fails normalization:
```ts
if (process.env.META_PIXEL_ID?.trim() && !normalizeMetaPixelId(process.env.META_PIXEL_ID))
  console.error('[meta-capi] META_PIXEL_ID is set but not a numeric pixel ID — CAPI disabled/falling back')
```
Do the same for `NEXT_PUBLIC_META_PIXEL_ID` in the CAPI route, which runs on the server. Consider returning `skipped: 'misconfigured'` so the case can be told apart in logs.

## Info

### IN-01: The MDX link helper would double-prefix an href that already carries a locale

**File:** `mdx-components.tsx:15-21`
**Issue:** `isInternalPagePath('/ru/book')` returns true, so the next-intl `Link` renders `/ru/ru/book` on ru pages. No MDX file contains such a link today (checked with grep), but translated MDX is AI-generated and could contain one.
**Fix:** Return false (plain `<a>`) when the first segment is a configured locale: `locales.includes(pathname.split('/')[1])`.

### IN-02: Testimonials check only `quote` before reading `role` and `sourceLabel` from the catalog

**File:** `components/TestimonialsCarousel.tsx:34-38`
**Issue:** `localized` is gated on `t.has('<id>.quote')`, then `role` and `sourceLabel` are read with no check. A partially translated catalog entry (possible with AI translation runs) would render next-intl's missing-key fallback, or throw under a strict `onError`.
**Fix:** Gate each field on its own: `t.has(k) ? t(k) : review.role`.

### IN-03: The CAPI token is put into the Graph URL without encoding

**File:** `app/api/meta-capi/route.ts:126`
**Issue:** `?access_token=${CAPI_TOKEN}` is built by string interpolation. `trim()` removes surrounding whitespace, but a `&`, `#` or space inside the value would corrupt the request. The line was already there before this diff, but the diff hardened the values it uses and left this gap.
**Fix:** Use `const u = new URL(\`https://graph.facebook.com/v19.0/${PIXEL_ID}/events\`); u.searchParams.set('access_token', CAPI_TOKEN)`.

### IN-04: The audit's route handler can skip `route.abort()` if reading the request body throws

**File:** `scripts/qa/analytics_locale_audit.py:102-115`
**Issue:** 75-23 made Meta send multipart `sendBeacon` bodies. `request.post_data` decodes as UTF-8 and can raise on a binary body. The exception happens before `route.abort()`, so the request hangs, the hit is lost and the run slows down. The request is not forwarded, so T-75-13 still holds.
**Fix:** Wrap the capture in `try/finally: route.abort()`, or use `request.post_data_buffer` and decode with `errors='replace'`.

### IN-05: The 404's server-rendered shell is English with the brand doubled until hydration

**File:** `app/[locale]/[...rest]/page.tsx:45-47` (with `app/[locale]/not-found.tsx:18-21`)
**Issue:** Raw HTML for `/ru/this-page-does-not-exist` in production is `<html id="__next_error__">` with no `lang` and `<title>Page Not Found — PRESTIGO | PRESTIGO</title>`. The not-found file's static title is not `absolute`, so the root template appends the brand again. The page is correct after hydration, and `notfound_audit.py` deliberately checks only that state. Clients that don't run JS (link unfurlers, some crawlers) see the English, doubled title. The comment in `not-found.tsx` saying the title cannot be localized is also out of date now that the catch-all does it.
**Fix:** Make the not-found title `{ absolute: 'Page Not Found — PRESTIGO' }` and update the out-of-date comment.

---

_Reviewed: 2026-09-27T14:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
