# Phase 71: Content Externalization — Marketing & SEO Pages - Pattern Map

**Mapped:** 2026-09-06
**Files analyzed:** ~50 (2 new loaders, 1 helper, 30 route `page.tsx`, 15 page-content JSONs+pages, `lib/blog.ts` mod, blog `[slug]` route mod, `messages/en.json` addition, ~5-6 new test files)
**Analogs found:** 50 / 50 (all covered by 3 in-repo analogs; no no-analog files)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/route-content.ts` (NEW) — `getRouteContent(slug, locale)` | utility/loader | file-I/O + fallback read | `lib/blog.ts` (`getMDXPosts`/`CONTENT_DIR` fs+parse pattern) | exact (same idiom, JSON vs MDX+frontmatter) |
| `lib/page-content.ts` (NEW) — `getPageContent(page, locale)` | utility/loader | file-I/O + fallback read | `lib/blog.ts` (fs+parse) + `lib/route-content.ts` (fallback-by-locale shape, once written) | exact |
| `lib/content-interpolate.ts` (NEW) — `interpolate(template, values)` | utility/transform | transform | no direct in-repo string-template helper exists; modeled on the inline template-literal interpolation already used at every route-page call site (`` `€${ePrice}` ``, `prague-vienna/page.tsx` faqs array) | role-match (pattern extracted from call sites, not a copied file) |
| `content/routes/en/<slug>.json` ×30 (NEW data files) | config/content data | file-I/O (static JSON read at request time) | none — new data-file kind; shape derived directly from each route's local literal consts (see Pattern 2) | no analog (new artifact, shape is 1:1 with existing literals) |
| `content/pages/en/<page>.json` ×~15 (NEW data files) | config/content data | file-I/O | same as above — shape derived per-page from that page's own consts | no analog (new artifact) |
| `app/[locale]/routes/<slug>/page.tsx` ×30 (MODIFIED) | route (Server Component) | request-response (SSR page) | `app/[locale]/routes/prague-vienna/page.tsx` itself is the template all 30 already share; use it + `prague-kutna-hora/page.tsx` as the two verified-read cross-check analogs | exact (self-referential — all 30 share one skeleton) |
| `app/[locale]/services/<slug>/page.tsx` ×8 + hub (MODIFIED) | route (Server Component) | request-response (SSR page) | `app/[locale]/services/airport-transfer/page.tsx` (368 lines, richest section set) | role-match (bespoke per page, no shared skeleton — Pitfall 4) |
| `app/[locale]/about/page.tsx`, `faq/page.tsx`, `contact/page.tsx`, `corporate/page.tsx` (MODIFIED) | route (Server Component) | request-response | same file, each is its own analog for its own literal→JSON split; `about/page.tsx`/`faq/page.tsx` read this session as structural references | role-match (bespoke, one task per page) |
| `app/[locale]/privacy/page.tsx`, `terms/page.tsx`, `data-deletion/page.tsx` (MODIFIED) | route (Server Component) | request-response (long clause prose) | same files (bespoke long-form legal text) | role-match |
| `lib/blog.ts` (MODIFIED — `CONTENT_DIR` → locale-aware `contentDirFor(locale)`) | utility/loader | file-I/O + fallback | itself (extend, do not replace, per RESEARCH Code Examples) | exact |
| `app/[locale]/blog/[slug]/page.tsx` (MODIFIED — per-locale MDX resolve + canonical→EN fallback) | route (Server Component) | request-response + file-I/O | itself; slug allowlist regex is the reusable security pattern | exact |
| `app/[locale]/blog/page.tsx` (MODIFIED — locale-aware listing) | route (Server Component) | request-response | itself + `getAllPosts()` from `lib/blog.ts` | exact |
| `messages/en.json` (MODIFIED — new `RoutePage` / per-page-family chrome namespaces) | config | n/a | Phase 69/70 `Nav`/`Testimonials`/`Account` namespace convention, `.planning/phases/70-.../70-PATTERNS.md` | exact |
| `tests/route-content.test.ts`, `tests/page-content.test.ts`, `tests/blog-locale-fallback.test.ts` (NEW) | test | n/a | `tests/blog.test.ts` (existing blog aggregator test) | exact |
| golden-HTML byte-parity capture script (NEW, Wave 0 infra) | test/tooling | batch (before/after diff) | none in-repo — new harness; nearest analog is `tests/route-prices-match.test.ts` for "compare two data sources" idiom, but rendering capture itself has no precedent | no analog (new infra, flagged in RESEARCH Wave 0 Gaps) |

## Pattern Assignments

### `lib/route-content.ts` (utility/loader, file-I/O)

**Analog:** `lib/blog.ts` (full file, 121 lines)

**Imports pattern** (lines 9-12):
```typescript
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { AuthorSlug } from "@/lib/authors";
```
For `route-content.ts`, drop `gray-matter` (JSON, not frontmatter-MDX) but keep the `node:fs`/`node:path` pair and the doc-comment discipline from `lib/blog.ts` lines 1-7:
```typescript
/**
 * Blog post aggregator. Merges MDX articles (read at build time via
 * gray-matter from content/blog/) with the JSX_POSTS registry ...
 * Build-time only — uses node:fs. Never import in a client component.
 */
