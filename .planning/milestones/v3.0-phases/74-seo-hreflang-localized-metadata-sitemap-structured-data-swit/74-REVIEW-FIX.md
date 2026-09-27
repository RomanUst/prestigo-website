---
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
fixed_at: 2026-09-23T22:03:55Z
review_path: .planning/phases/74-seo-hreflang-localized-metadata-sitemap-structured-data-swit/74-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 74: Code Review Fix Report

**Fixed at:** 2026-09-23T22:03:55Z
**Source review:** .planning/phases/74-seo-hreflang-localized-metadata-sitemap-structured-data-swit/74-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, CR-02, WR-01, WR-02)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: `alternates.canonical` is never locale-prefixed — every non-English page self-canonicalizes to the English URL

**Files modified:** `lib/seo.ts`, `lib/blog.ts`, `app/[locale]/blog/[slug]/page.tsx`, plus all 56 `app/[locale]/**` pages that call `getAlternates()` (the sitemap-referenced `entry()` helper in `app/sitemap.ts` was intentionally left untouched — it never passes `locale`, matching the fix's byte-identical-when-omitted contract).

**Commits:** `6d7cee9` (core mechanism), `6fefef5` (30 `routes/prague-*` pages), `2ce55be` (force-static content pages: about/corporate/contact/privacy/terms/faq/blog-hub/services-vip-events/services-group-transfers/services-corporate-accounts), `4f86eab` (home + services hub/concierge/city-rides/airport-transfer), `aa8db8d` (routes hub, services/intercity-routes cross-canonical, data-deletion), `6b88660` (static-metadata pages converted to `generateMetadata`: authors/roman-ustyugov, book, book/multi-day, fleet, 3 legacy JSX blog posts)

**Applied fix:**
`getAlternates(path, opts)` gained an optional `opts.locale?: string` (deliberately typed `string`, not `AppLocale`, so every call site passes its already-resolved `locale` variable — from `getLocale()` or `(await params).locale` — with no cast; validated internally against `routing.locales`/the page's own `availableLocales` cluster, mirroring the existing `hasLocaleContent()` guard). When `opts.locale` resolves to a genuine member of the page's hreflang cluster (a real translation, or any locale for a chrome-only page with no `content` ref) and isn't `'en'`, `canonical` now self-references that locale's own absolute URL (e.g. `https://rideprestigo.com/ru/routes/prague-berlin`) instead of always the plain EN path. When `opts.locale` is omitted, invalid, `'en'`, or unavailable (D-07 EN-fallback), `canonical` is byte-identical to the pre-fix output — confirmed by test (a)/(d)/(f) in `tests/seo.test.ts` and the unchanged `route-page-render.test.tsx.snap` golden EN snapshot. `app/sitemap.ts` never passes `locale`, so its output is unaffected (verified — `entry()` and every call inside `sitemap()` were left untouched).

`lib/blog.ts`'s `blogCanonical(slug, isFallback, locale = 'en')` gained the same locale-aware self-reference for its non-fallback branch (resolved via `getPathname` from `@/i18n/routing`), defaulting to `'en'` so every pre-existing 2-arg call site stays unchanged.

`app/[locale]/blog/[slug]/page.tsx`'s `generateMetadata()` now reads `locale` from its own route params (`Promise<{ slug: string; locale: string }>`) instead of a bare `getLocale()` call — this page is `force-static`, and a bare `getLocale()` on a force-static route was the documented Phase-73 EN-leak bug pattern.

Across the ~56 page-level callers: pages whose `generateMetadata()` already had `locale` in scope (via `getLocale()` on ISR pages, or `params` on force-static pages) simply thread it through as an added `locale` property. `app/[locale]/routes/page.tsx` had no locale resolution at all — added `getLocale()` (confirmed ISR via `export const revalidate = 120`, not force-static, so this is safe and matches the same pattern already used across the 30 `routes/prague-*` pages). Six pages exporting a static `metadata: Metadata` object (which cannot read the route's locale param at all) — `authors/roman-ustyugov`, `book`, `book/multi-day`, `fleet`, and 3 legacy JSX blog posts — were converted to `generateMetadata({ params })`.

A small helper, `toAbsoluteUrl()`, was added to `lib/seo.ts` to normalize `canonical`'s relative-vs-absolute shape into the always-absolute form `openGraph.url` needs (used for the WR-02 fix below, in the same commits).

### CR-02: `/authors/roman-ustyugov` hreflang cluster diverges between sitemap and page metadata

**Files modified:** `app/sitemap.ts`

**Commit:** `562c4ca`

**Applied fix:** The `entry('/authors/roman-ustyugov', ...)` call in `app/sitemap.ts` now passes `content: { kind: 'page', key: 'authors/roman-ustyugov' }`, exactly matching the content ref the page's own `generateMetadata()` already supplied. Since no `content/pages/<locale>/authors/roman-ustyugov.json` exists for any locale, both sides now collapse to the same `en + x-default` cluster — no more sitemap/page divergence. The stale comment at `app/sitemap.ts:88-90` (which claimed both `/fleet` and `/authors/roman-ustyugov` were chrome-only) was corrected to describe only `/fleet`.

### WR-01: `buildAirportTransferJsonLd` declares `inLanguage` without translating `name`/`description`

**Files modified:** `app/[locale]/services/airport-transfer/page.tsx`

**Commit:** `4f86eab`

**Applied fix:** The `buildAirportTransferJsonLd(globals, sClassAirport, vClassAirport, { locale })` call in the page's default export now also passes `name: content.metadata.ogTitle` and `description: interpolate(content.metadata.description, { businessPrice })` — the same content-model source `generateMetadata()` in the same file already uses for the HTML `<title>`/description. The `businessPrice`/`prices` computation was moved above the JSON-LD build so the description's `{businessPrice}` template token is resolved before being passed in (it would otherwise have leaked into the JSON-LD literally). `lib/jsonld.ts`'s `buildAirportTransferJsonLd()` required no changes — its `opts.name`/`opts.description` handling already existed and is covered by the pre-existing `tests/jsonld.test.ts` suite (all 153 tests across `jsonld`/`nav-locale-render-parity`/`routes-a/b/c` still pass).

### WR-02: `openGraph.url` hardcoded to the English URL on every localized page

**Files modified:** the same ~56 `app/[locale]/**` page files as CR-01 (fixed together — WR-02 explicitly builds on CR-01's locale-aware canonical, per the review's own fix note).

**Commits:** same as CR-01 above.

**Applied fix:** `openGraph.url` on every indexable page now reuses the locale-aware `alternates.canonical` value via `toAbsoluteUrl(alternates.canonical)`, instead of a hardcoded literal EN string. For `en`/no-locale/D-07-fallback cases, `toAbsoluteUrl()` reproduces the exact same absolute string every page previously hardcoded (verified via the unchanged EN snapshot and the new `generateMetadata()` test). Two cross-canonical pages (`services/intercity-routes` → `/routes`, noindex `services/corporate-accounts` → `/corporate`) needed special handling since their primary `alternates` call targets a *different* path than the page's own URL:
- `services/intercity-routes` (indexable, cross-canonical): `openGraph.url` is computed from a **second**, locale-scoped `getAlternates('/services/intercity-routes', { indexable: true, locale })` call — so the OG tag still points at the page's own address, just locale-aware, while the primary `alternates.canonical` continues pointing at the `/routes` hub.
- `services/corporate-accounts` (noindex, cross-canonical): `locale` was added to its `getAlternates()` call for sweep consistency (a no-op, since D-06's `indexable: false` branch never reaches the self-canonical logic), but its `openGraph.url` was deliberately left untouched — it's noindex (no indexing consequence either way) and wasn't cited in WR-02's file list, so the fix was scoped conservatively there to minimize risk.

## Skipped Issues

None — all 4 findings were fixed.

## Verification

- **Type check:** `npx tsc --noEmit -p .` — 8 pre-existing errors, all in test files untouched by this fix (`tests/i18n-translate-dnt.test.ts`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts`), matching the documented pre-existing baseline exactly. Zero new errors.
- **Full test suite:** `npx vitest run` — 125 passed / 5 failed test files (1615 passed / 10 skipped / 139 todo tests). The 5 failures are the pre-existing, worktree-only `node_modules/next-intl/server.react-server.js` module-resolution gap (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`) — unrelated to this fix, reproduces on a clean worktree checkout before any of these changes.
- **Byte-parity:** `tests/route-page-render.test.tsx`'s golden EN snapshot (`tests/__snapshots__/route-page-render.test.tsx.snap`) is unchanged — confirms `PragueViennaPage()`'s rendered EN HTML (including its JSON-LD canonical/og references) is byte-for-byte identical to before this fix.
- **New/extended tests:** `tests/seo.test.ts` (CR-01 `opts.locale` contract: self-referencing non-EN canonical, D-07 EN-fallback, `indexable:false` no-op, invalid-locale fallback, chrome-only any-locale self-reference; `toAbsoluteUrl()` normalization), `tests/blog-locale-fallback.test.ts` (`blogCanonical()`'s new `locale` param), `tests/route-page-render.test.tsx` (a real route page's `generateMetadata()` self-canonicalizes for `locale:'ru'` and matches today's hardcoded values byte-for-byte for `locale:'en'`).
- **Verification environment:** all commands above ran inside the isolated git worktree (`workflow.use_worktrees` was not `false`), same tree the commits landed on — reproducible from this worktree's state before teardown.

---

_Fixed: 2026-09-23T22:03:55Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
