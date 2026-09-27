# Phase 74: SEO — hreflang, Localized Metadata, Sitemap, Structured Data, Switcher - Pattern Map

**Mapped:** 2026-09-21
**Files analyzed:** 8 primary create/modify targets (+ the ~57-call-site sweep they gate)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/seo.ts` (EXTEND `getAlternates`) | utility (server-only) | transform (path → alternates cluster) | `lib/blog.ts` (`resolveLocalizedMdx`/`blogCanonical`) + self (current stub) | exact (same D-07 problem already solved) |
| `app/sitemap.ts` (EXTEND `entry()`) | route (metadata route) | batch / transform | self (current `entry()`) + `getAlternates()` | exact |
| `lib/jsonld.ts` (EXTEND builders) | utility (server-only) | transform | self (`buildRouteJsonLd`/`businessNode`) | exact |
| `app/[locale]/**/page.tsx` + `*/layout.tsx` (~56 `generateMetadata`) | route metadata | request-response (SSG/ISR) | `app/[locale]/routes/prague-vienna/page.tsx` | exact |
| 10 force-static pages (`getLocale()` EN-leak fix) | route metadata | request-response (force-static) | `app/[locale]/routes/prague-vienna/page.tsx` (correct `await params` shape) | role-match (bug fix) |
| `components/LocaleSwitcher.tsx` (NEW) | component (client) | event-driven (onSelect → navigate) | `components/Nav.tsx` account-menu dropdown | exact (same dropdown/RTL pattern) |
| `components/FirstVisitBanner.tsx` (NEW) | component (client) | event-driven (useEffect suggest/dismiss) | `components/CookieBanner.tsx` | exact (client dismiss-once banner) |
| `i18n/locales.ts` (EXTEND label + BCP-47 maps) | config | — (static data) | self (`locales`/`rtlLocales`) | exact |
| `components/SiteChrome.tsx` (mount banner) | provider (layout) | — | self (`<CookieBanner />` mount, line 179) | exact |

## Pattern Assignments

### `lib/seo.ts` — `getAlternates(path, opts)` (utility, transform)

**Analog:** `lib/blog.ts` (the D-07 content-aware pattern) + the current stub in `lib/seo.ts`.

**Current stub to replace** (`lib/seo.ts:32-43`) — emits only `{ en, x-default }`, and per RESEARCH Pitfall 4 has ZERO current callers (all 57 sites hand-roll):
```typescript
export function getAlternates(canonicalPath: string): AlternatesConfig {
  const normPath = canonicalPath === '/' ? '' : canonicalPath
  const fullUrl = normPath === '' ? BASE : `${BASE}${normPath}`
  return {
    canonical: normPath === '' ? BASE : normPath,
    languages: { en: fullUrl, 'x-default': fullUrl },
  }
}
```

**Content-awareness pattern to copy** — `lib/blog.ts:145-176` (`resolveLocalizedMdx` / `blogCanonical`). This is the exact D-06/D-07 logic to generalize (validate locale BEFORE `path.join`, `fs.existsSync` probe per locale, EN-fallback → EN canonical):
```typescript
export function resolveLocalizedMdx(slug, locale) {
  if (!SLUG_PATTERN.test(slug)) return null;
  if (!(routing.locales as readonly string[]).includes(locale)) return null; // V5 guard
  const localizedFile = path.join(BLOG_ROOT, locale, `${slug}.mdx`);
  if (fs.existsSync(localizedFile)) return { dir: locale, isFallback: false };
  const enFile = path.join(BLOG_ROOT, "en", `${slug}.mdx`);
  if (fs.existsSync(enFile)) return { dir: "en", isFallback: true };
  return null;
}
export function blogCanonical(slug, isFallback) {
  return isFallback ? `https://rideprestigo.com/blog/${slug}` : `/blog/${slug}`;
}
```

**Locale-aware URL construction** — MUST use `getPathname` from `@/i18n/routing` (exported at `i18n/routing.ts:42`), never `${locale}${path}` concatenation (forbidden by the doc comment at `i18n/routing.ts:38-42`). See RESEARCH Pattern 1 design sketch.

**Security (V5):** validate `locale` against `routing.locales` before any `path.join`/`fs.existsSync` — mirror `lib/blog.ts:150`.

---

### `app/sitemap.ts` — `entry()` (route, batch/transform)

**Analog:** self, `app/sitemap.ts:21-28`.

**Current hand-rolled cluster to replace:**
```typescript
const entry = (urlPath: string, sourceFile: string): SitemapEntry => {
  const url = urlPath === '' ? BASE : `${BASE}${urlPath}`
  return {
    url,
    lastModified: lastModFor(sourceFile),
    alternates: { languages: { en: url, 'x-default': url } },
  }
}
```
Replace the `languages` literal with `getAlternates(urlPath, opts).languages` — single source of truth shared with page `generateMetadata`.

**Caution (from RESEARCH Code Examples):** if `getPathname` is async, `sitemap()` (currently `export default function sitemap()` at line 30) becomes `async`. Existing `tests/sitemap.test.ts` calls `sitemap()` synchronously — it needs an `await` added or every assertion silently fails against a Promise.

---

### `lib/jsonld.ts` — `buildRouteJsonLd` + `businessNode` (utility, transform)

**Analog:** self, `lib/jsonld.ts:62-115`.

**EN template that must stay byte-for-byte** (`lib/jsonld.ts:72-73`) — do NOT switch its source to the content model unconditionally (it differs from `content/routes/en/*.json` `metadata.title`, RESEARCH Pitfall 7):
```typescript
name: `Private Chauffeur Transfer from ${route.fromLabel} to ${route.toLabel}`,
description: `Private chauffeured transfer from ${route.fromLabel} to ${route.toLabel}. Fixed price from €${route.eClassEur}. ${route.distanceKm} km door-to-door in a Mercedes E, S, or V-Class.`,
```
**Extension:** add optional `opts?: { locale, name, description }`; branch to content-sourced text only when `locale !== 'en'`; add `inLanguage: opts?.locale ?? 'en'` (BCP-47, `zh`→`zh-Hans`). `priceValidUntil = futureIsoDate(365)` (`lib/jsonld.ts:17-21,63`) drift-normalization contract stays intact for the byte-parity snapshot. Callers pass `interpolate(...)` (NOT `interpolateBidi` — JSON-LD is stringified, never a ReactNode).

**Caller shape already present** — `app/[locale]/routes/prague-vienna/page.tsx:74-77` spreads `buildRouteJsonLd(route, slug)['@graph']` and already has locale-aware `content.metadata.title/description` in scope to pass as `opts`.

---

### `app/[locale]/**/page.tsx` — localized `generateMetadata` (route, request-response)

**Analog:** `app/[locale]/routes/prague-vienna/page.tsx:17-41` — the correct content-sourced, locale-aware shape:
```typescript
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getRouteContent('prague-vienna', locale)
  // ...
  return {
    title: interpolate(content.metadata.title, prices),
    description: desc,
    alternates: {                                  // ← replace this hand-rolled block with getAlternates()
      canonical: '/routes/prague-vienna',
      languages: {
        en: 'https://rideprestigo.com/routes/prague-vienna',
        'x-default': 'https://rideprestigo.com/routes/prague-vienna',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/routes/prague-vienna',
      title: interpolate(content.metadata.ogTitle, prices),
      description: interpolate(content.metadata.ogDescription, prices),
      images: [{ url: "https://rideprestigo.com/vienna.png", width: 1200, height: 630 }],
    },
  }
}
```
This is `revalidate = 120` (ISR) so bare `getLocale()` resolves correctly here — the template to copy for all ~56 sites. For D-08, keep a single shared `/og-image.jpg`; localize only `title`/`description`/`alt`.

---

### 10 force-static pages — `getLocale()` EN-leak fix (route, force-static)

**Affected (RESEARCH Pitfall 1):** `about`, `terms`, `corporate`, `privacy`, `faq`, `blog` (listing), `contact`, `services/corporate-accounts`, `services/group-transfers`, `services/vip-events`.

**Bug pattern:** bare `getLocale()` + `export const dynamic = 'force-static'` + `getPageContent` → resolves to default `en` at static-gen time, silently serving EN on every non-EN locale (defeats SEO-02).

**Fix:** forward `{ locale } = await params` explicitly into both `generateMetadata({ params })` and the page body, instead of bare `getLocale()`. The correct `params`-forwarding shape is standard next-intl; the prague-vienna analog shows the content-sourcing to preserve. This is a first-class task, not optional.

---

### `components/LocaleSwitcher.tsx` (NEW client component)

**Analog:** `components/Nav.tsx` account-menu dropdown (`Nav.tsx:165-334`) — copy its dropdown mechanics wholesale:
- `'use client'`, `useLocale()` from `next-intl`, `usePathname`/`useRouter` from `@/i18n/routing` (`Nav.tsx:4-5`)
- Outside-click close (`Nav.tsx:76-85`), Escape close (`Nav.tsx:88-97`), arrow-key menu nav (`Nav.tsx:100-119`)
- RTL-safe positioning: `position:absolute; insetInlineEnd:0` (`Nav.tsx:224-225`), chevron rotate pattern (`Nav.tsx:197-214`)
- `role="menu"` / `role="menuitem"` / `aria-haspopup` / `aria-expanded` (`Nav.tsx:169-221`)

**Switch behavior (D-03):** `router.replace(pathname, { locale })` — `pathname` from `usePathname()` is already locale-stripped. Never jump to home. Let next-intl set `NEXT_LOCALE` automatically on navigation (RESEARCH Pattern 5) — do NOT hand-write the cookie for the switch case.

**Insert point:** the desktop `flex items-center gap-3` wrapper (`Nav.tsx:153`) near the Book button, and the mobile menu block (`Nav.tsx:380-420`).

**Labels:** endonym map lives in `i18n/locales.ts` (structural, not `messages/*.json`): `en:'English', ru:'Русский', es:'Español', fr:'Français', ar:'العربية', hi:'हिन्दी', zh:'中文'`.

---

### `components/FirstVisitBanner.tsx` (NEW client component)

**Analog:** `components/CookieBanner.tsx` — mirror its structure exactly:
- `'use client'`, renders `null` until a `useEffect` decides to show (`CookieBanner.tsx:1-3,72-74,131`)
- Dismiss-once via a stored flag read client-side (`CookieBanner.tsx:38-60` uses `localStorage`; here use the `NEXT_LOCALE` cookie via `document.cookie` per D-04)
- RTL-aware classes (`start-*`, `rtl:` variants — `CookieBanner.tsx:387-389`)

**Hard constraint (RESEARCH Pitfall 3):** read `navigator.language` client-side in `useEffect` ONLY. Never `headers()`/`cookies()` server-side — `SiteChrome.tsx:121-123` has the load-bearing comment forbidding dynamic APIs in the root layout (breaks force-static site-wide). Never `router.push`/redirect (D-05). The dismiss-only case is the one legitimate hand-written `document.cookie` write.

**Mount point:** `components/SiteChrome.tsx:179`, immediately after `<CookieBanner />`.

---

### `i18n/locales.ts` (config)

**Analog:** self (`i18n/locales.ts:16-19`). Add an endonym label map and a BCP-47 tag map (`zh`→`zh-Hans`) as `as const` exports. Constraint: this file must NOT import `next-intl`/`next/*`/React (comment at `i18n/locales.ts:11-13`) — plain data only, so the translation-pipeline node scripts can still import it.

## Shared Patterns

### Locale-aware URL construction
**Source:** `i18n/routing.ts:42` (`getPathname`) + anti-pattern doc at `i18n/routing.ts:38-42`.
**Apply to:** `lib/seo.ts` `getAlternates`, `app/sitemap.ts`, `LocaleSwitcher`. Never `${locale}${path}`.

### Locale path-traversal guard (V5)
**Source:** `lib/blog.ts:149-150` (`routing.locales.includes(locale)` before `path.join`).
**Apply to:** the new `hasLocaleContent` probe in `lib/seo.ts`.

### Client dismiss-once banner
**Source:** `components/CookieBanner.tsx:38-74,131`.
**Apply to:** `FirstVisitBanner`.

### RTL-safe dropdown
**Source:** `components/Nav.tsx:165-334` (`insetInlineEnd`, `start-*`, `rtl:` utilities).
**Apply to:** `LocaleSwitcher`.

### JSON-LD date-drift normalization
**Source:** `lib/jsonld.ts:17-21` (`futureIsoDate(365)`).
**Apply to:** any `priceValidUntil` in extended builders; required by byte-parity snapshot tests.

## No Analog Found

None — every target has a working in-repo precedent. Note: the switcher and first-visit banner are NEW files, but structurally identical analogs exist (`Nav.tsx` dropdown, `CookieBanner.tsx`).

## Corrections Carried From RESEARCH (planner must heed)

- **No `A ▾` control exists** (Pitfall 2). LocaleSwitcher is net-new in `Nav.tsx`, not a replacement.
- **The "20 noindex prague-to-{city}" set does not exist** (Pitfall 6) — 301-redirected in `next.config.ts`. Real noindex pages for D-06: `/data-deletion`, `/services/corporate-accounts`, `/login`, `/book/confirmation`.
- **`getAlternates()` is currently dead code** (Pitfall 4) — this is a 57-file from-scratch centralization sweep.
- **D-06 already has live violations** (Pitfall 5): `data-deletion` and `services/corporate-accounts` emit an alternates cluster alongside `robots:{index:false}`.

## Metadata

**Analog search scope:** `lib/`, `app/[locale]/**`, `app/sitemap.ts`, `components/`, `i18n/`
**Files read this session:** `lib/seo.ts`, `app/sitemap.ts`, `i18n/routing.ts`, `i18n/locales.ts`, `lib/blog.ts`, `lib/jsonld.ts`, `components/CookieBanner.tsx`, `components/Nav.tsx`, `app/[locale]/routes/prague-vienna/page.tsx`, `components/SiteChrome.tsx` (grep)
**Pattern extraction date:** 2026-09-21