```
Carry the same "Build-time only — uses node:fs. Never import in a client component." warning verbatim into `route-content.ts` and `page-content.ts`.

**Core file-read + required-field-style validation pattern** (lines 26-59):
```typescript
const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

function getMDXPosts(): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf-8");
      const { data } = matter(raw);
      const required = ["title", "description", "date", "coverImage", "category", "author"];
      for (const key of required) {
        if (!data[key]) {
          throw new Error(`MDX file "${filename}" is missing required frontmatter field: "${key}"`);
        }
      }
      // ... build typed object
    });
}
```
**Apply to `getRouteContent(slug, locale)`:** same shape — `CONTENT_ROOT = path.join(process.cwd(), 'content', 'routes')`, build `localized`/`fallback` paths, `fs.existsSync` gate, `fs.readFileSync` + `JSON.parse`, throw a descriptive `Error` (matching `lib/blog.ts`'s throw-on-missing-required-field style) when neither path resolves — see RESEARCH.md Pattern 1 for the exact target signature (already fully drafted there, use it verbatim):
```typescript
const CONTENT_ROOT = path.join(process.cwd(), 'content', 'routes')

export function getRouteContent(slug: string, locale: string): RouteContent {
  const localized = path.join(CONTENT_ROOT, locale, `${slug}.json`)
  const fallback = path.join(CONTENT_ROOT, 'en', `${slug}.json`)
  const file = fs.existsSync(localized) ? localized : fallback
  if (!fs.existsSync(file)) {
    throw new Error(`No content found for route "${slug}" (locale="${locale}", tried ${localized} and ${fallback})`)
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as RouteContent
}
```

**Security pattern to reuse (slug/locale allowlist):** `app/[locale]/blog/[slug]/page.tsx` line ~71-73:
```typescript
if (!/^[a-z0-9-]+$/.test(slug)) {
  notFound()
}
```
Apply the identical regex guard inside `getRouteContent`/`getPageContent` before building any `path.join`, and additionally validate `locale` against `routing.locales` (from `i18n/routing.ts`) rather than trusting an arbitrary string.

---

### `lib/page-content.ts` (utility/loader, file-I/O)

**Analog:** same as above (`lib/blog.ts`) + the just-defined `lib/route-content.ts` for the locale-fallback resolution shape (write `route-content.ts` first, then mirror its `localized`/`fallback`/`fs.existsSync` block for `getPageContent(page, locale): unknown`). Per RESEARCH.md Pitfall 4, do NOT give this one universal TS interface — return `unknown` or a light per-page-family type, validated at each call site.

---

### `lib/content-interpolate.ts` (utility/transform)

**Source pattern (call-site precedent, not a copied file):** every route page currently does inline template-literal interpolation, e.g. `prague-vienna/page.tsx`:
```typescript
{ q: 'How much does a chauffeur from Prague to Vienna cost?', a: `A fixed fare from €${ePrice} in a Mercedes E-Class for up to 3 passengers, €${vPrice} in the V-Class for up to 6, or €${sPrice} in the S-Class. ...` }
```
**New helper replicates this via token substitution on loaded JSON strings** (RESEARCH.md Pattern 3, use verbatim):
```typescript
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`))
}
```
Content JSON stores `"a": "A fixed fare from €{ePrice} in a Mercedes E-Class..."` — apply `interpolate(f.a, prices)` at the same call site where the template literal used to live.

---

### `app/[locale]/routes/<slug>/page.tsx` ×30 (route, request-response) — minimal in-place replacement

**Analog:** the file itself / `prague-vienna/page.tsx` (391 lines, read in full) is the canonical shape all 30 share; `prague-kutna-hora/page.tsx` (479 lines) verified as structural cross-check.

**Imports pattern to add** (new, alongside existing imports at top):
```typescript
import { getLocale } from 'next-intl/server'
import { getRouteContent } from '@/lib/route-content'
import { interpolate } from '@/lib/content-interpolate'
```

**Current literal-const pattern being replaced** (verbatim excerpt, `prague-vienna/page.tsx` lines ~37-90 + ~80-115):
```typescript
const relatedRoutes = [
  { slug: 'prague-bratislava', city: 'Bratislava', distance: '330 km', duration: '3h 30min' },
  // ...
]

export default async function PragueViennaPage() {
  const route = await getRoutePrice('prague-vienna')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const sPrice = route?.sClassEur ?? ROUTE_FALLBACK.sClassEur
  const vPrice = route?.vClassEur ?? ROUTE_FALLBACK.vClassEur

  const faqs = [
    { q: 'How long does a private transfer...', a: 'Approximately 3 hours 30 minutes...' },
    // ...
  ]
  const highlights = [ /* ... */ ]
  const vehicles = [ /* ... */ ]
  const pageSchema = { /* built from faqs above via faqs.map(...) */ }
```

**Target pattern** (RESEARCH.md Pattern 2, apply verbatim to all 30):
```typescript
export default async function PragueViennaPage() {
  const locale = await getLocale()
  const content = getRouteContent('prague-vienna', locale)
  const route = await getRoutePrice('prague-vienna')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const sPrice = route?.sClassEur ?? ROUTE_FALLBACK.sClassEur
  const vPrice = route?.vClassEur ?? ROUTE_FALLBACK.vClassEur
  const prices = { ePrice, sPrice, vPrice }

  const inclusions = content.inclusions.map((s) => interpolate(s, prices))
  const faqs = content.faqs.map((f) => ({ q: f.q, a: interpolate(f.a, prices) }))
  // dayTripConfigurations, whyBook, hero, highlights text, etc. — same variable
  // names, now sourced from `content` then interpolated; JSX below is untouched.
```
**Critical constraint (D-04):** leave the JSX render tree (lines ~141-391) completely untouched — same variable names (`inclusions`, `faqs`, `dayTripConfigurations`, `whyBook`, `relatedRoutes`), same `.map()` calls. Do NOT introduce a shared `<RoutePageBody>` component.

**JSON-LD pattern (unchanged wiring, now content-sourced)** — `prague-vienna/page.tsx` lines ~112-133:
```typescript
const pageSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    ...(route ? buildRouteJsonLd(route, 'prague-vienna')['@graph'] : []),
    {
      '@type': 'FAQPage',
      '@id': 'https://rideprestigo.com/routes/prague-vienna#faq',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    // BreadcrumbList unchanged, locale-invariant
  ],
}
```
Keep this exact shape — only `faqs` (and any other content-derived array feeding `@graph`) now originates from `content.faqs.map(interpolate...)` instead of a local literal. Never duplicate FAQ text into a second literal "for JSON-LD."

**`generateMetadata()` — title/description/OG move into `content.metadata`, `alternates` block untouched:**
```typescript
export async function generateMetadata(): Promise<Metadata> {
  const route = await getRoutePrice('prague-vienna')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const desc = `Private Prague to Vienna chauffeur transfer — 330 km door-to-door...`
  return {
    title: `Prague to Vienna Chauffeur — From €${ePrice}`,
    description: desc,
    alternates: {
      canonical: '/routes/prague-vienna',
      languages: { en: 'https://rideprestigo.com/routes/prague-vienna', 'x-default': '...' },
    },
    openGraph: { /* ... */ },
  }
}
```
Move the title/description/OG **template strings** (with `{ePrice}`-style tokens) into `content/routes/en/<slug>.json`'s `metadata` key and `interpolate()` them here; leave the `alternates` block's hardcoded canonical/x-default values exactly as-is (RESEARCH Pitfall 6 — out of scope to switch to `lib/seo.ts::getAlternates()` this phase). Do NOT read `lib/routes.ts`'s `metadataTitle` field — it is orphaned/diverged (RESEARCH Pitfall 2).

**Non-uniformity guard (RESEARCH Pitfall 1):** before promoting any string to the shared `RoutePage` messages namespace, verify `grep -l "<string>" app/[locale]/routes/*/page.tsx | wc -l` equals 30. Confirmed exceptions: `prague-hradec-kralove` FAQ heading differs from `"Frequently asked questions"`; `prague-berlin` uses `"Trip Configurations"` instead of `"Day Trips from Prague"`; only 16/30 have a day-trips section at all, 14/30 use `"What's Included"`. Anything short of 30/30 stays in that route's own content JSON, not `messages/en.json`.

---

### `app/[locale]/services/<slug>/page.tsx` ×8 + hub, and about/faq/contact/corporate/legal (route, request-response, bespoke)

**Analog:** `app/[locale]/services/airport-transfer/page.tsx` (368 lines) as the richest reference shape; `about/page.tsx` (394 lines), `faq/page.tsx` (233 lines) as structurally distinct bespoke references.

**Pattern:** same `getLocale()` + loader-read + interpolate + untouched-JSX approach as route pages, but:
- No shared `PageContent` TS interface — one narrow type (or `unknown` + light zod schema) per page family, per RESEARCH Pitfall 4.
- `content/pages/en/<page>.json` naming: **nest to mirror the URL structure** — `content/pages/en/services/airport-transfer.json` rather than a flattened `services-airport-transfer.json` (RESEARCH Open Question 3 recommendation), matching `content/routes/en/<slug>.json`'s flat-because-no-nesting precedent proportionally.
- Plan/wave this as one task per page, not one shared abstraction (RESEARCH: "each page is closer to its own task").

---

### `lib/blog.ts` (MODIFIED — locale-aware `CONTENT_DIR`)

**Analog:** itself (extend in place, do not replace)

**Current single-constant pattern** (line 26):
```typescript
const CONTENT_DIR = path.join(process.cwd(), "content", "blog");
```

**Target pattern** (RESEARCH.md Code Examples, apply verbatim):
```typescript
const BLOG_ROOT = path.join(process.cwd(), "content", "blog");

function contentDirFor(locale: string): string {
  const localized = path.join(BLOG_ROOT, locale);
  const fallback = path.join(BLOG_ROOT, "en");
  return fs.existsSync(localized) ? localized : fallback;
}
// getMDXPosts(locale) reads from contentDirFor(locale) instead of the old
// single CONTENT_DIR constant. JSX_POSTS (3 legacy articles, lines 71-107)
// is unaffected — D-08 keeps them EN-only, merged in unconditionally.
```
`git mv content/blog/*.mdx content/blog/en/` as the first mechanical step (D-07); `JSX_POSTS` registry (lines 71-107) stays untouched verbatim.

---

### `app/[locale]/blog/[slug]/page.tsx` (MODIFIED — per-locale resolve + canonical→EN fallback)

**Analog:** itself, full file already read this session.

**Existing slug-allowlist + `generateMetadata` + `notFound()` pattern** (lines 1-90, verbatim structure to extend, not replace):
```typescript
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams(): Array<{ slug: string }> {
  const contentDir = path.join(process.cwd(), 'content', 'blog')
  if (!fs.existsSync(contentDir)) return []
  return fs.readdirSync(contentDir).filter((f) => f.endsWith('.mdx')).map((f) => ({ slug: f.replace(/\.mdx$/, '') }))
}

function findMdxPost(slug: string): BlogPost | undefined {
  return getAllPosts().find((p) => p.slug === slug && p.source === 'mdx')
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = findMdxPost(slug)
  if (!post) return { title: 'Not Found — Prestigo' }
  const canonical = `/blog/${slug}`
  const absolute = `https://rideprestigo.com${canonical}`
  return {
    title: { absolute: `${post.title} — Prestigo` },
    description: post.description,
    alternates: { canonical, languages: { en: absolute, 'x-default': absolute } },
    openGraph: { /* ... */ },
  }
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]+$/.test(slug)) {
    notFound()
  }
  const post = findMdxPost(slug)
  if (!post) { notFound() }
  const mod = await import(`../../../../content/blog/${slug}.mdx`)
  // ...
}
```
**Extend for locale-fallback (D-07's new logic — the one genuinely new piece of logic this phase adds):**
1. Resolve `contentDirFor(locale)` (from the modified `lib/blog.ts`) inside `findMdxPost`/the dynamic import path instead of the fixed `content/blog/`.
2. If `content/blog/{locale}/{slug}.mdx` doesn't exist, fall back to `content/blog/en/{slug}.mdx`.
3. In that fallback branch specifically, set `alternates.canonical` to the **English absolute URL** (`https://rideprestigo.com/blog/{slug}`, no locale prefix) rather than the locale-prefixed one — this operationalizes "canonical → EN." Keep the existing slug regex guard unchanged.
4. `generateStaticParams`/`dynamicParams` strategy: statically generate only locale×slug pairs that have a real localized MDX file (initially EN only); relax `dynamicParams: true` for the fallback case per RESEARCH Open Question 2 recommendation — flag this specific change for verification.

