# Phase 55: Blog UI — Listing + Article Pages - Research

**Researched:** 2026-05-13
**Domain:** Next.js 16 App Router static pages, MDX rendering, Schema.org BlogPosting, Prestigo design system
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIST-01 | `app/blog/page.tsx` renders card grid of all posts from `getAllPosts()`, sorted newest-first | `getAllPosts()` already implemented in `lib/blog.ts`; blog dir exists at `app/blog/` |
| LIST-02 | Each card: coverImage, copper category label, display title, body-text description, formatted date; links to `/blog/[slug]` | Full `BlogCard` spec in 55-UI-SPEC.md; design tokens confirmed in `app/globals.css` |
| LIST-03 | `/blog` full SEO metadata: `<title>`, `<meta description>`, canonical `/blog`, OG tags; appears in `sitemap.xml` | Pattern mirrors `app/guides/page.tsx`; `lastModFor()` in `lib/lastmod.ts` |
| ART-01 | `app/blog/[slug]/page.tsx` renders MDX with `dynamicParams = false` | Scaffold already in place from Phase 54; needs UI layer |
| ART-02 | `generateStaticParams()` returns MDX-only slugs; must NOT include 3 JSX slugs | Current Phase 54 scaffold already correct — reads from `content/blog/*.mdx` only |
| ART-03 | Article page: hero coverImage, `<ArticleByline>`, MDX body, bottom CTA | `ArticleByline` component exists; `mdx-components.tsx` exists (minimal); UI-SPEC has full layout |
| ART-04 | Article page full SEO: OG tags, canonical, Schema.org `BlogPosting` with `personSchemaFor()` | `personSchemaFor()` exists in `lib/authors.ts`; pattern from guides article confirmed |
| ART-05 | Both pages appear in `app/sitemap.ts` with valid `lastmod` | `lastModFor()` utility exists; `app/sitemap.ts` already has the entry pattern |
</phase_requirements>

---

## Summary

Phase 55 builds two Next.js App Router pages: the `/blog` listing page and the `/blog/[slug]` article renderer. The MDX infrastructure (Phase 54) is complete and verified — `lib/blog.ts`, `mdx-components.tsx`, `content/blog/*.mdx`, and the `app/blog/[slug]/page.tsx` scaffold are all in place. Phase 55 work is **entirely UI and metadata** — no new libraries, no infrastructure changes.

The listing page requires a new `BlogCard` component and a new `app/blog/page.tsx`. The article page is a replacement of the Phase 54 minimal scaffold with the full UI: hero image, `ArticleByline`, styled MDX prose, and `BlogPosting` JSON-LD. Both pages must be registered in `app/sitemap.ts`.

The existing codebase provides all building blocks: `getAllPosts()`, `personSchemaFor()`, `lastModFor()`, `ArticleByline`, `Reveal`, `Divider`, and the complete CSS token system. This phase is assembly work using proven project patterns.

**Primary recommendation:** Two plans — Plan 55-01 creates `BlogCard` + `app/blog/page.tsx` (LIST-01, LIST-02, LIST-03, ART-05 partial); Plan 55-02 replaces `app/blog/[slug]/page.tsx` and updates `app/sitemap.ts` (ART-01 through ART-05).

---

## Standard Stack

### Core — already installed, no new packages needed

[VERIFIED: package.json + node_modules]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.3 | App Router, generateMetadata, generateStaticParams | Project framework |
| `@next/mdx` | installed (Phase 54) | MDX compilation pipeline | Locked in Phase 54 |
| `gray-matter` | installed (Phase 54) | Frontmatter extraction | Locked in Phase 54 |
| `mdx/types` | installed | MDXComponents type for mdx-components.tsx | Required by @next/mdx |

### No New Packages Required

