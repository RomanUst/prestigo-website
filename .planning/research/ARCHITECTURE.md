# Architecture Research

**Domain:** Hybrid JSX + MDX blog integrated into Next.js 16 App Router
**Researched:** 2026-05-13
**Confidence:** HIGH — all key claims verified against official Next.js 16.2.6 docs

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        app/blog/                                  │
├───────────────────────────────────┬──────────────────────────────┤
│  Static named dirs (JSX articles) │  Dynamic [slug] (MDX)        │
│                                   │                               │
│  app/blog/prague-airport/         │  app/blog/[slug]/             │
│    page.tsx  ─── force-static     │    page.tsx                   │
│                                   │    generateStaticParams()     │
│  app/blog/prague-taxi-vs-/        │    dynamicParams = false      │
│    page.tsx  ─── force-static     │                               │
│                                   │                               │
│  app/blog/prague-vienna-vs-/      │                               │
│    page.tsx  ─── force-static     │                               │
├───────────────────────────────────┴──────────────────────────────┤
│                        app/blog/page.tsx                          │
│    Listing page — aggregates BlogPost[] from lib/blog.ts          │
├──────────────────────────────────────────────────────────────────┤
│                        lib/blog.ts                                │
│    getAllPosts(): BlogPost[]  ← MDX frontmatter via @next/mdx     │
│    JSX_POSTS registry        ← hardcoded BlogPost[] for JSX dirs │
├──────────────────────────────────────────────────────────────────┤
│  content/blog/*.mdx           │  public/blog/  (cover images)    │
│    YAML frontmatter exports   │                                   │
└───────────────────────────────┴──────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| `app/blog/page.tsx` | Listing page — renders card grid from `BlogPost[]` | Server component, calls `lib/blog.ts` |
| `app/blog/[slug]/page.tsx` | MDX article renderer — dynamic route for new posts | `await import('@/content/${slug}.mdx')` pattern |
| `app/blog/<named-slug>/page.tsx` | Static JSX article — one dir per migrated article | Existing article moved here, `force-static` stays |
| `lib/blog.ts` | Single aggregation point — returns `BlogPost[]` sorted newest-first | Merges `JSX_POSTS` registry + MDX frontmatter from `content/blog/` |
| `mdx-components.tsx` | Global MDX element overrides (typography, images) | Required by `@next/mdx` App Router; lives at project root |
| `components/BlogCard.tsx` | Card used by listing page — coverImage, category, title, description, date | New component |
| `components/BlogArticleLayout.tsx` | Shared prose layout wrapping MDX content | Passed as wrapper in `[slug]/page.tsx` |

---

## Hybrid Conflict Resolution (Question 1)

**Named static directories take precedence over dynamic segments in Next.js App Router.** This is a built-in filesystem routing property — a named folder (`app/blog/prague-airport/`) always wins over the dynamic sibling (`app/blog/[slug]/`) for that exact path segment. No configuration needed; Next.js resolves this at build time via its route tree.

Source: Next.js 16.2.6 docs (lastUpdated 2026-05-13) confirm that both patterns coexist in the same parent directory. The docs explicitly show `app/blog/[slug]/page.js` and named subdirectories living under the same `app/blog/` parent — the named directory is always more specific.

**Result:** `/blog/prague-airport` serves `app/blog/prague-airport/page.tsx` (JSX). `/blog/new-mdx-post` is caught by `app/blog/[slug]/page.tsx` (MDX). No conflict at runtime or build time.

---

## generateStaticParams for MDX-only (Question 2)

**Pattern used:** `@next/mdx` with dynamic import — the officially recommended approach as of Next.js 16.

The dynamic route `app/blog/[slug]/page.tsx` implements `generateStaticParams` by reading `content/blog/` at build time with Node `fs`:

```typescript
// app/blog/[slug]/page.tsx
import fs from 'node:fs'
import path from 'node:path'

export const dynamicParams = false

export function generateStaticParams() {
  const dir = path.join(process.cwd(), 'content/blog')
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => ({ slug: f.replace(/\.mdx$/, '') }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { default: Post, metadata } = await import(`@/content/${slug}.mdx`)
  return <BlogArticleLayout meta={metadata}><Post /></BlogArticleLayout>
}
```

`dynamicParams = false` ensures a request for a slug not in `content/blog/` returns 404 — this is critical because JSX article slugs (`prague-airport`, etc.) are served by their named directories, not by this route, so they must not fall through here.

**JSX article slugs are never included in `generateStaticParams`.** Their named directories handle them independently.

---

## lib/blog.ts Aggregation Design (Question 3)

`lib/blog.ts` is the single source of truth for the listing page. It returns `BlogPost[]` sorted newest-first, merging two sources:

```typescript
// lib/blog.ts
import fs from 'node:fs'
import path from 'node:path'

export type BlogPost = {
  slug: string
  title: string
  description: string
  date: string          // ISO YYYY-MM-DD
  coverImage: string    // absolute /blog/filename.avif
  category: string
  author: string        // AuthorSlug
  href: string          // canonical /blog/<slug>
  source: 'mdx' | 'jsx'
}

// ── Source 1: Hardcoded registry for JSX articles ─────────────────
// These are complex JSX pages that cannot be converted to MDX.
// Metadata is maintained here manually alongside the JSX page.
const JSX_POSTS: BlogPost[] = [
  {
    slug: 'prague-airport-to-city-center',
    title: 'Prague Airport to City Centre 2026 — By Passenger Type',
    description: 'Every transport option with real 2026 fares...',
    date: '2026-04-09',
    coverImage: '/blog/prague-airport-city-center.avif',
    category: 'Guide',
    author: 'roman-ustyugov',
    href: '/blog/prague-airport-to-city-center',
    source: 'jsx',
  },
  // ... 2 more entries
]

// ── Source 2: MDX frontmatter from content/blog/*.mdx ─────────────
// Frontmatter is exported as `metadata` from each MDX file.
// At build time we import() each file to extract the export.
async function getMdxPosts(): Promise<BlogPost[]> {
  const dir = path.join(process.cwd(), 'content/blog')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'))
  const posts = await Promise.all(
    files.map(async (file) => {
      const slug = file.replace(/\.mdx$/, '')
      const { metadata } = await import(`@/content/${slug}.mdx`)
      return { ...metadata, slug, href: `/blog/${slug}`, source: 'mdx' } as BlogPost
    }),
  )
  return posts
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const mdxPosts = await getMdxPosts()
  return [...JSX_POSTS, ...mdxPosts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
}
```

**Key decision:** MDX frontmatter is exported as a named export (`export const metadata = { ... }`) from each `.mdx` file — this is the `@next/mdx` idiomatic pattern (no YAML parsing library needed; gray-matter is not required).

---

## Data Flow (Question 4)

### Content/blog/*.mdx → Listing Page

```
Build time:
  content/blog/my-post.mdx
    export const metadata = { title, description, date, coverImage, category, author }
        ↓
  lib/blog.ts: getAllPosts()
    → import('@/content/my-post.mdx') → extract metadata export
    → merge with JSX_POSTS
    → sort by date desc
        ↓
  app/blog/page.tsx
    → const posts = await getAllPosts()
    → <BlogCard> for each post (href, coverImage, title, description, date, category)
```

### Content/blog/*.mdx → Article Page

```
Build time:
  generateStaticParams() reads content/blog/ → returns [{ slug: 'my-post' }, ...]
        ↓
  For each slug:
    app/blog/[slug]/page.tsx
      → const { slug } = await params
      → const { default: Post, metadata } = await import('@/content/${slug}.mdx')
      → generateMetadata() reads metadata → sets OG, canonical, Schema.org
      → render: <BlogArticleLayout meta={metadata}><Post /></BlogArticleLayout>
```

### JSX Article → Listing Page

```
Build time:
  lib/blog.ts: JSX_POSTS[] — static array, no filesystem read
        ↓
  app/blog/page.tsx — same BlogCard rendering path as MDX posts
```

### JSX Article → Article Page

```
Request for /blog/prague-airport-to-city-center:
  Next.js router resolves to app/blog/prague-airport-to-city-center/page.tsx
  (named dir takes priority; [slug] route never invoked)
  → JSX page renders directly with its own metadata/schema
```

### Sitemap

```
app/sitemap.ts:
  → getAllPosts()  (same lib/blog.ts call)
  → posts.map(p => entry(p.href, sourceFileFor(p)))
  → sourceFileFor 'mdx' → 'content/blog/<slug>.mdx'
  → sourceFileFor 'jsx' → 'app/blog/<slug>/page.tsx'
  → lastModFor(sourceFile) resolves git date per file
```

---

## Recommended Project Structure

```
/
├── app/
│   ├── blog/
│   │   ├── page.tsx                          # LIST-01: Listing page
│   │   ├── layout.tsx                        # Shared blog layout (optional)
│   │   ├── [slug]/
│   │   │   └── page.tsx                      # ART-01: MDX article renderer
│   │   ├── prague-airport-to-city-center/
│   │   │   └── page.tsx                      # MIG-01: Migrated JSX article
│   │   ├── prague-airport-taxi-vs-chauffeur/
│   │   │   └── page.tsx                      # MIG-01: Migrated JSX article
│   │   └── prague-vienna-transfer-vs-train/
│   │       └── page.tsx                      # MIG-01: Migrated JSX article
│   ├── sitemap.ts                            # Updated with blog entries
│   └── ...existing pages...
├── content/
│   └── blog/
│       └── *.mdx                             # New MDX articles
├── components/
│   ├── BlogCard.tsx                          # New — listing card
│   └── BlogArticleLayout.tsx                 # New — prose wrapper for MDX
├── lib/
│   ├── blog.ts                               # New — aggregation + BlogPost type
│   └── ...existing libs...
├── public/
│   └── blog/
│       └── *.avif / *.webp                   # Cover images
├── mdx-components.tsx                        # New — required by @next/mdx App Router
└── next.config.ts                            # Modified — add @next/mdx + redirects
```

---

## Architectural Patterns

### Pattern 1: Named-dir-takes-precedence (Hybrid coexistence)

**What:** Static named directories (`app/blog/<slug>/`) naturally shadow the dynamic segment (`app/blog/[slug]/`) for their exact path. No code or config needed — it is implicit filesystem routing behavior.

**When to use:** Whenever a subset of slugs require fully custom JSX rendering that cannot be expressed as a template, while the rest follow a uniform MDX template.

**Trade-offs:** The JSX article metadata must be maintained manually in `lib/blog.ts`'s `JSX_POSTS` registry. If a JSX article's title or coverImage changes, the registry must be updated too. This is acceptable because there are only 3 such articles and they are not expected to be authored frequently.

### Pattern 2: MDX frontmatter as exported const (not YAML)

**What:** Each `content/blog/*.mdx` file exports its frontmatter as a TypeScript-compatible named export: `export const metadata = { title, description, date, coverImage, category, author }`. This is then importable by both `app/blog/[slug]/page.tsx` (article renderer) and `lib/blog.ts` (listing aggregator) via `await import('@/content/<slug>.mdx')`.

**When to use:** When using `@next/mdx` (the current official approach). Avoids adding `gray-matter` as a dependency and avoids a separate YAML parsing step.

**Trade-offs:** Authors writing MDX must use JS export syntax instead of YAML frontmatter. The string format is slightly more verbose but provides full TypeScript type checking on frontmatter fields. A linter rule or TypeScript interface on `metadata` can enforce required fields.

**Example:**
```mdx
export const metadata = {
  title: 'How to Get from Prague Airport to the City',
  description: 'A guide to public transport, taxi, and chauffeur options.',
  date: '2026-05-20',
  coverImage: '/blog/prague-airport-guide.avif',
  category: 'Guide',
  author: 'roman-ustyugov',
}

# How to Get from Prague Airport to the City

...article body...
```

### Pattern 3: dynamicParams = false on MDX route

**What:** Setting `export const dynamicParams = false` in `app/blog/[slug]/page.tsx` ensures requests for slugs not in `generateStaticParams()` return 404 at runtime.

**When to use:** Always, for this project. It prevents a request for a JSX article slug (e.g. `/blog/prague-airport-to-city-center`) from falling through to the MDX route if the named directory ever fails to resolve (defence in depth). It also keeps the build output fully static — no server-side rendering on demand.

### Pattern 4: @next/mdx over next-mdx-remote

**What:** Use the official `@next/mdx` package (`@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`) rather than `next-mdx-remote`.

**Why mandatory:** `next-mdx-remote` was archived on 2026-04-09 and is no longer supported. `@next/mdx` is the official, maintained, zero-external-dependency approach. It integrates with the webpack/Turbopack build, supports App Router Server Components natively, and does not require a runtime MDX compiler.

**Configuration change:** `next.config.ts` must be converted from `.ts` to `.mjs` OR use the `withMDX` wrapper. Because the project uses `next.config.ts`, wrap with `createMDX` from `@next/mdx` (supported as of Next.js 16 — TypeScript config files are supported).

```typescript
// next.config.ts — append @next/mdx wrapper
import createMDX from '@next/mdx'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  // ...existing config preserved...
}

const withMDX = createMDX({})
export default withMDX(nextConfig)
```

---

## Anti-Patterns

### Anti-Pattern 1: Including JSX article slugs in generateStaticParams

**What people do:** Add JSX article slugs to `generateStaticParams` in `app/blog/[slug]/page.tsx` to make them appear in the params list.

**Why it's wrong:** At build time, Next.js would attempt to render `/blog/prague-airport-to-city-center` via the MDX route, fail to find a matching `.mdx` file in `content/blog/`, and either throw or produce an empty page — masking the JSX article served by the named directory.

**Do this instead:** Keep `generateStaticParams` reading exclusively from `content/blog/*.mdx`. JSX articles are never in that directory.

### Anti-Pattern 2: Using gray-matter for frontmatter parsing with @next/mdx

**What people do:** Install `gray-matter` and add a file-reading function that parses YAML frontmatter from `.mdx` files, similar to the `next-mdx-remote` pattern.

**Why it's wrong:** `@next/mdx` compiles MDX files via webpack/Turbopack at build time. Parsing them separately with `gray-matter` means reading the raw file a second time outside the build pipeline. The idiomatic approach is exporting metadata as a JS object, which is tree-shaken, type-checked, and importable without filesystem reads in deployed functions.

**Do this instead:** Use `export const metadata = { ... }` inside `.mdx` files and import it via `await import('@/content/<slug>.mdx')`.

### Anti-Pattern 3: Maintaining separate sitemap entries for /guides and /compare after migration

**What people do:** Leave the old `/guides/...` and `/compare/...` entries in `app/sitemap.ts` alongside new `/blog/...` entries during the migration.

**Why it's wrong:** Google will index both URLs. The 301 redirect protects link equity, but duplicate sitemap entries signal confusion to crawlers and may delay deindexation of old URLs.

**Do this instead:** In the same phase that adds 301 redirects (MIG-02) and adds `/blog/*` sitemap entries (MIG-05), remove the old `/guides/...` and `/compare/...` entries from `sitemap.ts`. These two changes must be in the same commit.

### Anti-Pattern 4: Separate blog layout that duplicates Nav/Footer

**What people do:** Create `app/blog/layout.tsx` that renders `<Nav>` and `<Footer>`, creating a parallel layout tree that conflicts with `app/layout.tsx`.

**Why it's wrong:** `app/layout.tsx` already renders Nav and Footer for all pages. Adding a blog layout that also renders them results in double Nav/double Footer on blog pages.

**Do this instead:** `app/blog/layout.tsx` should only add blog-specific structural elements (e.g. a max-width prose container) and rely on the root layout for chrome. Or omit `app/blog/layout.tsx` entirely and add prose classes inside each page component.

---

## Integration Points

### New Files (create from scratch)

| File | Purpose |
|------|---------|
| `lib/blog.ts` | `BlogPost` type, `JSX_POSTS` registry, `getAllPosts()` |
| `app/blog/page.tsx` | Listing page — card grid |
| `app/blog/[slug]/page.tsx` | MDX article renderer |
| `app/blog/layout.tsx` | Optional prose layout wrapper (skip if root layout suffices) |
| `components/BlogCard.tsx` | Card component for listing |
| `components/BlogArticleLayout.tsx` | Prose wrapper for MDX articles |
| `mdx-components.tsx` | Required by `@next/mdx`; global MDX component overrides |
| `content/blog/` | Directory for all future MDX articles |

### Modified Files

| File | Change |
|------|--------|
| `next.config.ts` | Add `@next/mdx` wrapper + `pageExtensions`; append redirects for `/guides/*`, `/compare/*` → `/blog/*` |
| `app/sitemap.ts` | Add `getAllPosts()` loop; remove old `/guides/*`, `/compare/*` entries |
| `app/guides/prague-airport-to-city-center/page.tsx` | Move → `app/blog/prague-airport-to-city-center/page.tsx`; update canonical URL |
| `app/compare/prague-airport-taxi-vs-chauffeur/page.tsx` | Move → `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx`; update canonical URL |
| `app/compare/prague-vienna-transfer-vs-train/page.tsx` | Move → `app/blog/prague-vienna-transfer-vs-train/page.tsx`; update canonical URL |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `lib/blog.ts` ↔ `app/blog/page.tsx` | `getAllPosts()` return value | Both server-only; no client boundary crossing |
| `lib/blog.ts` ↔ `app/sitemap.ts` | `getAllPosts()` return value | `source` field determines `lastModFor()` path |
| `lib/blog.ts` ↔ `lib/authors.ts` | `BlogPost.author` is an `AuthorSlug` | `getAuthor(post.author)` in article pages for `ArticleByline` |
| `app/blog/[slug]/page.tsx` ↔ `content/blog/*.mdx` | `await import('@/content/${slug}.mdx')` | Webpack build-time — no runtime filesystem read |
| `mdx-components.tsx` ↔ `app/blog/[slug]/page.tsx` | Implicit via `@next/mdx` MDXProvider | Next.js injects components automatically |

---

## Build Order Between Phases 54 and 55

Based on dependencies between the requirements:

**Phase 54 — Infrastructure (INFRA-01, INFRA-02, INFRA-03)**

Must come first because everything else depends on it:
1. Install `@next/mdx` packages; update `next.config.ts`
2. Create `mdx-components.tsx` (required by `@next/mdx` — build fails without it)
3. Define `BlogPost` type and `lib/blog.ts` with `JSX_POSTS` and `getAllPosts()`
4. Create `content/blog/` directory with one real MDX article (validates the pipeline end-to-end)
5. Verify `generateStaticParams` + `dynamicParams = false` works in `app/blog/[slug]/page.tsx`

**Phase 55 — Listing + Article UI (LIST-01..04, ART-01..04)**

Depends on Phase 54's `lib/blog.ts` existing and `@next/mdx` working:
1. `app/blog/page.tsx` (listing) — requires `getAllPosts()` from INFRA-01
2. `components/BlogCard.tsx` — can be built in parallel with listing page
3. `app/blog/[slug]/page.tsx` article renderer — requires `@next/mdx` pipeline from INFRA-02
4. `components/BlogArticleLayout.tsx` — required by article renderer
5. SEO meta on listing and article pages (OG, Schema.org Article, canonical)

**Phase 56 — Migration (MIG-01..05)**

Depends on Phase 55 because migrated JSX articles must use the established blog infrastructure (ArticleByline reuse, sitemap pattern):
1. Move 3 JSX article files into `app/blog/<slug>/page.tsx`
2. Update canonical URLs in each article
3. Append 301 redirects to `next.config.ts`
4. Remove old `/guides/*` and `/compare/*` from `sitemap.ts`; add `/blog/*` entries
5. Delete now-empty `app/guides/` and `app/compare/` directories (or leave index pages with 301)

**Dependency graph:**

```
@next/mdx install
    ↓
mdx-components.tsx (required for build)
    ↓
lib/blog.ts (BlogPost type + getAllPosts)
    ↓                        ↓
app/blog/page.tsx     app/blog/[slug]/page.tsx
(listing)             (MDX renderer)
    ↓                        ↓
BlogCard.tsx          BlogArticleLayout.tsx
    └────────────────────────┘
                 ↓
    app/blog/<named-slug>/page.tsx (JSX migration)
                 ↓
    next.config.ts redirects + sitemap.ts update
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–50 posts | Current static build approach is ideal — zero runtime cost, full CDN cache |
| 50–500 posts | Build times may grow; consider `next dev` incremental compilation; no architecture change needed |
| 500+ posts | Consider Incremental Static Regeneration (ISR) or a headless CMS — out of scope for this milestone |

The current scale of Prestigo's blog (3 migrated + handful of new MDX articles) will not approach any build-time limit. Static output on Vercel remains the correct choice.

---

## Sources

- Next.js 16.2.6 official docs — Dynamic Route Segments: https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes (verified 2026-05-13)
- Next.js 16.2.6 official docs — MDX guide: https://nextjs.org/docs/app/guides/mdx (verified 2026-05-13)
- next-mdx-remote archived notice: https://github.com/hashicorp/next-mdx-remote (archived 2026-04-09)
- Next.js 16.2.6 official docs — Layouts and Pages (routing precedence): https://nextjs.org/docs/app/getting-started/layouts-and-pages (verified 2026-05-13)

---
*Architecture research for: Hybrid JSX + MDX blog, rideprestigo.com*
*Researched: 2026-05-13*