---

## Shared Patterns

### Locale resolution inside Server Components
**Source:** `components/SiteChrome.tsx` line ~106 — `const locale = await getLocale()`, imported from `next-intl/server`.
**Apply to:** every route/service/marketing `page.tsx` touched in this phase. Do NOT add a `params: Promise<{locale: string}>` prop to any of these 45+ page signatures — `getLocale()` requires zero signature changes, matching D-04's "minimal in-place replacement."

### File-I/O content loader with English fallback
**Source:** `lib/blog.ts` (fs + gray-matter idiom), generalized per RESEARCH.md Pattern 1 into `lib/route-content.ts` / `lib/page-content.ts`.
**Apply to:** all content reads for routes, pages, and (via `contentDirFor`) blog. Sync `fs.readFileSync`/`fs.existsSync` throughout — no `fs.promises`, matching the existing convention and avoiding mixed async idioms for small files.

### Chrome-string catalog convention (Phase 69/70, unchanged)
**Source:** `.planning/phases/70-string-externalization-booking-account/70-PATTERNS.md` Pattern A/C — `useTranslations('Namespace')` (Client) / `getTranslations('Namespace')` (Server), `@/i18n/routing` for `Link`.
**Apply to:** any genuinely-shared short label encountered while doing this refactor (e.g. new `RoutePage` namespace in `messages/en.json` for `"Book this Route"`, `"Ask a Question"`, section labels — see RESEARCH Code Examples for the drafted namespace) — but ONLY after the 30/30 grep-verification described above. Never put per-route unique prose into this catalog.