Phase 55 introduces zero new npm dependencies. All required functionality is:
- Already in the codebase (`lib/blog.ts`, `lib/authors.ts`, `lib/lastmod.ts`)
- Built into Next.js (`generateMetadata`, `generateStaticParams`, Metadata type)
- Covered by existing components (`ArticleByline`, `Reveal`, `Divider`, `Nav`, `Footer`)

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
app/
├── blog/
│   ├── page.tsx               ← NEW: listing page (LIST-01, LIST-02, LIST-03)
│   └── [slug]/
│       └── page.tsx           ← REPLACE: Phase 54 minimal → full UI (ART-01..ART-04)
components/
└── BlogCard.tsx               ← NEW: reusable card component (LIST-02)
mdx-components.tsx             ← UPDATE: add Prestigo prose styles (ART-03)
app/sitemap.ts                 ← UPDATE: add /blog and /blog/* entries (ART-05)
```

### Pattern 1: Static listing page with generateMetadata

The `/blog` listing page is a simple `force-static` async Server Component — same pattern as `app/guides/page.tsx`.

```typescript
// Source: app/guides/page.tsx (project codebase, verified)
import type { Metadata } from 'next'
export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Prague Chauffeur Blog — Airport, Routes & Transfer Guides',
  description: 'Practical guides on Prague airport transfers...',
  alternates: {
    canonical: '/blog',
    languages: {
      en: 'https://rideprestigo.com/blog',
      'x-default': 'https://rideprestigo.com/blog',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/blog',
    title: '...',
    description: '...',
    images: [{ url: 'https://rideprestigo.com{firstPost.coverImage}', width: 1200, height: 630 }],
  },
}

export default function BlogPage() {
  const posts = getAllPosts()
  // render grid of <BlogCard>
}
```

[VERIFIED: existing codebase pattern in app/guides/page.tsx]

### Pattern 2: Article page with generateMetadata (dynamic per slug)

The `[slug]` route requires `export async function generateMetadata()` (not static `export const metadata`) because each post has unique title, description, and image.

```typescript
// Source: Next.js 16 App Router docs — generateMetadata for dynamic routes
// [VERIFIED: project uses params: Promise<{slug}> pattern in Phase 54 scaffold]
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const post = getAllPosts().find(p => p.slug === slug && p.source === 'mdx')
  if (!post) return {}
  return {
    title: `${post.title} — Prestigo`,
    description: post.description,
    alternates: {
      canonical: `/blog/${slug}`,
      languages: {
        en: `https://rideprestigo.com/blog/${slug}`,
        'x-default': `https://rideprestigo.com/blog/${slug}`,
      },
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://rideprestigo.com/blog/${slug}`,
      images: [{ url: `https://rideprestigo.com${post.coverImage}`, width: 1200, height: 630 }],
    },
  }
}
```

### Pattern 3: BlogPosting JSON-LD schema

Mirrors the `Article` schema in `app/guides/prague-airport-to-city-center/page.tsx` but uses `BlogPosting` type and `BlogPosting`-specific fields.

```typescript
// Source: lib/authors.ts personSchemaFor() + existing Article schema pattern
const blogPostingSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      '@id': `https://rideprestigo.com/blog/${slug}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://rideprestigo.com/blog' },
        { '@type': 'ListItem', position: 3, name: post.title, item: `https://rideprestigo.com/blog/${slug}` },
      ],
    },
    {
      '@type': 'BlogPosting',  // NOT 'Article' — locked decision in STATE.md
      '@id': `https://rideprestigo.com/blog/${slug}#article`,
      headline: post.title,
      description: post.description,
      image: {
        '@type': 'ImageObject',
        url: `https://rideprestigo.com${post.coverImage}`,
        width: 1200,
        height: 630,
      },
      author: personSchemaFor(post.author),
      publisher: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      url: `https://rideprestigo.com/blog/${slug}`,
      datePublished: post.date,
      dateModified: post.dateModified ?? post.date,
    },
  ],
}
```

[VERIFIED: personSchemaFor() signature confirmed in lib/authors.ts; Article schema pattern from app/guides/]

### Pattern 4: MDX content rendering in [slug] page

Phase 54 scaffold already handles dynamic import correctly. Phase 55 wraps it in the design system UI:

```typescript
// Source: app/blog/[slug]/page.tsx Phase 54 scaffold (verified, project codebase)
// Critical: use relative path '../../../content/blog/${slug}.mdx'
// NOT '@/content/blog/${slug}.mdx' — webpack cannot resolve @/ in template literals
const mod = await import(`../../../content/blog/${slug}.mdx`)
const Post = mod.default
// Wrap in <article> with prose classes from mdx-components.tsx
```

[VERIFIED: Phase 54 scaffold code confirmed — see existing app/blog/[slug]/page.tsx]

### Pattern 5: Sitemap update

Both `/blog` and individual MDX post entries must use `lastModFor()`:

```typescript
// Source: app/sitemap.ts (verified, project codebase)
// /blog listing entry — use app/blog/page.tsx as source file
entry('/blog', 'app/blog/page.tsx'),

// MDX post entries — source file is content/blog/{slug}.mdx
// Note: JSX posts stay at their own source paths (Phase 56 concern)
...getAllPosts()
  .filter(p => p.source === 'mdx')
  .map(p => entry(`/blog/${p.slug}`, `content/blog/${p.slug}.mdx`)),
```

[VERIFIED: lastModFor() signature confirmed in lib/lastmod.ts; sitemap entry pattern from existing app/sitemap.ts]

### Pattern 6: BlogCard component

Per 55-UI-SPEC.md — full JSX provided. Key implementation note: the card `<a>` wraps the entire card and needs `aria-label={post.title}` to satisfy WCAG (link text "Read article →" alone is insufficient).

```typescript
// Source: 55-UI-SPEC.md BlogCard Specification (project UI contract)
<a href={`/blog/${post.slug}`} aria-label={post.title}
   className="block border border-anthracite-light hover:border-[var(--copper)] transition-colors group">
  {/* image + content per spec */}
