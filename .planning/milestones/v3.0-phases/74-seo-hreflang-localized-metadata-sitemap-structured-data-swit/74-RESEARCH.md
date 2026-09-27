# Phase 74: SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher - Research

**Researched:** 2026-09-21
**Domain:** Next.js App Router SEO (hreflang/Metadata API, MetadataRoute.Sitemap, JSON-LD) + next-intl 4.x locale-aware navigation, against an already-shipped 7-locale i18n codebase (Phases 68-73 complete)
**Confidence:** HIGH (all core findings verified by reading the actual source files this session; a small number of items are WebSearch-sourced SEO convention and are tagged accordingly)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Language switcher (UX-01)**
- **D-01:** Placement — header, where the current `A ▾` control already sits (left of the "Забронировать"/Book button in `SiteChrome`/header). The slot is effectively already reserved.
- **D-02:** Labels — endonyms: `English, Русский, Español, Français, العربية, हिन्दी, 中文`. Each language named in itself. No flags. — Reversibility: reversible (a label map).
- **D-03:** Switch behavior — stay on the same page in the target locale (`/ru/routes/prague-vienna` → `/es/routes/prague-vienna`), never jump to home. Must go through the `@/i18n/routing` locale-aware navigation (Phase 70 pattern), not string concatenation. When the target locale lacks a translation, EN-fallback renders (Phase 71 D-07). — Reversibility: reversible.
- Presentation (dropdown vs other) is Claude's discretion — the `A ▾` affordance implies a dropdown.

**First-visit auto-detection (UX-02)**
- **D-04:** On first visit, if `Accept-Language` matches a supported locale, show a soft, dismissible banner ("Continue in English? / Продолжить на русском?"). URL never changes without a click — zero cloaking risk. Choice written to the `NEXT_LOCALE` cookie. — Reversibility: reversible.
- **D-05:** No automatic URL redirect — ever. Not on `Accept-Language`, not on the `NEXT_LOCALE` cookie. A returning visitor with `NEXT_LOCALE=ru` hitting `/` is not redirected; cookie drives banner/UI memory, not the address bar. Banner shown once (dismissal remembered). — Reversibility: reversible.
- **D-05a (implication):** `routing.localeDetection` in `i18n/routing.ts` stays `false`. UX-02 is satisfied by the custom banner, not next-intl's built-in redirecting detection.

