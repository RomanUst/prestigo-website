# Phase 71: Content Externalization — Marketing & SEO Pages - Research

**Researched:** 2026-09-06
**Domain:** Next.js App Router content architecture — locale-aware JSON content model, replacing hardcoded per-page JSX literals, on top of an already-shipped next-intl 4.14.2 routing/message-catalog foundation (Phases 68-70).
**Confidence:** HIGH (all core findings verified by reading the actual source files this session; a few Claude's-Discretion design choices are marked ASSUMED/recommended, not locked).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Route-page content model (CNT-01)**
- **D-01:** The route-page bodies move to per-locale JSON files at `content/routes/<locale>/<slug>.json`, keyed by route slug, with a shared TypeScript type `RouteContent`. A loader resolves by slug + active locale with **English fallback**. — Reversibility: costly.
- **D-02:** Locale-invariant data (prices, distances, duration, tier, metadata title) **stays in `lib/routes.ts`** — not moved into the content model. Only locale-varying prose/structured bodies move.
- **D-03:** File format is **JSON** (not typed `.ts` modules) — machine-readable/diffable for the Phase 72 AI translation pipeline; no executable code in the content layer. A shared TS type validates shape at the loader boundary.
- **D-04:** Each route `page.tsx` keeps its existing JSX markup; only the local literal consts are replaced with `getRouteContent(slug, locale)` reads. **Minimal in-place replacement — no shared `<RoutePageBody>` renderer** — protects byte-for-byte English output and minimizes markup diff. — Reversibility: reversible (per-page local change).

**Catalog vs content boundary (CNT-02)**
- **D-05:** Split rule is **by nature of the text, not word count**: chrome = short reusable UI labels (buttons, nav, form labels, micro-headings) → `messages/en.json`; long-form = prose/marketing paragraphs, structural lists with full sentences, FAQ, hero copy → the content model.
- **D-06:** Long-form bodies of non-route pages (Home sections, 8 service pages, about/faq/contact/corporate, legal) live at `content/pages/<locale>/<page>.json` — parallel pattern to `content/routes/<locale>/`, same EN-fallback loader and mental model. — Reversibility: costly.

**Blog localization & fallback (CNT-03)**
- **D-07:** Blog relocates to `content/blog/<locale>/`. When a localized post does not exist, `/{locale}/blog/<slug>` **renders the English body with `canonical → EN`** (no duplicate-indexation of untranslated content).
- **D-08:** The 3 legacy `JSX_POSTS` (colocated JSX blog pages, not MDX) **stay EN-only as-is** — no migration to MDX.

**Phase decomposition**
- **D-09:** Do not split into 71a/71b. One Phase 71, several PLAN.md files, wave-based parallelization, single verify.

### Claude's Discretion
- JSON-LD / FAQPage / AggregateRating sourcing: the content model must feed JSON-LD while keeping rendered EN structured data byte-for-byte unchanged.
- Exact `RouteContent` / page-content TypeScript schema shape, loader/fallback helper signatures, sitemap/hreflang/canonical wiring (must remain unaffected for EN), per-plan file grouping and wave layout.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Actual translation of RU/ES/FR/AR/HI/ZH content is Phase 72; no non-EN content is authored in Phase 71.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CNT-01 | The route-page bodies (inclusions, day-trip configs, FAQ, hero copy) move to a locale-aware content model | Full per-route literal inventory below (§ Route-Page Literal Inventory) — 30 pages verified on disk, one shared JSX skeleton, `getRouteContent(slug, locale)` loader pattern with `getLocale()` (§ Code Examples) |
| CNT-02 | Home long-form, the 8 service pages, about/faq/contact/corporate, and legal pages are localizable | Per-page-type inventory (§ Non-Route Page Inventory) — service pages are bespoke (not a shared skeleton), `content/pages/<locale>/<page>.json` parallel loader pattern |
| CNT-03 | Blog moves to per-locale content (`content/blog/<locale>/`); listing and `[slug]` render the active locale | `lib/blog.ts` / `app/[locale]/blog/[slug]/page.tsx` read this session — exact `CONTENT_DIR` extension point and fallback logic identified (§ Blog Localization) |
</phase_requirements>

## Summary

Phase 71 is a **pure refactor of static content location**, not new functionality — no new npm packages, no new runtime dependencies, no schema/DB changes. The risk is entirely in **scope size and byte-for-byte discipline**, not in technical difficulty. Two important corrections to the phase framing surfaced during research:

1. **The route count is verified 30, not 32.** `find`/`grep` this session confirm exactly 30 route directories under `app/[locale]/routes/`, exactly 30 entries in the `ROUTES` array in `lib/routes.ts`, and exactly 30 `page.tsx` files. CONTEXT.md's D-01 says "32"; REQUIREMENTS.md/ROADMAP.md say "29-30". Plan against **30** — do not attempt to locate 2 phantom extra routes.

2. **The named literal list in the phase description ("inclusions, dayTripConfigurations, whyBook, faq, hero copy") is a small subset of the actual hardcoded prose.** Reading two full route pages (`prague-vienna`, 391 lines; `prague-kutna-hora`, 479 lines) byte-for-byte shows **11 distinct prose/structured blocks per page**, not 5: hero (label + h1 + intro), opening paragraph (2 paragraphs), "The Route" narrative (heading + 3 paragraphs), inclusions list, journey-timeline stops (city+note pairs), "Good to know" facts (label+value pairs), day-trip intro + `dayTripConfigurations`, "What to expect from your chauffeur" narrative (3 paragraphs), `whyBook`, `faqs`, related-routes intro paragraph, and the final CTA heading — plus `generateMetadata()`'s title/description/OG strings, which are themselves route-specific marketing prose with a price interpolated in, not just data. Success Criterion 1 ("no route-body copy remains hardcoded in a single-locale structure") is unambiguous that **all of this must move**, not only the 5 named consts. Size the `RouteContent` schema and the wave/task count accordingly — see the full inventory table below.

3. **Route pages share one rigid JSX skeleton (safe for a strongly-typed `RouteContent`); the 8 service pages and the about/faq/contact/corporate/legal pages do not** — each is bespoke, with its own section order, its own arrays, and its own FAQ/JSON-LD shape. This means `content/pages/<locale>/<page>.json` cannot be one uniform TS type the way `RouteContent` can — it is closer to "one loosely-typed JSON object per page, whose shape is discovered from that page's own consts," validated at the loader boundary with a light runtime check (or per-page-family types) rather than one global interface. This governs plan/wave sizing: route pages are mechanical and parallelizable; page-family content is bespoke, slower, and each page is closer to its own task.

4. A significant fraction of the "content" living inside each route/service page's local consts is actually **chrome that repeats verbatim across every page of that type** (e.g. `"Book this Route"` and `"Ask a Question"` appear in all 30 route pages; the final-CTA line `"No surprises. No meters. Your driver is waiting."` is byte-identical in all 30; section labels like `"The Route"`, `"Fleet"`, `"The Journey"`, `"Good to know"`, `"Why Prestigo"`, `"Related Routes"` are identical in all 30; `"Choose your vehicle"` is identical in all 30). Per D-05 (split by nature of text, chrome = short reusable label), **these belong in `messages/en.json` under a new namespace (e.g. `RoutePage`), not in the per-slug content JSON** — moving them into 30 duplicated JSON files would triple Phase 72's translation surface for zero benefit and risk 30 independent copies drifting.

**Primary recommendation:** Build one shared `getRouteContent(slug, locale)` loader (fs + JSON.parse + a light runtime shape check, matching the `lib/blog.ts` gray-matter convention already in the repo) returning a fully-typed `RouteContent`; add a parallel `getPageContent(page, locale)` for `content/pages/`; extract the ~12 route-page chrome strings into `messages/en.json` under a `RoutePage` namespace reused across all 30 pages; keep price-bearing sentences as `{ePrice}`-style tokens in the JSON and interpolate them in the page component exactly as today's template literals do; obtain the locale via `getLocale()` from `next-intl/server` (already used in `components/SiteChrome.tsx:106`) rather than adding a `params` prop to 30+ page signatures, keeping the diff minimal per D-04.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route-page prose/FAQ/hero content | Frontend Server (SSR) — Server Component `page.tsx` | Content/Storage — `content/routes/<locale>/<slug>.json` on disk | Content is read at request/build time via `node:fs` inside an `async` Server Component, same tier as the existing `lib/blog.ts` gray-matter reader; never touches the client bundle |
| Non-route page prose (service/about/faq/contact/corporate/legal) | Frontend Server (SSR) | Content/Storage — `content/pages/<locale>/<page>.json` | Same pattern as above, one file per page per locale |
| Blog post bodies | Frontend Server (SSR), MDX compiled at build | Content/Storage — `content/blog/<locale>/*.mdx` | `next.config` MDX pipeline (Phase 54-56) already compiles `.mdx` at build; only the directory locale-nesting changes |
| Locale resolution for content lookups | Frontend Server (SSR) | i18n/routing.ts (`routing.locales`, `defaultLocale`) | `getLocale()` from `next-intl/server` already resolves the active locale inside Server Components without a `params` prop — reuse it, don't reinvent |
| UI-chrome strings surfaced on these pages (buttons, section labels) | Frontend Server/Client (existing next-intl catalog) | `messages/en.json` | Per D-05 — short reusable labels stay in the Phase 69/70 catalog, not content JSON |
| JSON-LD (FAQPage/AggregateRating/Service/BreadcrumbList) | Frontend Server (SSR), built inline in `page.tsx` | `lib/jsonld.ts`, `lib/blog-jsonld.ts` (locale-invariant business/schema data) | JSON-LD must read the **same** loaded content object the visible page renders (FAQ Q&A, hero descriptions) so EN structured data byte-matches EN visible copy — no separate hardcoded copy of FAQ text for JSON-LD |
| Sitemap / canonical / hreflang | Frontend Server (SSR) — `app/sitemap.ts`, per-page `generateMetadata()` | `lib/seo.ts::getAlternates()` (currently unused by route/service pages — see Pitfall 6) | Out of scope to fix in Phase 71 (Phase 74 owns hreflang); Phase 71 must not change canonical URLs, `lastModFor()` source-file paths, or the indexable/noindex split |

## Standard Stack

No new external packages are introduced by this phase. It is a pure refactor using tools already in the dependency tree.

### Core (already installed — versions verified this session via `package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | ^16.2.3 `[VERIFIED: package.json]` | App Router Server Components, async `page.tsx`, `revalidate` | Already the app framework |
| `next-intl` | 4.14.2 `[VERIFIED: package.json]` | `getLocale()` for resolving the active locale inside Server Components (`components/SiteChrome.tsx:106`) | Already the i18n foundation (Phases 68-70) |
| `gray-matter` | ^4.0.3 `[VERIFIED: package.json]` | Blog MDX frontmatter parsing — unchanged, only `CONTENT_DIR` path changes | Already used by `lib/blog.ts` |
| `zod` | ^4.3.6 `[VERIFIED: package.json]` | Optional: runtime shape validation for loaded JSON content at the loader boundary | Already used elsewhere in the codebase (booking validation, Phase 70) — reuse rather than hand-rolling type guards |
| `node:fs` / `node:path` | builtin | Reading `content/routes/<locale>/<slug>.json` and `content/pages/<locale>/<page>.json` at request/build time | Exact same pattern `lib/blog.ts` already uses; comment there explicitly warns "Build-time only — uses node:fs. Never import in a client component" — carry that same discipline into the new loaders |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain `JSON.parse` + hand-written type guard | `zod` schema per content type | zod gives clearer error messages when a locale JSON is malformed (helps the Phase 72 pipeline output validation) at the cost of one more file per content type; recommended for `RouteContent` given it's reused 30×, optional/skippable for bespoke one-off page JSONs |
| `getLocale()` (next-intl/server) | Add `params: Promise<{locale:string}>` to every `page.tsx` | `getLocale()` requires zero signature changes to 30+ files, directly satisfying D-04's "minimal in-place replacement"; `params` would touch every page's exported function signature for no added benefit here |
| Reading content synchronously via `fs.readFileSync` | Reading via `fs.promises.readFile` | Sync read matches the existing `lib/blog.ts` convention exactly (`fs.readdirSync`/`fs.readFileSync`) and avoids mixing async idioms; content files are small (a few KB), so sync I/O cost is negligible at build/request time |

**Installation:** none required — no `npm install` needed for this phase.

## Package Legitimacy Audit

Not applicable — Phase 71 installs no new packages. All tools used (`next`, `next-intl`, `gray-matter`, `zod`, `node:fs`) are already present in `package.json` and were vetted in prior phases (68-70).

## Architecture Patterns

### System Architecture Diagram

```
Request for /{locale?}/routes/prague-vienna
        │
        ▼
app/[locale]/routes/prague-vienna/page.tsx  (Server Component, async)
        │
        ├─▶ getLocale()  ─────────────────────────► resolves active locale
        │      (next-intl/server, no params prop needed)
        │
        ├─▶ getRoutePrice('prague-vienna')  ───────► Supabase route_prices table
        │      (unchanged — locale-invariant € values, D-02)
        │
        ├─▶ getRouteContent('prague-vienna', locale) 
        │      │
        │      ├─▶ try content/routes/{locale}/prague-vienna.json
        │      │        │
        │      │        └─ not found / locale === 'en' ──▶
        │      └─▶ fallback: content/routes/en/prague-vienna.json
        │             (English source-of-truth; Phase 72 fills in ru/es/fr/ar/hi/zh later)
        │
        ├─▶ t = useTranslations/getTranslations('RoutePage')  ─► messages/{locale}.json
        │      (chrome: "Book this Route", "Fleet", "Good to know", etc. — D-05)
        │
        ▼
   interpolate({ePrice, sPrice, vPrice}) into content.faqs[].a / content.heroIntro / ...
        │
        ▼
   Same JSX skeleton as today (D-04 — unchanged markup)
        │
        ├─▶ visible page render (hero, inclusions, journey, FAQ, CTA…)
        └─▶ <script type="application/ld+json"> built from the SAME loaded
             `content.faqs` array (not a second hardcoded copy) → FAQPage
             JSON-LD stays byte-identical to what the page/faq text shows
```

### Recommended Project Structure
```
content/
├── blog/
│   ├── en/            # git-mv target for existing content/blog/*.mdx (D-07)
│   ├── ru/ es/ fr/ ar/ hi/ zh/   # created empty this phase; Phase 72/73 populate
├── routes/
│   └── en/
│       ├── prague-vienna.json
│       ├── prague-kutna-hora.json
│       └── ... (30 files total)
├── pages/
│   └── en/
│       ├── home.json                (long-form/SEO-description strings only — Home's
│       │                              components are already externalized to messages/en.json,
│       │                              Phase 69)
│       ├── services-airport-transfer.json
│       ├── services-city-rides.json
│       ├── services-concierge.json
│       ├── services-corporate-accounts.json
│       ├── services-group-transfers.json
│       ├── services-intercity-routes.json
│       ├── services-vip-events.json
│       ├── services-hub.json        # app/[locale]/services/page.tsx
│       ├── about.json
│       ├── faq.json
│       ├── contact.json
│       ├── corporate.json
│       ├── privacy.json
│       ├── terms.json
│       └── data-deletion.json
lib/
├── route-content.ts     # NEW — getRouteContent(slug, locale): RouteContent
├── page-content.ts      # NEW — getPageContent(page, locale): unknown (per-page shape)
├── content-interpolate.ts  # NEW — tiny {token} substitution helper (see Code Examples)
├── routes.ts             # UNCHANGED — locale-invariant data stays here (D-02)
├── blog.ts               # MODIFIED — CONTENT_DIR becomes locale-aware (D-07)
messages/
└── en.json                # MODIFIED — new `RoutePage` (and similar per-page-family) chrome namespaces
```

### Pattern 1: Content loader with English fallback (D-01/D-06)

**What:** A small server-only module that reads `content/<kind>/<locale>/<key>.json`, falling back to `content/<kind>/en/<key>.json` when the locale file doesn't exist yet (every non-EN locale, until Phase 72/73 populate them).
**When to use:** Every route page and every non-route page consuming long-form content.
**Analog in repo:** `lib/blog.ts`'s `getMDXPosts()` (fs + required-field validation) — same idiom, applied to a `.json` per slug+locale instead of `.mdx` files with frontmatter.

```typescript
// lib/route-content.ts — NEW, server-only (no 'use client')
import fs from 'node:fs'
import path from 'node:path'

export type RouteContent = {
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string }
  openingParagraphs: string[]
  routeNarrative: { headingLine1: string; headingItalic: string; paragraphs: string[] }
  inclusions: string[]
  journeyStops: Array<{ city: string; note: string; anchor: boolean; custom: boolean }>
  goodToKnow: Array<{ label: string; value: string }>
  dayTrip: { intro: string; configurations: Array<{ title: string; body: string; price: string }>; footnote: string }
  chauffeurNarrative: string[]
  whyBook: { headingSuffix: string; items: Array<{ title: string; body: string }> }
  faqs: Array<{ q: string; a: string }>
  relatedRoutesIntro: string
  cta: { headingLine1: string; headingItalic: string }
  metadata: { title: string; description: string; ogTitle: string; ogDescription: string }
}

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

### Pattern 2: Call-site diff inside each `page.tsx` (D-04 minimal in-place replacement)

**What:** Replace the local literal consts; do not touch surrounding JSX.
**Source (verified this session):** `app/[locale]/routes/prague-vienna/page.tsx` lines 37-90.

```typescript
// BEFORE (page.tsx lines 37-90, verbatim excerpt)
const inclusions = [
  'A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.',
  // ...
]
// ...
export default async function PragueViennaPage() {
  const route = await getRoutePrice('prague-vienna')
  // ...
  const faqs = [ { q: '...', a: `... €${ePrice} ...` }, /* ... */ ]

// AFTER
import { getLocale } from 'next-intl/server'
import { getRouteContent } from '@/lib/route-content'
import { interpolate } from '@/lib/content-interpolate'

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
  // dayTripConfigurations, whyBook, hero, etc. — same shape as before, values now
  // sourced from `content` instead of a local literal, then interpolated.
```

The JSX below this point (lines 141-391) is untouched — same variable names (`inclusions`, `faqs`, `dayTripConfigurations`, `whyBook`), same `.map()` calls, same JSON-LD `faqs.map(...)`.

### Pattern 3: Price interpolation without next-intl ICU

**What:** Content JSON is plain JSON, not a next-intl message catalog entry — it never goes through `t()`/ICU. Prices are DB-sourced per-request (`getRoutePrice`) and must stay locale-invariant (D-02), so the JSON stores a `{ePrice}`-style placeholder token and the page performs simple substitution after loading.
**Why this matters:** Baking `€485` directly into `content/routes/en/prague-vienna.json` would go stale the moment the DB price changes (documented DB-driven flow — `lib/route-prices.ts`/Supabase), and would force Phase 72's translation pipeline to "translate" a number, an easy source of transcription bugs across 6 locales.

```typescript
// lib/content-interpolate.ts — NEW
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`))
}
```
Content JSON stores: `"a": "A fixed fare from €{ePrice} in a Mercedes E-Class for up to 3 passengers, €{vPrice} in the V-Class for up to 6, or €{sPrice} in the S-Class..."` — byte-identical to today's template literal once interpolated with the same values.

### Pattern 4: FAQPage/AggregateRating JSON-LD sourced from the same loaded content (Claude's Discretion, resolved)

**What:** Build JSON-LD from the exact same `content.faqs` / `content.hero` values the visible page renders — never a second hardcoded copy.
**Source (verified):** `prague-vienna/page.tsx` lines 116-139 already do this correctly today (`faqs.map(f => ({...}))` inside `pageSchema`) — the only change is that `faqs` now comes from `content.faqs.map(interpolate...)` instead of a local literal. No JSON-LD-specific work is needed beyond keeping this existing wiring pattern; the risk is a plan that accidentally duplicates FAQ text into two places (content JSON + a separate JSON-LD literal) — don't do that.

### Anti-Patterns to Avoid
- **Splitting `getRouteContent` per-section (e.g. `getInclusions(slug, locale)`, `getFaqs(slug, locale)`):** re-reads/re-parses the same JSON file N times per render; one file, one read, one typed object.
- **Baking DB-sourced € prices into the content JSON:** breaks D-02 and creates 30×7-locale stale-price surface once Phase 72 runs. Always interpolate at render time.
- **Introducing a shared `<RoutePageBody>` component "just for the content sections":** explicitly forbidden by D-04 — it changes the render tree and risks non-byte-identical output (different whitespace/element nesting even with same visible text).
- **Copying FAQ text into a separate literal for JSON-LD "for clarity":** creates exactly the drift Success Criterion 4 (structured data byte-identical) is designed to prevent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale resolution inside a Server Component | Custom `params.locale` threading on every page | `getLocale()` from `next-intl/server` | Already proven in this repo (`components/SiteChrome.tsx:106`); zero signature changes, matches D-04 |
| JSON shape validation | Bespoke recursive type-guard functions | `zod` (`^4.3.6`, already a dependency) for `RouteContent` (reused 30×) | Already in the dependency tree; gives Phase 72's re-runnable pipeline clear validation errors on malformed output |
| MDX per-locale post reading | A new blog reader | Extend the existing `lib/blog.ts` `getMDXPosts()`/`CONTENT_DIR` pattern to accept a locale segment | The existing function already does exactly this job for one locale; parametrize, don't replace |

**Key insight:** every piece of infrastructure this phase needs (fs-based content reading, locale resolution in Server Components, JSON-LD building from loaded data, zod validation) already has a working analog somewhere in this codebase from Phases 54-70. This phase is an exercise in **finding and reusing those analogs 30+ times**, not designing new infrastructure.

## Runtime State Inventory

Not applicable — this is not a rename/refactor-of-identifiers phase. No database rows, external service configs, OS-registered state, secrets, or build artifacts reference the strings being moved. Confirmed: content is presently 100% source-code literals (JSX consts), not stored anywhere at runtime (no CMS, no DB-stored copy text — verified via `getRoutePrice`/`route-prices.test.ts`, which only stores numeric price/distance fields, never prose).

## Common Pitfalls

### Pitfall 1: Route pages are NOT 100% structurally uniform
**What goes wrong:** A plan or task that assumes every one of the 30 route pages has identical section labels will silently break 2 pages.
**Why it happens:** Verified via grep this session: `prague-hradec-kralove/page.tsx` is the **only** route page whose FAQ section heading is not `"Frequently asked questions"` (29/30 match; that one differs). `prague-berlin/page.tsx` is the only page using the section label `"Trip Configurations"` instead of `"Day Trips from Prague"` (only 16/30 pages even have a `"Day Trips from Prague"` label at all, and 14/30 use `"What's Included"` for the inclusions section — the remainder must use a different label or omit it, not yet enumerated per-file).
**How to avoid:** Do NOT assume the "chrome" strings promoted to `messages/en.json` are literally identical across all 30 files without grepping each candidate string count first (`grep -l "<string>" app/[locale]/routes/*/page.tsx | wc -l` must equal 30 before treating it as shared chrome). Any string that doesn't hit 30/30 stays as page-specific content in that route's own JSON, not the shared catalog.
**Warning signs:** A `messages/en.json` `RoutePage` namespace value that silently overwrites a route's unique wording — visible as an unintended text change on 1-2 of 30 pages during the byte-for-byte diff check (§ Validation Architecture).

### Pitfall 2: `lib/routes.ts`'s `metadataTitle` field is already unused/orphaned — don't wire it up as part of this phase
**What goes wrong:** A planner sees `lib/routes.ts` has a `metadataTitle` field per route (`[VERIFIED: lib/routes.ts:42, 63]` — `metadataTitle: 'Prague to Kutná Hora Private Transfer — From €115'`) and assumes it's the source `generateMetadata()` should read from.
**Why it happens:** It isn't. `[VERIFIED: app/[locale]/routes/prague-vienna/page.tsx:19]` — `generateMetadata()` builds its own literal title `` `Prague to Vienna Chauffeur — From €${ePrice}` `` which is **textually different** from `lib/routes.ts`'s `metadataTitle: 'Prague to Vienna Private Chauffeur Transfer — From €485'` `[VERIFIED: lib/routes.ts:405]`. The two have diverged and nothing currently reads the `lib/routes.ts` field for the live page.
**How to avoid:** Leave `lib/routes.ts`'s `metadataTitle` field exactly as-is per D-02 ("stays in lib/routes.ts" — it's locale-invariant metadata, D-02 doesn't say it must be consumed). Move each page's **actual** `generateMetadata()` title/description/OG strings into that route's `content/routes/en/<slug>.json` under a `metadata` key (as in Pattern 1 above) so Phase 72 can translate them — do not attempt to reconcile the two diverged strings; that's an unrelated content-quality issue outside this phase's scope.
**Warning signs:** A byte-for-byte diff on `<title>` failing after the refactor because a plan "helpfully" swapped in the `lib/routes.ts` field instead of moving the page's own literal.

### Pitfall 3: Route hub page / `relatedRoutes` arrays duplicate data already in `lib/routes.ts`
**What goes wrong:** Each route page's local `relatedRoutes` array (`{slug, city, distance, duration}`) repeats `city`/`distance`/`duration` values that already exist per-slug in `ROUTES` (`lib/routes.ts`). Moving these verbatim into `content/routes/<locale>/<slug>.json` bakes English-only display strings (`city: 'Vienna'`) into a file meant to be translated, when the only actually-curated (non-derivable) piece of data is **which 4 slugs are related** to this route.
**Why it happens:** The current code is convenient copy-paste, not a deliberate single-source design.
**How to avoid:** Store only the curated `slug[]` array in the content JSON (or even leave it in a small non-translated structural array in `page.tsx`, since slugs aren't prose) and derive `city`/`distance`/`duration` display strings from `ROUTES_BY_SLUG[slug]` at render time — city names may still need per-locale display forms later, but that's a Phase 72/73 concern once `lib/routes.ts` display fields are themselves localized, not a Phase 71 blocker. Flag as an **Open Question** below rather than silently duplicating city names into every content file.
**Warning signs:** `content/routes/en/prague-vienna.json` containing `"relatedRoutes": [{"city": "Bratislava", ...}]` — a sign city/distance/duration got copy-pasted instead of derived.

### Pitfall 4: Service pages and marketing/legal pages are each bespoke — no shared skeleton exists to lean on
**What goes wrong:** Treating `content/pages/<locale>/<page>.json` as if it needs one shared TS interface (like `RouteContent`) leads to a bloated union type nobody can validate meaningfully.
**Why it happens:** Verified this session: `app/[locale]/services/airport-transfer/page.tsx` (368 lines) has a completely different section set (Features, Meet & Greet, How it works, Journey times, Vehicle classes, FAQ, CTA) from `app/[locale]/services/corporate-accounts/page.tsx` (214 lines) or `app/[locale]/about/page.tsx` (394 lines, `principles`/`requirements`/founder bio) or `app/[locale]/faq/page.tsx` (233 lines, `sections` grouped by category). Legal pages (`privacy.tsx` 400 lines, `terms.tsx` 311 lines) are long clause-by-clause prose with their own heading structure.
**How to avoid:** Give each page family its own narrow TS type (or skip static typing and use a light per-page zod schema) rather than one universal `PageContent` union. Plan/wave this as "one task per page" rather than "one shared abstraction covers all 15 non-route pages."
**Warning signs:** A single `PageContent` type with 40+ optional fields — a sign the schema is trying to be everything to everyone instead of one-file-per-page-shape.

### Pitfall 5: `revalidate = 120` (ISR) + synchronous `fs.readFileSync` interaction
**What goes wrong:** None expected, but worth confirming: route pages set `export const revalidate = 120`. Reading a local JSON file with `fs.readFileSync` inside an ISR-revalidated Server Component is exactly what `lib/blog.ts` already does successfully in this same app (blog pages use `dynamic = 'force-static'`, route pages use `revalidate = 120` — both are Node-runtime server-side reads, not Edge).
**Why it happens (non-issue, but verify):** Would only break if a page were later moved to the Edge runtime, where `node:fs` is unavailable.
**How to avoid:** Confirm during planning that no route/service/marketing page sets `export const runtime = 'edge'` (grep first — none found this session). Keep it that way; content loaders must stay Node-runtime.
**Warning signs:** A build error `Module not found: Can't resolve 'fs'` — immediate signal a content loader got imported into an Edge or Client boundary.

### Pitfall 6: Route/service pages hand-roll their own `alternates` (never call `lib/seo.ts::getAlternates()`)
**What goes wrong:** Not a Phase 71 bug per se, but a landmine for Success Criterion 4 ("sitemap, canonical URLs... unaffected"). `[VERIFIED: app/[locale]/routes/prague-vienna/page.tsx:21-27]` — every route/service page builds `alternates: { canonical: '/routes/...', languages: { en: '...', 'x-default': '...' } }` manually inline, rather than calling `getAlternates()` from `lib/seo.ts` (which exists exactly for this purpose, per its own doc comment).
**Why it happens:** Pre-dates `lib/seo.ts`'s introduction; never retrofitted.
**How to avoid:** Phase 71 should **not** refactor this pattern (out of scope — Phase 74 owns hreflang/SEO wiring per REQUIREMENTS.md SEO-01..04). When moving `generateMetadata()`'s title/description into content JSON, leave the `alternates` block exactly as it is today (same hardcoded canonical/`x-default` values) — do not "helpfully" switch it to `getAlternates()` mid-phase, which would be an unrelated behavior change risking Success Criterion 4.
**Warning signs:** A diff touching the `alternates` block of any page during Phase 71 — should not happen; if it does, it's out-of-scope creep.

## Code Examples

### Blog locale-aware `CONTENT_DIR` extension (D-07)

```typescript
// lib/blog.ts — MODIFIED (extends the existing pattern, does not replace it)
// Source: lib/blog.ts:26 (verified this session) — CONTENT_DIR was a single constant;
// becomes a per-locale resolver with English fallback.
import fs from "node:fs";
import path from "node:path";

const BLOG_ROOT = path.join(process.cwd(), "content", "blog");

function contentDirFor(locale: string): string {
  const localized = path.join(BLOG_ROOT, locale);
  const fallback = path.join(BLOG_ROOT, "en");
  return fs.existsSync(localized) ? localized : fallback;
}

// getMDXPosts(locale) reads from contentDirFor(locale) instead of the old
// single CONTENT_DIR constant. JSX_POSTS (3 legacy articles) is unaffected —
// D-08 keeps them EN-only, merged in unconditionally regardless of locale.
```

Per-post fallback (D-07's "renders the English body with canonical → EN" requirement) needs the `[slug]/page.tsx` (currently MDX-only, `dynamicParams = false`) to: (1) check for `content/blog/{locale}/{slug}.mdx`, (2) if absent, load `content/blog/en/{slug}.mdx` instead, and (3) set `alternates.canonical` to the **English** URL (not the locale-prefixed one) in that fallback case specifically — this is the one piece of genuinely new logic in Phase 71 (everything else is directory restructuring). `generateStaticParams()` (`[VERIFIED: app/[locale]/blog/[slug]/page.tsx:19-26]`, currently EN-only, `dynamic = 'force-static'`/`dynamicParams = false`) will need re-examination: with 7 locales × N posts, decide whether to statically generate every locale×slug pair up front (matching existing `force-static` discipline) or relax to `dynamicParams: true` for the fallback case. This is a genuine **Open Question** — flagged below, not resolved by CONTEXT.md.

### Route-page chrome namespace addition to `messages/en.json`

```json
{
  "RoutePage": {
    "heroCtaPrimary": "Book this Route",
    "heroCtaSecondary": "Ask a Question",
    "sectionLabels": {
      "theRoute": "The Route",
      "whatsIncluded": "What's Included",
      "fleet": "Fleet",
      "theJourney": "The Journey",
      "goodToKnow": "Good to know",
      "dayTripsFromPrague": "Day Trips from Prague",
      "theChauffeur": "The Chauffeur",
      "whyPrestigo": "Why Prestigo",
      "relatedRoutes": "Related Routes",
      "faqHeading": "Frequently asked questions"
    },
    "vehicleFields": { "passengers": "Passengers", "luggage": "Luggage", "transferPrice": "Transfer price" },
    "chooseYourVehicle": "Choose your vehicle",
    "availableOnThisRoute": "Available on this route",
    "ctaFootnote": "No surprises. No meters. Your driver is waiting.",
    "bookOnline": "Book Online",
    "bookNow": "Book Now",
    "allRoutes": "All Routes"
  }
}
```
Verify each of these against the Pitfall 1 exceptions (`prague-hradec-kralove`'s FAQ heading, `prague-berlin`'s `"Trip Configurations"` label, and the 14/30 vs. 16/30 label-presence gap) before wiring the catalog lookup — those exceptions either need their own per-route override or a decision to normalize the outlier page's wording (a content decision, flag to the user if normalizing would be a visible copy change).

## State of the Art

Not applicable in the traditional sense (no library/framework version churn to track) — the "state of the art" here is entirely about how this specific codebase evolved:

| Old Approach (Phases 54-68) | Current Approach (Phase 71) | When Changed | Impact |
|--------------------------|------------------------------|---------------|--------|
| Route/service/marketing page prose as local `const` literals in `page.tsx`, English-only | Same JSX, prose read from `content/{routes,pages}/<locale>/<key>.json` via a loader, EN-fallback | Phase 71 (this phase) | Enables Phase 72's AI translation pipeline to translate without touching component code |
| Blog `CONTENT_DIR` = single flat `content/blog/*.mdx` (Phase 54-56) | `content/blog/<locale>/*.mdx`, EN-fallback per-post | Phase 71 | Same mechanism proven for chrome catalogs (Phase 69/70) now extended to long-form content |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommending a `RoutePage` messages/en.json namespace name and exact key structure for chrome strings | Code Examples | Low — cosmetic naming choice, easy to rename before Phase 72 runs; does not affect byte-for-byte EN output either way since it's purely a source-code refactor of already-identical strings |
| A2 | Recommending `zod` for `RouteContent` validation at the loader boundary | Standard Stack, Don't Hand-Roll | Low — optional; a plain TS type-assertion works too, zod just gives better error messages for Phase 72's automated pipeline |
| A3 | Recommending `relatedRoutes` store only curated `slug[]`, deriving city/distance/duration from `ROUTES_BY_SLUG` rather than duplicating those strings per-locale | Pitfall 3 | Medium — if the planner instead duplicates full `{city, distance, duration}` display strings into all 30 content JSONs, it isn't wrong per D-01/D-06 (still "moves body content to the content model"), just creates redundant translation surface in Phase 72; flagged as an Open Question rather than asserted as a locked design, since CONTEXT.md doesn't address it |
| A4 | Recommending the blog `[slug]/page.tsx` fallback set `alternates.canonical` to the EN URL specifically in the fallback branch (not just render EN body under the locale URL) | Code Examples | Medium — this directly operationalizes D-07's explicit requirement ("canonical → EN"), but the precise `generateMetadata()` code path to achieve it (conditional canonical based on whether a localized file exists) is not spelled out in CONTEXT.md and needs its own task/verification |

**If this table is empty:** N/A — see rows above. All core architectural facts (route count, literal inventory, chrome/content split candidates, existing loader patterns, `getLocale()` usage, `metadataTitle` mismatch) are `[VERIFIED]` via direct `Read`/`grep`/`Bash` this session, not assumed.

## Open Questions

1. **Should `relatedRoutes` city/distance/duration be duplicated into each route's content JSON, or derived from `lib/routes.ts` at render time?**
   - What we know: The data is 100% duplicative today (already present per-slug in `ROUTES`); only the *curation* of which 4 slugs are related is unique per route.
   - What's unclear: Whether the planner should treat this as in-scope cleanup (derive from `ROUTES_BY_SLUG`) or out-of-scope (move the literal array as-is into content JSON, preserving current behavior exactly).
   - Recommendation: Derive display fields from `ROUTES_BY_SLUG[slug]`, store only the curated `slug[]` array (either as a small in-code structural array per D-04's "minimal in-place" spirit, or as a `relatedSlugs: string[]` field in the content JSON if it's judged prose-adjacent) — reduces Phase 72 translation surface without changing rendered output, since the underlying data is identical either way.

2. **Blog `generateStaticParams`/`dynamicParams` strategy for 7 locales × N posts, given `dynamicParams = false` today.**
   - What we know: Today's `[slug]/page.tsx` is fully static (`dynamic = 'force-static'`, `dynamicParams = false`), EN-only, generating params only from `content/blog/*.mdx`.
   - What's unclear: Whether to statically pre-generate every `{locale, slug}` pair (7× the build-time MDX compilation work) or relax `dynamicParams` for locale-fallback cases while keeping EN fully static.
   - Recommendation: Statically generate params only for locale×slug combinations that have a localized MDX file (initially: EN only, since Phase 71 does no translation); serve the EN-fallback case for all other locale×slug combinations via `dynamicParams: true` returning the EN-sourced page with `canonical → EN`, avoiding a static-param explosion for content that's byte-identical to EN anyway until Phase 72/73 land.

3. **Exact per-page content-key naming convention for `content/pages/<locale>/<page>.json`** (e.g. `services-airport-transfer.json` vs. nested `services/airport-transfer.json`).
   - What we know: D-06 only specifies the top-level pattern `content/pages/<locale>/<page>.json`.
   - What's unclear: Whether service sub-pages should nest (`content/pages/en/services/airport-transfer.json`) or flatten (`content/pages/en/services-airport-transfer.json`).
   - Recommendation: Nest to mirror the `app/[locale]/services/<slug>/` URL structure — easier to scan, matches the `content/routes/<locale>/<slug>.json` (flat, since routes have no further nesting) precedent proportionally.

## Environment Availability

Not applicable — this phase has no external service/tool dependencies beyond what's already installed and running (`node`, `next`, existing Supabase connection for `getRoutePrice`/`getPricingConfig`, unchanged). No new CLI tools, databases, or SaaS integrations are introduced.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 `[VERIFIED: package.json]` + `@testing-library/react` ^16.3.2 |
| Config file | `vitest.config.ts` (exists, confirmed via `ls`) |
| Quick run command | `npx vitest run tests/route-content.test.ts tests/blog.test.ts` (per-plan targeted) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CNT-01 | `getRouteContent(slug, 'en')` returns identical values to the pre-refactor literal consts, for every one of the 30 slugs | unit | `npx vitest run tests/route-content.test.ts` | ❌ Wave 0 |
| CNT-01 | EN-rendered route page HTML is byte-for-byte unchanged after the refactor (visible text + FAQPage JSON-LD) | snapshot/golden-diff | `npx vitest run tests/route-pages-byte-parity.test.tsx` | ❌ Wave 0 |
| CNT-02 | `getPageContent(page, 'en')` returns identical values to each page's pre-refactor literals, for all 8 service pages + about/faq/contact/corporate/legal | unit | `npx vitest run tests/page-content.test.ts` | ❌ Wave 0 |
| CNT-03 | `/blog` listing and `/blog/[slug]` render EN content under a non-EN locale subpath, with `canonical → EN` set on the fallback | integration | `npx vitest run tests/blog-locale-fallback.test.ts` | ❌ Wave 0 |
| CNT-03 | The 3 `JSX_POSTS` still appear in `getAllPosts()` regardless of locale (D-08) | unit | `npx vitest run tests/blog.test.ts` (extend existing file) | ✅ existing, extend |
| Success Criterion 4 | Sitemap output (`app/sitemap.ts`) unchanged — same URLs, same `lastModFor()` source paths | unit | `npx vitest run tests/sitemap.test.ts` (add if absent) | ❌ verify in Wave 0 |

### Sampling Rate
- **Per task commit:** run the targeted content-loader unit test for the slug/page just migrated (`npx vitest run tests/route-content.test.ts -t <slug>` style, or the whole file if fast).
- **Per wave merge:** full byte-parity check across every page touched in that wave (all 30 route pages in the routes wave; all service+marketing pages in that wave; blog fallback tests in the blog wave).
- **Phase gate:** `npx vitest run` full suite green before `/gsd-verify-work`, PLUS a manual/scripted **golden-HTML diff**: render each of the 30 route pages, all 8 service pages, and about/faq/contact/corporate/legal both immediately before the first content-extraction commit and again after the full phase completes (e.g. via a throwaway script using `next build && next export`-style static capture, or React Testing Library's `container.innerHTML` for a representative sample if full static export isn't practical) — this is the actual mechanism that proves Success Criterion 4 ("rendered English site is byte-for-byte unchanged"), and it should be captured as an explicit Wave 0 task since no such harness exists in the repo today.

### Wave 0 Gaps
- [ ] `tests/route-content.test.ts` — covers CNT-01 (loader correctness + EN-fallback behavior)
- [ ] `tests/page-content.test.ts` — covers CNT-02
- [ ] `tests/blog-locale-fallback.test.ts` — covers CNT-03 (canonical→EN on missing localized post)
- [ ] A byte-for-byte "golden HTML" capture script/harness (before/after diff) — this is the single most important piece of new test infrastructure this phase needs, since nothing like it exists yet in `tests/` (confirmed via `find tests -iname "*route*" -o -iname "*blog*"`, which returned only price/JSON-LD/`BlogCard` unit tests, no full-page render/diff tests)
- [ ] `messages/en.json` `RoutePage` (and equivalent per-page-family) namespace additions, verified against the Pitfall 1 non-uniformity list before being treated as global chrome

## Security Domain

`security_enforcement` not set to `false` in `.planning/config.json` — treated as enabled, but this phase's actual attack surface is minimal (static content restructuring, no new user input, no new auth/session/crypto code).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Phase touches only public marketing/SEO pages, no auth surface changed |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | Marginal — yes for the loader's `slug`/`page` key | Reuse the existing allowlist pattern already in the codebase: `[VERIFIED: app/[locale]/blog/[slug]/page.tsx:73]` — `if (!/^[a-z0-9-]+$/.test(slug)) { notFound() }`. Apply the identical regex guard inside `getRouteContent(slug, locale)` / `getPageContent(page, locale)` before building the file path, even though `slug` currently only ever comes from the static `ROUTES` array (defense in depth against a future dynamic-param regression, matching the project's existing discipline) |
| V6 Cryptography | No | N/A |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Path traversal via a `slug`/`locale`/`page` key building a `fs` path (e.g. `../../etc/passwd`) | Tampering / Information Disclosure | Allowlist-validate the key against `^[a-z0-9-]+$` before `path.join`, exactly as the existing blog `[slug]/page.tsx` already does; additionally validate `locale` against `routing.locales` (the typed 7-locale array in `i18n/routing.ts`) rather than trusting an arbitrary string, even though `getLocale()` already only ever returns a configured locale in practice |
| Unescaped JSON-LD injection via `dangerouslySetInnerHTML` | Tampering (XSS via `</script>` breakout) | Not newly introduced by this phase (JSON-LD strings are being *relocated*, not user-supplied), but note the existing inconsistency: `app/[locale]/blog/[slug]/page.tsx` already escapes `</script>` (`safeJsonLd()` helper) while the route/service pages' inline `JSON.stringify(pageSchema)` do not. Out of scope to fix here (pre-existing, unrelated to content externalization), but do not introduce this gap into any *new* code this phase writes — if a new loader-based JSON-LD builder is added, apply the same `</script>` escaping the blog page already uses |

## Sources

### Primary (HIGH confidence — direct `Read`/`Bash`/`grep` this session)
- `app/[locale]/routes/prague-vienna/page.tsx` (full file, 391 lines) — hero/inclusions/dayTripConfigurations/whyBook/faqs/JSON-LD/generateMetadata literal inventory
- `app/[locale]/routes/prague-kutna-hora/page.tsx` (full file, 479 lines) — cross-check for skeleton uniformity and literal divergence
- `app/[locale]/services/airport-transfer/page.tsx` (full file, 368 lines) — bespoke service-page shape
- `app/[locale]/about/page.tsx`, `app/[locale]/faq/page.tsx` (heads) — bespoke marketing-page shape
- `app/[locale]/blog/[slug]/page.tsx`, `app/[locale]/blog/page.tsx` (full files) — MDX routing, slug allowlist, canonical pattern
- `lib/routes.ts` (full file, 627 lines) — `ROUTES` array (30 entries, verified via `grep -c`), `metadataTitle` field divergence from live `generateMetadata()`
- `lib/blog.ts` (full file) — `CONTENT_DIR`, `getMDXPosts()`, `JSX_POSTS` registry
- `lib/jsonld.ts`, `lib/blog-jsonld.ts` (full files) — JSON-LD builder conventions
- `lib/seo.ts` (head) — `getAlternates()` existence and non-use by route/service pages
- `i18n/routing.ts`, `i18n/request.ts` (full files) — locale list, `getLocale`/message-loading convention
- `components/SiteChrome.tsx` (grep) — confirmed `getLocale()` usage precedent
- `app/sitemap.ts` (full file) — sitemap entry generation, `lastModFor()` source-path convention
- `package.json` (grep) — `next` 16.2.3, `next-intl` 4.14.2, `zod` 4.3.6, `gray-matter` 4.0.3, `vitest` 4.1.1
- `.planning/phases/70-string-externalization-booking-account/70-PATTERNS.md` (full file) — reused Phase 69/70 next-intl patterns
- `tests/blog.test.ts`, `tests/route-prices-match.test.ts` (heads) — existing test conventions
- Filesystem enumeration (`find`, `ls`, `wc -l`) — 30 route directories, 30 `page.tsx` files, 30 `ROUTES` entries (route count correction vs. CONTEXT.md's "32")

### Secondary (MEDIUM confidence)
- None beyond the above — this research required no external web search; the entire domain is this specific codebase's existing conventions, all directly readable.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all versions read directly from `package.json`
- Architecture: HIGH — loader pattern directly modeled on `lib/blog.ts`'s existing, working convention; `getLocale()` precedent confirmed in-repo
- Pitfalls: HIGH — every pitfall backed by a specific `grep`/`Read` result this session (line numbers cited), not inferred

**Research date:** 2026-09-06
**Valid until:** No expiry pressure — this is an internal-codebase-only finding set with no external library version dependency; re-verify only if the underlying page files change materially before planning begins.