</a>
```

### Pattern 7: mdx-components.tsx upgrade

Phase 54 stub returns passthrough only. Phase 55 must add Prestigo prose mappings:

```typescript
// Source: 55-UI-SPEC.md MDX Prose Styling table + existing project CSS classes
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    h2: ({ children }) => <h2 className="font-display font-light text-[28px] md:text-[32px] text-offwhite mt-14 mb-6 leading-[1.25]">{children}</h2>,
    h3: ({ children }) => <h3 className="font-display font-light text-[22px] md:text-[26px] text-offwhite mt-10 mb-4 leading-[1.3]">{children}</h3>,
    p: ({ children }) => <p className="font-body font-light text-[14px] text-warmgrey mb-5 leading-[1.75] tracking-[0.03em]">{children}</p>,
    // ... etc per UI-SPEC MDX Prose Styling table
  }
}
```

### Anti-Patterns to Avoid

- **Using `export const metadata` in `[slug]/page.tsx`:** Static metadata cannot use per-post values. Must use `export async function generateMetadata({ params })`.
- **Including JSX slugs in `generateStaticParams()`:** ART-02 explicitly forbids this. The Phase 54 scaffold already reads `content/blog/*.mdx` only — do NOT add `JSX_POSTS` slugs here.
- **Using `@/` alias in dynamic import template string:** Webpack/Turbopack cannot resolve `@/` in template literals. Must use relative path `../../../content/blog/${slug}.mdx`.
- **Using `--copper` (#B87333) for category label text:** Fails WCAG AA on `--anthracite-mid`. Must use `--copper-light` (#D4924A, 5.6:1 ratio). [VERIFIED: 55-UI-SPEC.md Accessibility section]
- **Font weight 500/600/700:** Only weights 300 and 400 are used in this design system. [VERIFIED: 55-UI-SPEC.md Typography]
- **Embedding JSX articles in sitemap via `getAllPosts()`:** Only `source === 'mdx'` posts get blog sitemap entries in this phase. JSX posts will be added in Phase 56.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date formatting for byline | Custom date formatter | `formatBylineDate()` from `lib/authors.ts` | Already handles UTC ISO dates → human-readable |
| Author schema generation | Inline JSON-LD object | `personSchemaFor()` from `lib/authors.ts` | Ensures E-E-A-T consistency across all pages |
| Post sorting / aggregation | Re-implement in page | `getAllPosts()` from `lib/blog.ts` | Already handles MDX + JSX merge, sort, validation |
| Git-based lastmod | `Date.now()` or `new Date()` | `lastModFor()` from `lib/lastmod.ts` | Uniform build-time timestamps discounted by Google |
| Scroll reveal animation | CSS `@keyframes` | `<Reveal variant="up" delay={n}>` | IntersectionObserver, reduced-motion aware |
| Section divider | `<hr>` | `<Divider />` | Copper gradient, project-standard |
| Author portrait | `<img>` with jpg only | `<picture>` with avif/webp/jpg sources | `ArticleByline` already implements correct pattern |

**Key insight:** This phase is purely assembly of existing infrastructure — every utility, component, and pattern exists. Novel code is limited to `BlogCard.tsx`, `app/blog/page.tsx`, the UI layer of `app/blog/[slug]/page.tsx`, and the `mdx-components.tsx` prose mappings.

---

## Common Pitfalls

### Pitfall 1: `dynamicParams = false` already set — don't remove it
**What goes wrong:** Phase 54 scaffold has `export const dynamicParams = false`. If a developer replaces the entire file without preserving this export, unknown slugs return 200 with an error instead of 404.
**Why it happens:** Full file replacement when only adding UI layers.
**How to avoid:** Preserve `export const dynamic = "force-static"` and `export const dynamicParams = false` from Phase 54 scaffold.
**Warning signs:** `/blog/non-existent-slug` returns 200 or 500 instead of 404.

### Pitfall 2: `generateMetadata` must be async and await params
**What goes wrong:** In Next.js 15+, `params` in App Router is a Promise. Destructuring synchronously throws a runtime error.
**Why it happens:** Pattern changed in Next.js 15; Phase 54 scaffold already demonstrates the correct `await params` pattern.
**How to avoid:** `const { slug } = await params` — same as Phase 54 scaffold.
**Warning signs:** TypeScript error on `params.slug`; runtime error about Promise.

### Pitfall 3: CollectionPage JSON-LD for listing vs BlogPosting for articles
**What goes wrong:** Using `Article` type for the listing page or `BlogPosting` for the sitemap `CollectionPage`.
**Why it happens:** Schema.org types are easy to confuse.
**How to avoid:** Per STATE.md locked decision: listing page gets `CollectionPage` + `BreadcrumbList` (mirrors `app/guides/page.tsx`); article gets `BlogPosting` (NOT `Article`).

### Pitfall 4: OG image must be absolute URL
**What goes wrong:** `openGraph.images[0].url` set to `/hero-airport-transfer.webp` (relative). Open Graph requires absolute URLs.
**Why it happens:** `coverImage` in `BlogPost` is stored as relative path (`/hero-airport-transfer.webp`).
**How to avoid:** Always prefix with `https://rideprestigo.com`: `url: \`https://rideprestigo.com${post.coverImage}\``
[VERIFIED: SEO Metadata Contract in 55-UI-SPEC.md explicitly states absolute URL pattern]

### Pitfall 5: JSX posts must not appear in blog [slug] generateStaticParams
**What goes wrong:** Adding `getAllPosts().filter(p => p.source === 'mdx')` returns only MDX posts, but if developer uses `getAllPosts()` directly without filter, JSX slugs appear. At build time, the MDX dynamic import for a JSX slug throws → `notFound()` is called, but the slug was listed in `generateStaticParams()` → build fails.
**Why it happens:** ART-02 requirement; Phase 54 scaffold is already correct.
**How to avoid:** Keep the existing `generateStaticParams` as-is (reads `content/blog/*.mdx` via `fs.readdirSync`).

### Pitfall 6: mdx-components.tsx is global — affects all MDX routes
**What goes wrong:** Adding aggressive prose styles to `mdx-components.tsx` that affect test MDX or future MDX pages in unintended ways.
**Why it happens:** `mdx-components.tsx` at repo root applies to all `@next/mdx` compiled files.
**How to avoid:** Style mappings in `mdx-components.tsx` use design system classes that are already globally appropriate. No scoping needed for this project.

---

## Code Examples

### BlogCard.tsx — verified against UI-SPEC
```typescript
// Source: 55-UI-SPEC.md BlogCard Specification
import type { BlogPost } from '@/lib/blog'
import { formatBylineDate } from '@/lib/authors'

export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <a
      href={`/blog/${post.slug}`}
      aria-label={post.title}
      className="block border border-anthracite-light hover:border-[var(--copper)] transition-colors group"
    >
      <div className="aspect-[16/9] overflow-hidden bg-anthracite-mid">
        <img
          src={post.coverImage}
          alt={post.title}
          width={800}
          height={450}
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="p-6 md:p-8 flex flex-col gap-4">
        <p className="label" style={{ color: 'var(--copper-light)' }}>{post.category}</p>
        <h2 className="font-display font-light text-[24px] md:text-[28px] text-offwhite group-hover:text-[var(--copper-light)] transition-colors leading-[1.25]">
          {post.title}
        </h2>
        <p className="body-text text-[13px]" style={{ lineHeight: '1.8' }}>{post.description}</p>
        <div className="flex items-center justify-between mt-2">
          <p className="font-body font-light text-[11px] tracking-[0.1em] uppercase text-warmgrey">
            {formatBylineDate(post.date)}
          </p>
          <p className="font-body font-light text-[10px] tracking-[0.15em] uppercase" style={{ color: 'var(--copper)' }}>
            Read article →
          </p>
        </div>
      </div>
    </a>
  )
}
```

### Sitemap MDX entries pattern
```typescript
// Source: app/sitemap.ts existing entry() helper (verified)
// Add after existing entry('/guides/...') calls:
entry('/blog', 'app/blog/page.tsx'),
...getAllPosts()
  .filter(p => p.source === 'mdx')
  .map(p => entry(`/blog/${p.slug}`, `content/blog/${p.slug}.mdx`)),
```

### Empty state for listing page (no posts)
```typescript
// Source: 55-UI-SPEC.md Copywriting Contract
{posts.length === 0 && (
  <div className="text-center py-24">
    <p className="font-display font-light text-[28px] text-offwhite mb-4">No articles yet.</p>
    <p className="body-text mb-8">We're preparing detailed guides on Prague transfers and routes. Check back soon, or book your transfer now.</p>
    <a href="/book" className="btn-primary">Book a Transfer</a>
  </div>
)}
```

---

## Validation Architecture

Framework: Vitest 4.1.1 (verified in package.json)
Config: `vitest.config.ts` at repo root
Quick run: `npx vitest run tests/blog.test.ts`
Full suite: `npx vitest run`

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIST-01 | `getAllPosts()` returns sorted array | unit | `npx vitest run tests/blog.test.ts` | ✅ tests/blog.test.ts |
| LIST-02 | BlogCard renders required fields | unit | `npx vitest run tests/BlogCard.test.tsx` | ❌ Wave 0 |
| LIST-03 | `/blog` metadata has canonical + OG | manual/visual | `npx vitest run` (no automated metadata assertion) | N/A — build verify |
| ART-01 | `dynamicParams = false` present | manual | `next build` + curl /blog/non-existent-slug → 404 | N/A — build verify |
| ART-02 | `generateStaticParams` excludes JSX slugs | unit | `npx vitest run tests/blog.test.ts` (JSX slugs in JSX_POSTS only) | ✅ (covers getAllPosts) |
| ART-03 | Article page renders MDX body | visual | `next dev` + navigate to test MDX post | N/A — UI |
| ART-04 | BlogPosting JSON-LD has correct fields | unit | `npx vitest run tests/blog-jsonld.test.ts` | ❌ Wave 0 |
| ART-05 | Sitemap includes /blog entries | unit | `npx vitest run tests/sitemap.test.ts` | ❌ Wave 0 |

### Sampling Rate
- Per task commit: `npx vitest run tests/blog.test.ts`
- Per wave merge: `npx vitest run`
- Phase gate: Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/BlogCard.test.tsx` — covers LIST-02 (BlogCard field rendering)
- [ ] `tests/blog-jsonld.test.ts` — covers ART-04 (BlogPosting schema shape)
- [ ] `tests/sitemap.test.ts` — covers ART-05 (sitemap /blog entries present)

---

## Security Domain

Phase 55 is a read-only static blog UI. No user input, no auth, no database writes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Static pages, no auth required |
| V3 Session Management | no | No session state |
| V4 Access Control | no | Public pages |
| V5 Input Validation | partial | `slug` allowlist regex already in Phase 54 scaffold (`/^[a-z0-9-]+$/`) |
| V6 Cryptography | no | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via slug | Tampering | Allowlist regex `/^[a-z0-9-]+$/` in Phase 54 scaffold — preserved in Phase 55 |
| XSS via MDX content | Tampering | MDX compiled at build time, not runtime; no user-supplied MDX |
| Open redirect via coverImage | Tampering | `coverImage` values are local `/public` paths; no external URL redirection |

---

## Environment Availability

Step 2.6: No new external dependencies. Phase 55 is code-only assembly using already-installed packages. SKIPPED.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `lastModFor('content/blog/{slug}.mdx')` returns a valid date from git log on MDX files | Standard Stack / Sitemap | If git log has no commit touching the file, falls back to mtime — acceptable per lib/lastmod.ts fallback logic |
| A2 | `font-display`, `font-body`, `text-offwhite`, `text-warmgrey` Tailwind utilities work as expected from globals.css @theme | Architecture | Verified they're declared in globals.css; assume Tailwind v4 JIT processes them correctly at build |

**All other claims are VERIFIED from codebase scan.**

---

## Open Questions

1. **Should `BlogCard` use Next.js `<Link>` or `<a>`?**
   - What we know: Existing guide listing uses plain `<a>` tags; `<Link>` would add client-side prefetch.
   - What's unclear: The UI-SPEC shows `<a>`, not `<Link>`. Prefetch could improve UX.
   - Recommendation: Follow UI-SPEC exactly — use `<a>`. Phase 56 can evaluate Link prefetching.

2. **Should `app/blog/page.tsx` include JSX posts in the card grid?**
   - What we know: `getAllPosts()` returns both MDX and JSX posts. The JSX posts render at `/blog/[slug]` only after Phase 56 (migration). Before Phase 56, clicking a JSX post card would 404 (not in `generateStaticParams`).
   - What's unclear: Should cards be filtered to `source === 'mdx'` only, or show all?
   - Recommendation: Show ALL posts (`getAllPosts()`). JSX post cards will have working URLs because those pages are colocated JSX routes at `app/blog/prague-*/page.tsx` (after Phase 56 git mv). For now (pre-Phase 56), JSX post cards will 404 on click — this is acceptable since Phase 55 precedes Phase 56 in the milestone.

---

## Sources

### Primary (HIGH confidence)
- Project codebase scan: `lib/blog.ts`, `lib/authors.ts`, `lib/lastmod.ts`, `app/blog/[slug]/page.tsx`, `app/sitemap.ts`, `app/guides/prague-airport-to-city-center/page.tsx`, `app/globals.css`, `components/ArticleByline.tsx`, `components/Reveal.tsx`, `components/Divider.tsx`, `mdx-components.tsx`
- 55-UI-SPEC.md (phase UI design contract, full specification)
- REQUIREMENTS.md (LIST-01..ART-05 requirement text)
- STATE.md (locked decisions: BlogPosting type, dynamicParams = false, JSX slug exclusion)

### Secondary (MEDIUM confidence)
- Next.js 16.2.3 App Router: `params` as Promise pattern confirmed from Phase 54 scaffold usage

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — zero new packages; all from verified package.json
- Architecture: HIGH — all patterns verified from existing codebase files
- Pitfalls: HIGH — all derived from existing code, locked decisions, and UI-SPEC

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stable project; Next.js 16 and existing patterns won't change)