**hreflang coverage (SEO-01 / SEO-03)**
- **D-06:** No hreflang cluster on `noindex` pages. The 20 `noindex` `prague-to-{city}` routes (and any other noindex page) do not participate in hreflang — every URL in a cluster must be indexable and self-canonical. Their locale variants are likewise `noindex`. — Reversibility: costly — the alternates helper must know each page's index status, shaping its signature.
- **D-07:** hreflang cluster is content-aware: a locale alternate is emitted only when a genuine translation exists. EN-fallback pages (untranslated blog per Phase 71 D-07, the 3 EN-only `JSX_POSTS` per D-08) are excluded from the cluster and stay self-canonical → EN. — Reversibility: costly — `getAlternates()` becomes translation-aware, read by every page + the sitemap.
- **D-06/07 implication:** the centralized `getAlternates(path, …)` helper (Claude's discretion to design/centralize) must take both index status and translation availability into account. Same logic feeds `app/sitemap.ts`.

**Localized OG / metadata (SEO-02 / SEO-04)**
- **D-08:** One shared, text-neutral `og-image.jpg` for all locales. Only `og:title`, `og:description`, and the OG image `alt` are localized. — Reversibility: reversible.
- **D-09:** JSON-LD gets `inLanguage` set to the active locale (BCP-47 tag) and localized text fields (name/description sourced from the content model), while locale-invariant data (prices, `priceValidUntil`, Place ID, ratings) stays as-is. EN structured-data output must remain byte-for-byte unchanged (Phase 71 constraint). — Reversibility: reversible.

### Claude's Discretion
- Whether/how to centralize the ~56 inline `alternates` blocks into a shared `getAlternates(path, opts)` helper vs edit in place (recommend centralize) — architecture.
- The helper's exact signature and how it reads index status + translation availability.
- BCP-47 tag mapping per locale for `inLanguage` / hreflang.
- Dropdown component internals, cookie write mechanics, banner render location in `SiteChrome`.
- Sitemap alternates-cluster construction reusing the same helper.

### Deferred Ideas (OUT OF SCOPE)
- Per-locale OG images with baked-in translated text (incl. RTL/CJK rendering).
- Localize the `/fleet` page (`app/[locale]/fleet/page.tsx` hardcodes EN `vehicles[]`) — Phase-71-style content gap, not Phase 74 (SEO) scope.
- Auto-redirect by locale/cookie — explicitly rejected for SEO safety (D-05).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEO-01 | `getAlternates()` emits all 6 hreflang alternates + `x-default` on every page | See "Architecture Patterns → Pattern 1" — full inventory of 57 call sites, extension design, `getPathname()` for locale-aware URL construction |
| SEO-02 | `generateMetadata` produces localized title/description/OG per locale | See "Common Pitfalls → Pitfall 1" (7+ confirmed-affected force-static pages that silently ignore locale) and "Pattern 3" |
| SEO-03 | Sitemap emits every locale URL with a full alternates cluster | See "Pattern 1" + "Code Examples → Sitemap" — single `entry()` helper reuses `getAlternates()` |
| SEO-04 | JSON-LD carries `inLanguage` and localized text fields | See "Pattern 4" — `lib/jsonld.ts` extension design, byte-parity snapshot mechanism, breadcrumb hardcode finding |
| UX-01 | Language switcher UI with `NEXT_LOCALE` cookie persistence | See "Common Pitfalls → Pitfall 2" (no switcher exists today — CONTEXT.md's premise is factually wrong) + "Pattern 5" (next-intl auto-sets `NEXT_LOCALE` via router navigation — no hand-rolled cookie code needed) |
| UX-02 | First-visit language auto-detection via `Accept-Language` (no crawler cloaking) | See "Common Pitfalls → Pitfall 3" (root-layout dynamic-API trap) + "Pattern 6" (client-only `navigator.language` design) |
</phase_requirements>

## Summary

This phase extends an already-complete 7-locale i18n build (Phases 68-73, all shipped) with the final SEO layer. The codebase is in good shape for this work: `next-intl@4.14.2` is installed and locked, `@/i18n/routing` already exports a full locale-aware navigation bridge (`Link`, `redirect`, `usePathname`, `useRouter`, `getPathname`), and all 7 locale content trees (`content/routes/*`, `content/pages/*`, `content/blog/*`) are **fully populated (30/30 routes, 17/17 pages, 11/11 blog posts per locale)** — translation coverage is not a blocker for this phase.

However, three verified findings materially change what the planner should scope:

1. **The `A ▾` switcher CONTEXT.md describes does not exist in the codebase.** A full-repo grep for `▾`, `NEXT_LOCALE`, and any Locale/Language/Switcher component returns zero hits. The Phase Boundary text in CONTEXT.md itself says "Does not exist yet — built from scratch," which is the accurate statement; D-01's "the slot is effectively already reserved" is not. Treat UX-01 as a genuine new-component build inserted into `components/Nav.tsx` (not `SiteChrome.tsx` — Nav.tsx is the actual header/nav bar with the Book button; SiteChrome is the root layout wrapper that renders Nav's parent tree).
2. **A pre-existing, confirmed, reproducible bug silently serves EN content on every non-EN locale for at least 10 force-static pages** — `about`, `terms`, `corporate`, `privacy`, `faq`, `blog` (listing), `contact` (confirmed and documented in Phase 73's `73-RTL-QA.md`/`deferred-items.md`), plus `services/corporate-accounts`, `services/group-transfers`, `services/vip-events` (same code pattern, confirmed via grep this session, not yet live-verified). Root cause: `generateMetadata()`/page body call bare `getLocale()` instead of forwarding `{ locale } = await params`, which next-intl's own docs say is required for reliable locale resolution on `dynamic = 'force-static'` pages. **This bug directly defeats SEO-02 and must be fixed as part of this phase** — shipping "localized metadata" that silently renders EN on 10 pages is not a partial success, it is the literal bug this phase exists to eliminate.
3. **"20 noindex `prague-to-{city}` routes" (CONTEXT.md D-06) do not exist in the current codebase.** Those 20 routes were permanently 301-redirected to `/routes` on 2026-04-09 (`next.config.ts` redirects, confirmed by reading the file) — there is no `prague-to-*` directory under `app/[locale]/routes/`. The real, current noindex pages are: `/data-deletion`, `/login` (layout-level static metadata), `/book/confirmation` (layout-level static metadata), and `/services/corporate-accounts` (cross-canonicalizes to `/corporate`). D-06's *principle* (no hreflang cluster on noindex pages) is still correct and still needed — but the planner should verify against these 4 real pages, not a nonexistent set of 20.

**Primary recommendation:** Centralize all 57 inline `alternates.languages` blocks (56 in `app/[locale]/**` + `app/sitemap.ts`) behind one extended `getAlternates(path, opts)` in `lib/seo.ts`, driven by two inputs the caller already effectively knows: an `indexable` boolean and a `content` reference `{ kind: 'route'|'page'|'blog', key }` that the helper uses to `fs.existsSync`-probe per-locale translation presence (the same technique `lib/blog.ts`'s `resolveLocalizedMdx()` already uses for the identical D-07 problem on blog posts). Reuse `getPathname()` from `@/i18n/routing` for locale-aware URL construction in both the page helper and the sitemap so they can never diverge. Fix the 10-page `getLocale()` bug as an explicit task before or alongside wiring localized metadata for those pages — otherwise SEO-02 ships broken on ~18% of the site's static pages.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| hreflang alternates (`getAlternates()`) | Frontend Server (SSR/SSG metadata) | — | Computed at build/request time inside `generateMetadata()`, a Next.js server-only API; no client involvement |
| Sitemap generation | Frontend Server (build-time route handler) | — | `app/sitemap.ts` is a Next.js Metadata Route, runs server-side only, output is static XML served by the framework |
| Localized `generateMetadata` | Frontend Server (SSR/SSG metadata) | Content/Storage (JSON content model on disk) | Metadata is server-computed from `content/{routes,pages,blog}/<locale>/*` files read via `node:fs` |
| JSON-LD structured data | Frontend Server (embedded `<script>` in Server Component output) | — | Built server-side in `lib/jsonld.ts` and per-page `page.tsx`, serialized into the HTML response |
| Language switcher UI | Browser / Client | Frontend Server (navigation target resolution via `getPathname`) | Interactive dropdown = Client Component (`'use client'`, matches `Nav.tsx`'s existing pattern); the *target URL* for each locale option is computed via next-intl's locale-aware routing, which runs both server (initial render) and client (navigation) |
| `NEXT_LOCALE` cookie write | Frontend Server (next-intl middleware, already composed into `middleware.ts`) | Browser (triggers the request that causes the write) | Per next-intl 4.x docs, the cookie is set automatically by the framework's own routing/middleware layer when the resolved locale differs from what `Accept-Language` would suggest — not something application code writes directly |
| First-visit banner | Browser / Client | — | Must read `navigator.language` client-side only; a server-side `Accept-Language` header read in a shared layout would opt the entire static marketing route tree into dynamic rendering (see Pitfall 3) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next-intl` | 4.14.2 (pinned, already installed — `npm view next-intl version` returns `4.14.6` current registry latest as of this session) [VERIFIED: npm registry] | i18n routing, locale-aware navigation (`Link`/`useRouter`/`getPathname`), message catalogs | Already the project's locked i18n stack since Phase 68 (`68-01: next-intl@4.14.2 exact pin approved via blocking-human package-legitimacy checkpoint`); this phase extends usage, does not introduce it |
| Next.js `Metadata` API (`generateMetadata`, `alternates.languages`, `alternates.canonical`) | Next 16.2.3 (project's installed range) [VERIFIED: package.json] | Per-page hreflang, title/description/OG | Native framework API, zero new dependency |
| Next.js `MetadataRoute.Sitemap` | same | Sitemap generation with `alternates.languages` per URL | Native framework API — `app/sitemap.ts` already uses this exact shape today |

### Supporting
None — no new packages are required for this phase. All work is native Next.js Metadata API + the already-installed `next-intl` navigation bridge.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side `navigator.language` for first-visit detection (recommended, Pattern 6) | Server-side `headers().get('accept-language')` in a layout/middleware | Server read in the shared root layout would force dynamic rendering site-wide (see Pitfall 3); a middleware-set cookie is workable but adds a moving part with no benefit over the simpler client-only read, since D-05 already forbids any redirect behavior that would need the value server-side |
| Filesystem `existsSync` probe for translation availability (recommended, matches `lib/blog.ts` precedent) | A build-time-generated manifest/JSON of "translated paths" | The existing codebase already uses the direct-fs-probe technique in 3 places (`route-content.ts`, `page-content.ts`, `blog.ts`) — introducing a manifest would be a new, unprecedented pattern for a problem the codebase already solves consistently |

**Installation:**
```bash
# No new packages. next-intl 4.14.2 is already installed.
```

**Version verification:** `npm view next-intl version` → `4.14.6` (current registry latest). Project is pinned to `4.14.2` per the Phase 68 locked decision (`68-01`); this phase does not need to touch the pin. [VERIFIED: npm registry, checked this session]

## Package Legitimacy Audit

No new external packages are introduced by this phase. All work uses:
- `next-intl` (already installed, already audited/approved in Phase 68)
- `node:fs`, `node:path` (Node built-ins, already used identically in `lib/route-content.ts`, `lib/page-content.ts`, `lib/blog.ts`)
- Next.js's native `Metadata`/`MetadataRoute` types

**Packages removed due to [SLOP] verdict:** none (none proposed).
**Packages flagged as suspicious [SUS]:** none (none proposed).

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │  Build/Request time (Node, server-only)  │
                         └─────────────────────────────────────────┘

 content/routes/<locale>/<slug>.json ─┐
 content/pages/<locale>/<page>.json  ─┼─► fs.existsSync probe ──► translationAvailable(locale)
 content/blog/<locale>/<slug>.mdx    ─┘        (new, in lib/seo.ts,               │
                                                 mirrors lib/blog.ts's             │
                                                 resolveLocalizedMdx pattern)      │
                                                                                    ▼
 page.tsx generateMetadata() ──► indexable: boolean (from that page's own    getAlternates(path, {
   (per-page business logic,       robots/noindex decision — caller-known,      indexable,
    e.g. corporate-accounts        NOT something getAlternates() can infer)     content: {kind,key}
    already knows it's noindex)                                               })
                                                                                    │
                                                                     ┌──────────────┴──────────────┐
                                                                     ▼                              ▼
                                                        { canonical, languages }        (same function, same inputs)
                                                                     │                              │
                                    ┌────────────────────────────────┘                              │
                                    ▼                                                                ▼
                     56 page.tsx/layout.tsx generateMetadata()                         app/sitemap.ts entry()
                     return { alternates: getAlternates(...) }                         alternates.languages: same cluster
                                    │                                                                │
                                    ▼                                                                ▼
                     <link rel="alternate" hreflang="ru" .../>                         /sitemap.xml <xhtml:link>
                     per-locale <link> tags in <head>                                  per-URL alternates

                         ┌─────────────────────────────────────────┐
                         │        Browser (client-side only)        │
                         └─────────────────────────────────────────┘

 Nav.tsx (already 'use client', already imports Link/usePathname
 from @/i18n/routing) ──► NEW: LocaleSwitcher dropdown
        │                        │
        │                        ├─ useLocale() → current locale (next-intl)
        │                        ├─ usePathname() → current path, locale-stripped
        │                        └─ onSelect(locale) → router.replace(pathname, {locale})
        │                                 │
        │                                 ▼
        │                    Next.js issues an RSC/navigation request to
        │                    the new locale-prefixed URL → passes through
        │                    middleware.ts's already-composed next-intl
        │                    handleI18nRouting() → NEXT_LOCALE cookie is
        │                    set automatically by next-intl (no app code
        │                    writes it directly) [CITED: next-intl docs]
        ▼
 NEW: FirstVisitBanner (client component, mounted in SiteChrome
 alongside CookieBanner) ──► useEffect reads navigator.language
        │                        (NEVER headers()/cookies() server-side —
        │                         see Pitfall 3)
        ▼
 compares to current URL locale + a "dismissed" flag in the SAME
 NEXT_LOCALE cookie (read via document.cookie, matching CookieBanner's
 existing localStorage-based dismiss-once pattern) → shows/hides banner,
 NEVER calls router.push/redirect (D-05)
```

### Recommended Project Structure
```
lib/
├── seo.ts                    # EXTEND: getAlternates(path, opts) — the single choke point
components/
├── Nav.tsx                   # EXTEND: insert new LocaleSwitcher inside the existing
│                              #   `flex items-center gap-3` auth+book wrapper (desktop)
│                              #   and the mobile menu block — NOT a new file, matches
│                              #   how the existing account-dropdown lives inline in Nav.tsx
├── LocaleSwitcher.tsx         # NEW (or inline in Nav.tsx — Claude's discretion per CONTEXT)
├── FirstVisitBanner.tsx       # NEW — mounted in SiteChrome next to <CookieBanner />
├── SiteChrome.tsx             # EXTEND: add <FirstVisitBanner /> after <CookieBanner />
i18n/
├── locales.ts                 # EXTEND: add endonym label map + BCP-47 tag map (structural
│                              #   data, NOT translated strings — matches the Phase 69
│                              #   "structural config never moves into message JSON" convention)
lib/
├── jsonld.ts                  # EXTEND: buildRouteJsonLd/buildAirportTransferJsonLd/businessNode
│                              #   gain an optional locale/localized-text parameter
app/
├── sitemap.ts                 # EXTEND: entry() calls getAlternates() instead of hand-rolling
├── [locale]/**/*.tsx           # EDIT: all 56 inline alternates blocks call getAlternates()
```

### Pattern 1: Centralized `getAlternates(path, opts)` — the D-06/D-07 gate

**What:** Extend the existing (currently unused — see Pitfall 4) `lib/seo.ts::getAlternates()` to accept an options object carrying index status and a content reference for translation-availability probing.

**When to use:** Every one of the 57 current `alternates.languages` call sites (56 in `app/[locale]/**` + `app/sitemap.ts`'s `entry()`).

**Existing signature (today, unused by any caller):**
```typescript
// lib/seo.ts — CURRENT, VERIFIED (read this session)
export function getAlternates(canonicalPath: string): AlternatesConfig {
  const normPath = canonicalPath === '/' ? '' : canonicalPath
  const fullUrl = normPath === '' ? BASE : `${BASE}${normPath}`
  return {
    canonical: normPath === '' ? BASE : normPath,
    languages: { en: fullUrl, 'x-default': fullUrl },
  }
}
```
Note the existing single-argument design already supports the `services/intercity-routes` cross-canonical case correctly (call `getAlternates('/routes')` from a page whose own URL is `/services/intercity-routes` to emit a canonical pointing elsewhere) [VERIFIED: `app/[locale]/services/intercity-routes/page.tsx:38-46`, reads `canonical: '/routes'` with a comment "Cross-canonical to /routes"] — preserve this call-with-target-path convention when extending.

**Recommended extension (design sketch — not yet implemented, for planner task-breakdown):**
```typescript
import fs from 'node:fs'
import path from 'node:path'
import { routing, getPathname } from '@/i18n/routing'

type ContentRef = { kind: 'route' | 'page' | 'blog'; key: string }

function hasLocaleContent(ref: ContentRef, locale: string): boolean {
  const root = { route: 'routes', page: 'pages', blog: 'blog' }[ref.kind]
  const ext = ref.kind === 'blog' ? 'mdx' : 'json'
  return fs.existsSync(
    path.join(process.cwd(), 'content', root, locale, `${ref.key}.${ext}`)
  )
}

export function getAlternates(
  canonicalPath: string,
  opts: { indexable?: boolean; content?: ContentRef } = {}
): AlternatesConfig {
  const normPath = canonicalPath === '/' ? '' : canonicalPath
  const fullUrl = normPath === '' ? BASE : `${BASE}${normPath}`

  // D-06: noindex pages emit no hreflang cluster at all.
  if (opts.indexable === false) {
    return { canonical: normPath === '' ? BASE : normPath, languages: {} }
  }

  // D-07: only locales with a genuine translation join the cluster.
  const availableLocales = opts.content
    ? routing.locales.filter(
        (l) => l === 'en' || hasLocaleContent(opts.content!, l)
      )
    : routing.locales // no content ref supplied → assume site-chrome-only page, all locales valid

  const languages: Record<string, string> = { 'x-default': fullUrl }
  for (const locale of availableLocales) {
    languages[locale] = BASE + (await getPathname({ locale, href: canonicalPath || '/' }))
  }

  return { canonical: normPath === '' ? BASE : normPath, languages }
}
```
Note: `getPathname` is async in next-intl 4.x when locale-prefix resolution requires it — the planner should verify the exact sync/async signature against the installed `4.14.2` version during implementation (the Context7-sourced example below uses `await getPathname(...)` inside an async `sitemap()` function) [CITED: next-intl docs, `amannn/next-intl`, "Generate localized sitemap with alternate language URLs"].

### Pattern 2: Blog's existing D-07 implementation — the closest working analog

**What:** `lib/blog.ts::resolveLocalizedMdx()` + `blogCanonical()` already solve the exact D-07 problem (content-aware canonical, EN-fallback exclusion) for blog posts, and `app/[locale]/blog/[slug]/page.tsx` already consumes it correctly.

**When to use:** As the reference pattern for `getAlternates()`'s content-awareness — do not reinvent this logic, generalize it.

```typescript
// Source: lib/blog.ts (VERIFIED, read this session, lines 141-176)
export function resolveLocalizedMdx(
  slug: string,
  locale: string
): { dir: string; isFallback: boolean } | null {
  if (!SLUG_PATTERN.test(slug)) return null
  if (!(routing.locales as readonly string[]).includes(locale)) return null

  const localizedFile = path.join(BLOG_ROOT, locale, `${slug}.mdx`)
  if (fs.existsSync(localizedFile)) return { dir: locale, isFallback: false }

  const enFile = path.join(BLOG_ROOT, 'en', `${slug}.mdx`)
  if (fs.existsSync(enFile)) return { dir: 'en', isFallback: true }

  return null
}

export function blogCanonical(slug: string, isFallback: boolean): string {
  return isFallback
    ? `https://rideprestigo.com/blog/${slug}`   // EN-fallback → canonical → EN absolute
    : `/blog/${slug}`                            // genuine translation → locale-relative
}
```
`app/[locale]/blog/[slug]/page.tsx`'s `generateMetadata` already calls both and produces the correct D-07 canonical today [VERIFIED: read this session]. When wiring `getAlternates()` for blog posts, either (a) special-case blog to keep using `resolveLocalizedMdx`/`blogCanonical` directly (simplest, zero regression risk on already-correct code), or (b) fold blog into the generalized `hasLocaleContent({kind:'blog', key: slug}, locale)` probe in Pattern 1 — functionally equivalent, since both do the identical `fs.existsSync` check on the identical file layout.

### Pattern 3: Localized `generateMetadata` — extend the home-page content-sourced pattern

**What:** `app/[locale]/page.tsx` already sources `title`/`description`/`ogTitle` from `getPageContent('home', locale)`. All 56 pages with `alternates.languages` blocks already call `getPageContent`/`getRouteContent`/blog equivalents for their body content — the metadata-sourcing pattern is already locale-aware everywhere **except the ~10 pages hit by Pitfall 1**.

```typescript
// Source: app/[locale]/page.tsx (VERIFIED, read this session)
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getPageContent('home', locale) as HomeContent
  return {
    title: { absolute: content.metadata.title },
    description: content.metadata.description,
    alternates: { canonical: HOME_URL, languages: { en: HOME_URL, 'x-default': HOME_URL } },
    openGraph: {
      url: HOME_URL,
      title: content.metadata.ogTitle,
      description: content.metadata.description,
      images: [{ url: `${HOME_URL}/og-image.jpg`, width: 1200, height: 630, alt: '...' }],
    },
  }
}
```
For D-08 (shared OG image, localized alt/title/description only): keep `images[0].url` as the single shared `/og-image.jpg` across all locales; localize only `title`, `description`, and `alt`. No per-locale image work needed.

### Pattern 4: JSON-LD `inLanguage` + localized text — the EN byte-parity constraint

**What:** `lib/jsonld.ts::buildRouteJsonLd(route, slug)` currently builds `name`/`description` from **DB-sourced, English-only** `route.fromLabel`/`route.toLabel` via a hardcoded English template string — it does **not** currently read the content model at all.

```typescript
// Source: lib/jsonld.ts (VERIFIED, read this session, lines 62-115)
export function buildRouteJsonLd(route: RoutePrice, slug: string): JsonLdDocument {
  const priceValidUntil = futureIsoDate(365)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      businessNode(),
      {
        '@type': 'Service',
        name: `Private Chauffeur Transfer from ${route.fromLabel} to ${route.toLabel}`,
        description: `Private chauffeured transfer from ${route.fromLabel} to ${route.toLabel}. Fixed price from €${route.eClassEur}. ${route.distanceKm} km door-to-door in a Mercedes E, S, or V-Class.`,
        // ...
      },
    ],
  }
}
```
**Critical design constraint:** the current EN `name` string ("Private Chauffeur Transfer from Prague to Vienna") does **not** match `content/routes/en/prague-vienna.json`'s `metadata.title` ("Prague to Vienna Chauffeur — From €{ePrice}") [VERIFIED: read both files this session]. Switching `name`'s source to the content model unconditionally would change the EN output — violating D-09's explicit "EN structured-data output must remain byte-for-byte unchanged." Recommend a locale-conditional signature:

```typescript
export function buildRouteJsonLd(
  route: RoutePrice,
  slug: string,
  opts?: { locale: string; name: string; description: string }
): JsonLdDocument {
  const priceValidUntil = futureIsoDate(365)
  const name = opts && opts.locale !== 'en'
    ? opts.name
    : `Private Chauffeur Transfer from ${route.fromLabel} to ${route.toLabel}` // unchanged EN path
  const description = opts && opts.locale !== 'en'
    ? opts.description
    : `Private chauffeured transfer from ${route.fromLabel} to ${route.toLabel}. ...`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      businessNode(),
      {
        '@type': 'Service',
        inLanguage: opts?.locale ?? 'en',   // NEW field — see byte-parity note below
        name,
        description,
        // ...
      },
    ],
  }
}
```
Callers (each route `page.tsx`) already have `content.metadata.title`/`content.metadata.description` (locale-aware, via `getRouteContent`) available to pass as `opts.name`/`opts.description` with `interpolate()` (NOT `interpolateBidi()` — JSON-LD is `JSON.stringify`'d, never a `ReactNode`; this exact plain-vs-bidi carve-out is already an established, tested convention — see `lib/content-interpolate.ts`'s doc comment and `tests/route-page-render.test.tsx`'s "JSON-LD text stays a plain string" assertions).

**The "byte-for-byte unchanged" resolution (read this precisely):** adding `inLanguage: 'en'` to the EN output is, literally, a byte change to `tests/__snapshots__/route-page-render.test.tsx.snap`'s golden snapshot. This is **not** a violation of D-09 in the sense the project actually practices "byte parity" — Phase 73 twice already regenerated this exact golden snapshot for a deliberate, scoped change and verified **programmatically that the only diff is the intended one** (73-04: text-right→text-end token swap; 73-09: confirmed stripping `<bdi>` tags reproduces the prior snapshot byte-for-byte). Follow the same discipline here: regenerate the snapshot after adding `inLanguage`, then assert (in a throwaway script or a test) that the diff between old and new snapshot is exactly the new `inLanguage` key at each `@graph` node — nothing else drifted.

**Also verified, needs planner attention:** the `BreadcrumbList` `name` fields (`'Home'`, `'Routes'`, `'Prague to Vienna'`) are hardcoded English literals **inline in every one of the 31 route page.tsx files** (not in `lib/jsonld.ts`) [VERIFIED: `grep -rln "name: 'Home'" app/[locale]/routes/` → 31 files]. D-09 only explicitly names Service `name`/`description`; whether breadcrumb labels are in scope is not locked — flagged as an Open Question below.

### Pattern 5: `NEXT_LOCALE` cookie — next-intl sets it automatically, do not hand-roll

**What:** next-intl 4.x's own middleware/routing layer writes the `NEXT_LOCALE` session cookie automatically whenever a user's resolved locale differs from what `Accept-Language` would suggest — this is framework behavior, not application code, and it is **independent of `localeDetection`** (a common point of confusion the changelog explicitly calls out).

```
// Source: next-intl docs (CITED, via Context7 `/amannn/next-intl`,
// "localeCookie" + next-intl 4.0 changelog "GDPR compliance" section)
"If a user changes the locale to a value that doesn't match the accept-language
header, next-intl will set a session cookie called NEXT_LOCALE ... Previously,
localeDetection: false ambiguously also disabled the cookie from being set, but
since a separate localeCookie option was introduced recently, this should now
be used instead."
```
Our `i18n/routing.ts` sets `localeDetection: false` (D-05a, intentional, unchanged) but does **not** set `localeCookie: false` [VERIFIED: read `i18n/routing.ts` this session — only `locales`, `defaultLocale`, `localePrefix`, `localeDetection` keys are present]. This means: **the cookie-writing behavior needed for UX-01 is already latent in the already-composed middleware** (`middleware.ts` calls `handleI18nRouting(request)` = `createMiddleware(routing)` on every public-route request). The switcher's only job is to navigate correctly — use `router.replace(pathname, { locale: newLocale })` from `@/i18n/routing`'s exported `useRouter` (already exported, confirmed in `i18n/routing.ts`), and let next-intl's own request handling set the cookie as a side effect. **Do not write `document.cookie = 'NEXT_LOCALE=...'` by hand** — that duplicates framework behavior, risks attribute mismatches (`sameSite`/`path`), and there is no `js-cookie` or similar package installed to do it "properly" either [VERIFIED: `grep "js-cookie\|cookies-next"` package.json → no hits].

```typescript
// Recommended LocaleSwitcher sketch
'use client'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/routing'