### Slug/key path-traversal allowlist
**Source:** `app/[locale]/blog/[slug]/page.tsx` — `if (!/^[a-z0-9-]+$/.test(slug)) { notFound() }`.
**Apply to:** `getRouteContent`, `getPageContent` before any `path.join` call; additionally validate `locale` against `routing.locales` (`i18n/routing.ts`) rather than trusting an arbitrary string, even though `getLocale()` only returns configured locales today (defense in depth).

### JSON-LD sourced from the same loaded content object
**Source:** `prague-vienna/page.tsx` — `pageSchema.faqs.map(f => ({...}))` built from the same `faqs` array the visible page renders.
**Apply to:** every route/service page — FAQPage/AggregateRating/BreadcrumbList JSON-LD must read `content.faqs`/`content.hero` etc., never a second hardcoded copy. Note the pre-existing inconsistency (`app/[locale]/blog/[slug]/page.tsx` escapes `</script>` via a `safeJsonLd()`-style helper; route/service pages' inline `JSON.stringify(pageSchema)` do not) — out of scope to fix broadly, but any *new* loader-based JSON-LD builder introduced this phase should apply the same escaping.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `content/routes/en/<slug>.json` ×30, `content/pages/en/<page>.json` ×~15 | config/content data | file-I/O | New artifact kind (no prior per-locale JSON content files in repo); shape is derived directly from each page's existing literals, not copied from an analog file |
| Golden-HTML byte-parity capture script/harness | test/tooling | batch diff | No full-page render/diff harness exists in `tests/` today (confirmed via `find tests -iname "*route*" -o -iname "*blog*"` in RESEARCH — only price/JSON-LD/BlogCard unit tests found); must be built new in Wave 0, use React Testing Library `container.innerHTML` capture or a static-export diff per RESEARCH.md Validation Architecture recommendation |

## Metadata

**Analog search scope:** `lib/`, `app/[locale]/routes/`, `app/[locale]/services/`, `app/[locale]/blog/`, `app/[locale]/about|faq|contact|corporate|privacy|terms|data-deletion/`, `components/SiteChrome.tsx`, `messages/en.json`, `.planning/phases/70-.../70-PATTERNS.md`
**Files scanned this session:** `lib/blog.ts` (full), `lib/routes.ts` (head, 80 lines), `app/[locale]/routes/prague-vienna/page.tsx` (full, cross-referenced against RESEARCH's own full read of `prague-kutna-hora`), `app/[locale]/blog/[slug]/page.tsx` (head), `components/SiteChrome.tsx` (getLocale usage), `70-PATTERNS.md` (patterns A-D), plus the exhaustive verified inventory already captured in 71-RESEARCH.md (all file/line citations reused directly rather than re-read)
**Pattern extraction date:** 2026-09-06