const LOCALE_LABELS: Record<string, string> = {
  en: 'English', ru: 'Русский', es: 'Español', fr: 'Français',
  ar: 'العربية', hi: 'हिन्दी', zh: '中文',
} // structural, endonym-invariant — lives in i18n/locales.ts, NOT messages/*.json
  // (matches the 69-02 convention: "structural config never moves into message JSON")

export default function LocaleSwitcher() {
  const current = useLocale()
  const pathname = usePathname()          // already locale-stripped by next-intl
  const router = useRouter()
  // D-03: router.replace (not push) to the SAME pathname, only the locale changes.
  // EN-fallback content (D-07) renders automatically — the target page's own
  // getRouteContent/getPageContent already falls back to EN when no localized
  // file exists; the switcher does not need to know this in advance.
  return ( /* dropdown, insetInlineEnd-style positioning matching Nav.tsx's
              existing account-menu dropdown for RTL safety */ )
}
```

**Verification note (not executed this session — flag for a Wave-0/checkpoint task):** confirm in local dev (`next dev` + browser devtools → Application → Cookies) that a locale switch actually produces a `Set-Cookie: NEXT_LOCALE=...` response header, since this is framework behavior inferred from documentation, not observed directly in this codebase.

### Pattern 6: First-visit banner — client-only `navigator.language`, never a server `Accept-Language` read

**What:** `components/SiteChrome.tsx` has an explicit, load-bearing comment: *"No headers()/cookies() read here on purpose: any dynamic API in the root layout opts the ENTIRE route tree into dynamic rendering, defeating the revalidate/force-static directives on the marketing pages below."* [VERIFIED: read this session, `SiteChrome.tsx:121-126`]. This is a hard constraint: **UX-02's `Accept-Language` read must not happen via a server-side `headers()` call in any shared layout/component**, or it silently breaks the ISR/static-rendering strategy for the entire public site (36+ pages currently on `revalidate`/`force-static`).

`components/CookieBanner.tsx` is the closest existing analog and should be mirrored structurally: `'use client'`, mounted in `SiteChrome` alongside it, reads its own dismiss-state client-side (`localStorage` there; here, per D-04, the `NEXT_LOCALE` cookie), renders `null` until a `useEffect` decides to show itself, never touches server state.

```typescript
'use client'
import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'

export default function FirstVisitBanner() {
  const currentLocale = useLocale()
  const [suggestion, setSuggestion] = useState<string | null>(null)

  useEffect(() => {
    // Client-only — navigator.language reflects the browser's own language
    // setting (the closest client-side proxy for Accept-Language) with zero
    // server involvement, zero dynamic-rendering opt-in, zero cloaking risk
    // (D-04/D-05): the HTML the crawler sees and the HTML the user's browser
    // paints are byte-identical; only a client-side script conditionally
    // shows a dismissible overlay after hydration.
    const already = document.cookie.includes('NEXT_LOCALE=')  // dismissed or already switched once
    if (already) return
    const browserLang = navigator.language.split('-')[0]
    if (browserLang !== currentLocale && SUPPORTED_LOCALES.includes(browserLang)) {
      setSuggestion(browserLang)
    }
  }, [currentLocale])

  if (!suggestion) return null
  // Dismiss → write NEXT_LOCALE cookie directly here (D-04: "written to the
  // NEXT_LOCALE cookie" even on dismiss-without-switching) OR navigate via
  // the switcher's router.replace(pathname, {locale: suggestion}) if the
  // user clicks "Switch". Never redirect/navigate automatically (D-05).
  return ( /* dismissible bar, no URL change on render or on dismiss */ )
}
```
**Open point for the planner:** dismissing the banner *without switching* still needs to write something client-side so it doesn't reappear (D-04 says "the choice is written to the NEXT_LOCALE cookie"). Since next-intl only writes `NEXT_LOCALE` automatically on an actual locale-changing navigation (Pattern 5), a plain "dismiss" (staying on EN) may need the banner component itself to set `document.cookie = "NEXT_LOCALE=" + currentLocale + "; ..."` directly for the dismiss-only case — this is the one legitimate case for hand-writing the cookie, since no navigation occurs to trigger next-intl's automatic write. Match the cookie attributes next-intl itself uses (`sameSite: 'lax'`) per the docs cited in Pattern 5.

### Anti-Patterns to Avoid
- **Hand-writing `document.cookie` for the locale-switch case (not the dismiss-only case):** next-intl already does this automatically on navigation — duplicating it risks attribute drift (`sameSite`, `path`, `maxAge`) between the two write sites.
- **Server-side `Accept-Language` header read in `SiteChrome` or any shared layout:** breaks static rendering site-wide (Pitfall 3).
- **`${locale}${href}` string concatenation for the switcher's target URL:** explicitly forbidden by D-03 and by the project's own established anti-pattern list (`i18n/routing.ts`'s doc comment: "never hand-roll `${locale}${href}` string concatenation").
- **Treating file-existence in `content/<kind>/<locale>/` as a *complete* translation-quality signal:** Phase 72's pipeline can silently fall back individual *units* to EN text inside an otherwise-existing locale file when DNT/ICU/plural verification fails (`72-02: "a unit failing DNT/ICU/plural verification falls back to the EN value in the output ... excluded from the manifest"`). File-existence is still the correct, established, page-level granularity for the hreflang gate (matches `lib/blog.ts`'s precedent exactly) — just be aware it is not a 100% content-perfect guarantee, only a "this page is not a wholesale EN-fallback" guarantee.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale-aware URL construction for the switcher/sitemap/alternates | A custom `${BASE}/${locale}${path}` string builder that special-cases `en` (no prefix) vs everything else | `getPathname({ locale, href })` from `@/i18n/routing` (already exported) | Already encodes `localePrefix: 'as-needed'` correctly (EN at root, others prefixed); a hand-rolled version WILL get the EN-no-prefix case wrong eventually and is exactly the "string concatenation" anti-pattern the project's own docs forbid |
| `NEXT_LOCALE` cookie persistence | Manual `document.cookie` writes on every switch | next-intl's automatic cookie write via `router.replace(pathname, {locale})` navigation (Pattern 5) | Framework already does this; hand-rolling duplicates behavior and risks attribute mismatch |
| Translation-availability detection | A new JSON manifest of "which locales have content for path X" | `fs.existsSync` probe against the content tree (Pattern 1/2, matches 3 existing precedents in the codebase) | The codebase already solves this exact problem three times (routes, pages, blog) with the same technique — a manifest would be an unprecedented 4th approach for an identical problem |
| BCP-47 language tag correctness for `zh` | Assuming `zh` alone is sufficient for `inLanguage`/hreflang | `zh-Hans` (explicit script subtag) | `zh` alone is ambiguous/defaults to "predominant Mandarin form" per Google's own hreflang guidance; `zh-Hans` unambiguously targets Simplified Chinese script regardless of country — matches the project's Noto Sans **SC** (Simplified Chinese) font choice already shipped in Phase 73 |

**Key insight:** every non-trivial primitive this phase needs — locale-aware path construction, cookie persistence, translation-existence checks — already has a working, tested precedent somewhere in this codebase or in next-intl itself. The actual work is *wiring existing primitives into 57 call sites consistently*, plus fixing one confirmed pre-existing bug (Pitfall 1) that would otherwise silently defeat SEO-02.

## Common Pitfalls

### Pitfall 1: The `getLocale()`-without-`params` bug — confirmed EN-leak on 10 force-static pages
**What goes wrong:** `generateMetadata()` (and the page body) calls bare `getLocale()` from `next-intl/server` instead of forwarding `{ locale } = await params`. On a page with `export const dynamic = 'force-static'`, this resolves to the i18n config's **default locale (`en`)** during static generation, regardless of which locale URL is actually being built — so `/ru/about`, `/es/about`, etc. all silently render the identical English `content/pages/en/about.json` content, even though `content/pages/ru/about.json` genuinely exists and is correctly translated.
**Why it happens:** next-intl's own documented pattern (confirmed via Context7 during Phase 73's investigation) requires explicitly forwarding the resolved `{ locale } = await params` into `generateMetadata`/page body for reliable locale resolution under `force-static` rendering — a bare `getLocale()` call works correctly for the *dynamic/ISR* pages (`revalidate = 120`, e.g. every route page and the home page) but not for `force-static` pages.
**Confirmed-affected (this session + Phase 73's live-server verification):**
- 7 pages **already reproduced and documented** in `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md`: `about`, `terms`, `corporate`, `privacy`, `faq`, `blog` (listing), `contact`.
- 3 additional pages with the **identical code pattern** (bare `getLocale()` + `force-static` + `getPageContent`), confirmed via grep this session but **not yet live-verified**: `services/corporate-accounts`, `services/group-transfers`, `services/vip-events`.
- 5 more `force-static` pages exist (`authors/roman-ustyugov`, `blog/[slug]`, and the 3 `JSX_POSTS` blog articles) but do **not** call `getLocale()`/`getPageContent` at all — they are correctly, deliberately EN-only (author bio has no locale content model; `JSX_POSTS` are EN-only per Phase 71 D-08) — these are NOT bugs, just not in scope for localization.
**How to avoid:** forward `{ locale } = await params` explicitly in both `generateMetadata({ params })` and the page component body for every affected page, per the fix `deferred-items.md` already recommends. This should be an explicit, first-class task in the Phase 74 plan — SEO-02 cannot be honestly called "done" while it ships broken on 10 pages.
**Warning signs:** any page where `generateMetadata` or the body calls `getLocale()` with no arguments AND the page has `export const dynamic = 'force-static'`.

### Pitfall 2: The switcher's "already exists" premise is false
**What goes wrong:** Planning around D-01's framing ("replace the current `A ▾` control") will fail immediately — there is nothing to replace.
**Why it happens:** CONTEXT.md's Decisions section (D-01) and its own Phase Boundary section directly contradict each other; the Phase Boundary text ("Does not exist yet — built from scratch") is the one that matches the actual repository state.
**Verified:** `grep -rn "▾"` across the entire repo (0 hits), `grep -rn "NEXT_LOCALE"` (0 hits), no `Locale`/`Language`/`Switcher`-named component anywhere. The only header dropdown that exists is `Nav.tsx`'s **account menu** (initial-circle + chevron, shown only when `user` is signed in) — plausibly what someone browsing a session as a user with an email starting with "A" mistook for a locale control.
**How to avoid:** treat UX-01 as a new component inserted into `Nav.tsx`'s existing `flex items-center gap-3` wrapper (desktop) and mobile menu block, positioned per D-01's *intent* (header, near the Book button) — not a literal find-and-replace.

### Pitfall 3: Root-layout dynamic-API trap for `Accept-Language`
**What goes wrong:** Reading `headers().get('accept-language')` (or `cookies()`) inside `SiteChrome.tsx` or `app/[locale]/layout.tsx` opts the **entire route tree** into dynamic (uncached) rendering.
**Why it happens:** Next.js App Router treats any dynamic API call in a layout as poisoning every page under it for static optimization purposes — this is exactly why `SiteChrome.tsx` currently has a load-bearing comment forbidding it.
**How to avoid:** UX-02's `Accept-Language`-equivalent signal must come from `navigator.language` inside a `'use client'` component's `useEffect` (Pattern 6) — zero server involvement, zero risk to the 36+ pages currently on `revalidate`/`force-static`.
**Warning signs:** any `import { headers } from 'next/headers'` (or `cookies()`) appearing in `SiteChrome.tsx`, `app/[locale]/layout.tsx`, or any file they import at module scope.

### Pitfall 4: `getAlternates()` exists but is currently dead code
**What goes wrong:** Assuming the "centralized helper" already functions as a real choke point today.
**Why it happens:** `lib/seo.ts::getAlternates()` is fully implemented and exported, but `grep -rn "getAlternates("` across `app/` returns **zero call sites**. All 57 `alternates.languages` blocks are hand-rolled literal objects, independently duplicated.
**How to avoid:** this phase's centralization work is a genuine, from-scratch refactor of 57 files, not a matter of "extending an already-wired helper" — budget planning effort accordingly (likely several plans/waves given the file count, matching the scale of similar multi-file mechanical sweeps in Phase 73, e.g. 73-09's 32-file sweep).

### Pitfall 5: D-06 already has live, uncorrected violations today
**What goes wrong:** Assuming noindex-cluster-suppression (D-06) is new work needed only for hypothetical future pages.
**Why it happens:** It isn't hypothetical — `app/[locale]/data-deletion/page.tsx` (VERIFIED: `robots: { index: false }` at line ~48) and `app/[locale]/services/corporate-accounts/page.tsx` (`robots: { index: false, follow: true }`) **both currently still emit a full `{en, x-default}` alternates cluster** alongside their noindex directive [VERIFIED: read both files this session] — the exact contradiction D-06 exists to prevent, already shipped in production.
**How to avoid:** when wiring these two pages (plus `login`/`book/confirmation`, which use static `metadata` exports with no `alternates` block at all today — nothing to fix there) into the new `getAlternates()`, explicitly pass `indexable: false` and verify the resulting `languages` object is empty.
**Warning signs:** any page with `robots: { index: false, ... }` that also has a non-empty `alternates.languages`.

### Pitfall 6: "20 noindex prague-to-{city} routes" — stale reference, do not search for it
**What goes wrong:** Time spent looking for `app/[locale]/routes/prague-to-*` directories, or planning tasks against a 20-page noindex set that doesn't exist.
**Why it happens:** CONTEXT.md's D-06 text describes routes that **were permanently removed** on 2026-04-09 — `next.config.ts` contains 40 explicit 301 redirects (`prague-{city}` and `prague-to-{city}` variants) to `/routes` for exactly these 20 slugs [VERIFIED: read `next.config.ts` this session, `removedRedRoutes`/`removedRedRoutesTo` arrays]. There is no live page at these URLs to apply hreflang logic to.
**How to avoid:** apply D-06's *principle* to the 4 real current noindex pages (Pitfall 5's list) instead.

### Pitfall 7: JSON-LD `name`/`description` source mismatch breaks EN byte-parity if done carelessly
**What goes wrong:** Wiring `buildRouteJsonLd` to always read from the content model (for consistency) silently changes the EN `name`/`description` strings, since the current EN template (`Private Chauffeur Transfer from ${fromLabel} to ${toLabel}`) does not match `content/routes/en/*.json`'s `metadata.title`/`description` field values verbatim.
**Why it happens:** these were built independently — the JSON-LD template predates the Phase 71 content-model externalization and was never reconciled with it.
**How to avoid:** see Pattern 4's locale-conditional signature — preserve the exact current EN template string, only branch to content-sourced text for non-EN locales.

## Code Examples

### Sitemap — reusing `getAlternates()` from the single `entry()` helper
```typescript
// app/sitemap.ts — CURRENT (VERIFIED, read this session)
const entry = (urlPath: string, sourceFile: string): SitemapEntry => {
  const url = urlPath === '' ? BASE : `${BASE}${urlPath}`
  return {
    url,
    lastModified: lastModFor(sourceFile),
    alternates: { languages: { en: url, 'x-default': url } },
  }
}
```
Recommended extension: pass the same `{indexable, content}` opts the page-level callers use, and spread `getAlternates(urlPath, opts).languages` in place of the hardcoded `{en, x-default}` object — this is the mechanism that guarantees the sitemap and per-page `<link rel="alternate">` tags can never diverge (single source of truth), directly satisfying SEO-03's "extending the single `entry()` helper" framing from CONTEXT.md.

### next-intl official sitemap pattern (for cross-reference)
```typescript
// Source: next-intl docs (CITED, via Context7 `/amannn/next-intl`,
// "Generate localized sitemap with alternate language URLs")
import { MetadataRoute } from 'next'
import { getPathname } from '@/i18n/navigation'

const host = 'https://acme.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    {
      url: host,
      lastModified: new Date(),
      alternates: {
        languages: {
          es: host + (await getPathname({ locale: 'es', href: '/' })),
          de: host + (await getPathname({ locale: 'de', href: '/' })),
        },
      },
    },
  ]
}
```
Confirms `getPathname` is the officially documented tool for exactly this job, and that `app/sitemap.ts` becoming `async` (it is currently a synchronous function — `export default function sitemap()`) is expected/normal when adopting this pattern. **Existing test file `tests/sitemap.test.ts` calls `sitemap()` synchronously** (`const entries = sitemap()`, no `await`) [VERIFIED: read this session] — if `sitemap()` becomes `async`, this test file needs an `await` added or it will silently receive a `Promise` object instead of the entries array and every assertion will fail.

### next-intl Link locale override (for the switcher, alternative to `useRouter`)
```typescript
// Source: next-intl docs (CITED, via Context7)
import { Link } from '@/i18n/navigation'

// You can override the `locale` to switch to another language
// (this will set the `hreflang` attribute on the anchor tag)
<Link href="/" locale="de">Switch to German</Link>
```
Note this example switches to `/` (home) on locale change — D-03 explicitly forbids this ("never jump to home"). Use `usePathname()` (current, locale-stripped path) as the `href`, not a hardcoded `/`, to satisfy D-03: `<Link href={pathname} locale={targetLocale}>{label}</Link>` or the `useRouter().replace(pathname, {locale})` imperative equivalent shown in Pattern 5.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `zh` alone for hreflang/`inLanguage` on Chinese content | `zh-Hans` (explicit script subtag) for Simplified Chinese | Long-standing Google guidance, not a recent change | `zh` alone is treated as "predominant Mandarin form" by Google, which is imprecise for a site targeting a Simplified-script audience specifically; `zh-Hans` is unambiguous [CITED: Google Search Central hreflang guidance, via WebSearch this session, MEDIUM confidence — not independently cross-checked against the primary Google Search Central page URL] |

**Deprecated/outdated:** none identified specific to this phase's stack — `next-intl` 4.x's navigation/routing API used throughout this research (`createNavigation`, `getPathname`, automatic `NEXT_LOCALE` cookie) is the current, actively-documented API surface, not a legacy pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getPathname()` from `@/i18n/routing` (createNavigation) is safe to call inside `app/sitemap.ts` and inside `lib/seo.ts`'s server-only `generateMetadata` context, outside of a React component render | Pattern 1, Code Examples | If it turns out to require request-scoped context (e.g. an active `NextRequest`), the sitemap/getAlternates design needs an alternative locale-URL builder; Context7's own official example shows this exact usage in `app/sitemap.ts`, which is strong (CITED) evidence it works, but was not executed in this session |
| A2 | `getPathname` in the installed `next-intl@4.14.2` requires `await` (async signature) | Pattern 1, Code Examples | If actually synchronous in this exact pinned version, the `await`s in the design sketch are harmless no-ops (awaiting a non-Promise is safe in JS) — low risk either way, but the planner should verify the exact signature against the installed version's type definitions before writing tasks |
| A3 | next-intl automatically writes the `NEXT_LOCALE` cookie on any locale-changing client navigation through the composed middleware (Pattern 5), with no additional application code | Pattern 5, Common Pitfalls (Pitfall — none, treated as a design recommendation) | If this doesn't fire reliably in practice (e.g. because the specific navigation doesn't trigger a fresh request through middleware — cached RSC payload, prefetch edge case), UX-01's cookie-persistence requirement silently fails; flagged with an explicit dev-verification step in Pattern 5 precisely because this was not executed/observed this session, only documented |
| A4 | `zh-Hans` is the correct BCP-47 tag recommendation for this project's `zh` locale (vs `zh-CN` or bare `zh`) | Don't Hand-Roll table, State of the Art | Sourced from a single WebSearch pass (not an official Google Search Central page fetch); if this project's audience is specifically PRC-based rather than script-based, `zh-CN` might be argued as equally valid — low practical risk since `zh-Hans` is described as the more modern, more precise convention by every source surfaced |
| A5 | The 3 additional force-static pages found via grep (`services/corporate-accounts`, `services/group-transfers`, `services/vip-events`) exhibit the identical EN-leak bug as the 7 documented pages | Pitfall 1 | Code pattern match is exact (bare `getLocale()` + `force-static` + `getPageContent`) and the documented bug's root-cause explanation applies mechanically to any page matching that pattern, but this was not independently live-verified this session (no `next build && next start` was run) — the planner should include a quick live-verification step (or just apply the fix defensively to all 10, which is safe regardless) |
| A6 | Dismissing the first-visit banner without switching locale requires the banner component to write `document.cookie` directly (the one legitimate hand-rolled-cookie case) | Pattern 6 | If next-intl's automatic cookie-write can somehow be triggered without an actual locale-changing navigation (unlikely per the documented mechanism), this recommendation is unnecessarily defensive but not harmful |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Are BreadcrumbList `name` fields in scope for D-09's "localized text fields"?**
   - What we know: D-09 explicitly names Service `name`/`description`. BreadcrumbList `name` values (`'Home'`, `'Routes'`, city names) are hardcoded English in all 31 route pages, structurally identical in kind (user-facing localized text embedded in JSON-LD).
   - What's unclear: whether shipping D-09 with breadcrumbs still hardcoded English counts as "done" for SEO-04's "localized text fields," or whether that's an acceptable, explicitly-scoped-out gap for this phase.
   - Recommendation: surface this to the user/planner explicitly rather than silently including or excluding it — it's a real scope decision with real file-count implications (31 files), not a technical unknown.

2. **Exact async/sync signature of `getPathname()` in `next-intl@4.14.2`.**
   - What we know: the officially documented pattern (Context7) awaits it inside an async `sitemap()`.
   - What's unclear: whether it's actually async in this exact pinned patch version, or whether the `await` in the docs is defensive/forward-compatible.
   - Recommendation: check the installed package's `.d.ts` (or a quick `node -e` type probe) during Wave 0/task-breakdown, not blocking for research.

3. **Does `router.replace(pathname, {locale})` reliably trigger a fresh middleware round-trip (and therefore the automatic `NEXT_LOCALE` cookie write) for every locale switch, including cases where Next.js might serve a cached/prefetched RSC payload?**
   - What we know: documented framework behavior (Pattern 5); the project's middleware matcher already covers essentially all routes.
   - What's unclear: edge cases around Next.js prefetching that weren't tested this session.
   - Recommendation: add an explicit dev-server verification step (check `Set-Cookie` header in browser devtools after a locale switch) as an early task/checkpoint in the plan, before building the rest of the switcher UI on top of an unverified assumption.

## Environment Availability

No new external dependencies (services, CLIs, databases) are introduced by this phase — it is entirely Next.js application code + already-installed `next-intl` + the filesystem content tree already present in the repo (`content/routes/`, `content/pages/`, `content/blog/`, all 7 locales already populated). Existing environment (Node v24.14.1, npm 11.11.0, Next.js `^16.2.3`) [VERIFIED: `node --version`/`npm --version`/`package.json`, checked this session] is already sufficient; no environment audit gaps to report.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via `@vitejs/plugin-react`, jsdom environment) — [VERIFIED: `vitest.config.ts`] |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run tests/sitemap.test.ts tests/jsonld.test.ts tests/route-page-render.test.tsx` |
| Full suite command | `npx vitest run` |

Note: `package.json` has **no `test` script** [VERIFIED: `npm run` scripts listed this session are only `dev`/`build`/`start`/`lint`/`prepare`] and there is no CI test workflow (only `i18n-translate.yml` exists under `.github/workflows/`) — tests are run manually via the `npx vitest` invocation shown above. This is a pre-existing project characteristic, not something to fix in this phase, but the plan should not assume `npm test` works.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEO-01 | `getAlternates()` emits correct cluster for indexable+translated / noindex / EN-fallback cases | unit | `npx vitest run tests/seo.test.ts` (new) | ❌ Wave 0 |
| SEO-02 | Localized `generateMetadata` for the 10 previously-broken pages resolves the correct per-locale content | unit/integration | extend `tests/route-page-render.test.tsx`-style render-parity test, or a lighter `generateMetadata()` direct-call test per fixed page | ❌ Wave 0 (new fixed-page metadata tests) |
| SEO-03 | Sitemap emits full alternates cluster per URL, respecting D-06/D-07 | unit | `npx vitest run tests/sitemap.test.ts` (extend existing file) | ✅ existing file, needs new assertions |
| SEO-04 | JSON-LD carries `inLanguage` + localized text, EN unchanged | unit + snapshot | `npx vitest run tests/jsonld.test.ts tests/route-page-render.test.tsx` (extend existing files) | ✅ existing files, needs new assertions + snapshot regen |
| UX-01 | Switcher navigates via `@/i18n/routing`, preserves path, EN-fallback renders correctly | component/render | new `tests/locale-switcher.test.tsx` | ❌ Wave 0 |
| UX-02 | Banner shows once, never redirects, dismiss persists | component/render | new `tests/first-visit-banner.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted file(s) from the Quick run command above.
- **Per wave merge:** `npx vitest run` (full suite) — the existing `tests/nav-locale-render-parity.test.tsx` and `tests/rtl-backstop.test.ts` (Phase 73) are especially load-bearing since Nav.tsx and route pages are both directly touched by this phase; a regression there would be a real, not hypothetical, risk.
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus a manual `next build && next start` + `curl`/browser check of at least one previously-broken page (e.g. `/ru/about`) to confirm Pitfall 1's fix actually works live — the existing Vitest suite mocks `next-intl/server`'s `getLocale` directly (see `tests/route-page-render.test.tsx`'s doc comment) and would **not** have caught the original force-static bug, since the mock always resolves correctly regardless of the real framework's static-rendering locale-resolution behavior. A build-time/live check is the only test type that actually exercises the real bug.

### Wave 0 Gaps
- [ ] `tests/seo.test.ts` — covers SEO-01 (`getAlternates()` unit tests: indexable+all-translated, noindex, partial-translation EN-fallback-excluded cases)
- [ ] `tests/locale-switcher.test.tsx` — covers UX-01
- [ ] `tests/first-visit-banner.test.tsx` — covers UX-02
- [ ] Framework install: none — Vitest already configured project-wide.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase touches no auth surface |
| V3 Session Management | no | `NEXT_LOCALE` is a preference cookie, not a session/auth cookie |
| V4 Access Control | no | No access-control-relevant surface |
| V5 Input Validation | yes | `locale` values used in `fs.existsSync(path.join(..., locale, ...))` path construction (Pattern 1's `hasLocaleContent`) MUST be validated against `routing.locales` (the existing typed allowlist) before being used in any path — this is already the established pattern in `lib/route-content.ts`/`lib/page-content.ts`/`lib/blog.ts` (all three throw/return-null on an unrecognized locale before touching the filesystem) [VERIFIED: read all three files this session] — any new helper must follow the identical discipline to avoid a path-traversal-adjacent bug class, even though the locale here ultimately originates from a fixed 7-item enum via `useLocale()`/`getLocale()`/URL routing (not raw user input) |
| V6 Cryptography | no | No crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Locale-derived path traversal in content-file lookups | Tampering | Validate `locale` against `routing.locales` (typed `AppLocale` union) before any `path.join`/`fs.existsSync` call — already the pattern in every existing content loader; extend, don't bypass |
| Cookie-based locale spoofing (a user manually sets `NEXT_LOCALE` to an unsupported value) | Tampering | `i18n/request.ts`'s `hasLocale(routing.locales, requested)` guard already falls back to `defaultLocale` for any unrecognized value [VERIFIED: read this session] — no new work needed, but confirms the switcher/banner don't need their own separate validation of the cookie's read-back value; the framework already re-validates on every request |
| First-visit banner as a cloaking vector (different content served to crawlers vs users based on `Accept-Language`) | — (not a STRIDE threat, but explicitly a Google-webmaster-guidelines risk) | D-04/D-05 already mandate zero URL change and identical HTML for crawler and user — Pattern 6's client-only design is the technical enforcement of this: the server never branches on `Accept-Language` at all, so there is no code path capable of cloaking even by accident |

## Sources

### Primary (HIGH confidence)
- Direct repository reads this session (all file paths cited inline throughout, with line numbers where load-bearing): `lib/seo.ts`, `app/sitemap.ts`, `i18n/routing.ts`, `i18n/locales.ts`, `app/[locale]/page.tsx`, `app/[locale]/routes/prague-berlin/page.tsx`, `app/[locale]/routes/prague-vienna/page.tsx` (via grep), `app/[locale]/services/intercity-routes/page.tsx`, `app/[locale]/services/corporate-accounts/page.tsx`, `app/[locale]/services/group-transfers/page.tsx`, `app/[locale]/services/vip-events/page.tsx`, `app/[locale]/data-deletion/page.tsx`, `app/[locale]/login/layout.tsx`, `app/[locale]/book/confirmation/layout.tsx`, `app/[locale]/about/page.tsx`, `app/[locale]/authors/roman-ustyugov/page.tsx`, `app/[locale]/blog/[slug]/page.tsx`, `lib/page-content.ts`, `lib/route-content.ts`, `lib/blog.ts`, `lib/jsonld.ts`, `lib/content-interpolate.ts`, `components/SiteChrome.tsx`, `components/Nav.tsx`, `components/CookieBanner.tsx`, `middleware.ts`, `next.config.ts`, `tests/route-page-render.test.tsx`, `tests/jsonld.test.ts`, `tests/sitemap.test.ts`, `vitest.config.ts`, `package.json`, `messages/en.json`, `.planning/WINDOWS.md` / `.planning/STATE.md` / `.planning/phases/73-*/deferred-items.md` / `73-RTL-QA.md`.
- Context7 `/amannn/next-intl` — topics fetched: locale-switching navigation patterns (`Link`/`useRouter` locale override), `NEXT_LOCALE` localeCookie/localeDetection semantics, `getPathname` sitemap generation pattern.

### Secondary (MEDIUM confidence)
- WebSearch: "hreflang zh-Hans vs zh Simplified Chinese Google guidelines BCP-47" — used for the `zh-Hans` recommendation; not independently cross-checked against the primary Google Search Central documentation page.

### Tertiary (LOW confidence)
- None used as the basis for any recommendation in this document — every claim is either a direct repository read, a Context7-sourced official doc excerpt, or explicitly tagged `[ASSUMED]`/flagged in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, purely extending already-verified, already-installed tooling.
- Architecture (`getAlternates` design, JSON-LD extension, switcher/banner design): HIGH for the "what exists today" findings (all read directly), MEDIUM for the "how to extend it" recommendations (design sketches, not yet implemented/tested — flagged per-item in the Assumptions Log).
- Pitfalls: HIGH — the two most consequential pitfalls (Pitfall 1's EN-leak bug, Pitfall 2's nonexistent switcher) are both independently reproduced/grep-confirmed this session, not inferred from CONTEXT.md's claims alone.

**Research date:** 2026-09-21
**Valid until:** 30 days (stable codebase, no fast-moving external dependency; re-verify sooner if `next-intl` is upgraded past `4.14.2` before this phase executes)
