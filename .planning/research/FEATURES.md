# Feature Research

**Domain:** MDX Blog — listing page + article pages on Next.js 16 App Router
**Researched:** 2026-05-13
**Confidence:** HIGH (stack well-established; patterns verified against Next.js official docs and community sources)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the blog to feel complete. Missing any of these makes the blog feel broken or unfinished to readers and to Google.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Listing page at `/blog` | Entry point; every blog has one | LOW | Server component reads all posts from `lib/blog.ts`, no client state needed |
| Card grid sorted newest-first | Universal convention; deviation confuses | LOW | Map over `BlogPost[]`, sort by `date` descending; Tailwind grid |
| Card content: coverImage, category badge, title, description, date | Users scan cards visually; they expect image + metadata | LOW | `next/image` for cover; `formatBylineDate` already exists in `lib/authors.ts` |
| Article page at `/blog/[slug]` | Each card must link somewhere | LOW | Dynamic segment; hybrid with static JSX directories handled by Next.js automatically |
| Hero cover image on article page | Long-form articles always open with a visual anchor | LOW | Same `coverImage` from frontmatter; `public/blog/` directory; `next/image` with priority |
| `<ArticleByline>` on every article | E-E-A-T signal; already built; omitting it would be a regression | LOW | Reuse `components/ArticleByline.tsx` directly; `authorSlug` comes from frontmatter |
| `generateMetadata()` per article | Google needs unique `<title>`, `description`, `og:title`, `og:description`, `og:image` | LOW | Standard App Router pattern; reads frontmatter fields; `coverImage` doubles as `og:image` |
| `canonical` URL per article | Prevents duplicate content penalties, especially post-migration | LOW | `alternates: { canonical: 'https://rideprestigo.com/blog/[slug]' }` |
| Schema.org `BlogPosting` JSON-LD per article | Google rich results; inherits existing `personSchemaFor()` for `author` | MEDIUM | Use `BlogPosting` (more specific than `Article`); reuse `lib/jsonld.ts` pattern; nest `Person` node from `personSchemaFor()` |
| 301 redirects from old paths | SEO link equity preservation; users who bookmarked old guides | LOW | Append to `next.config.ts` `redirects()` array; do not replace |
| Blog posts in `sitemap.xml` | Googlebot discovers new articles | LOW | Extend `app/sitemap.ts` with `lib/blog.ts` posts; use existing `entry()` helper |
| Frontmatter schema: `title`, `description`, `date`, `coverImage`, `category`, `author` | Minimum metadata to drive all of the above | LOW | `gray-matter` parses YAML block; `author` is an `AuthorSlug` value matching `lib/authors.ts` |

### Differentiators (Competitive Advantage)

Features that are not expected by default but meaningfully improve SEO yield or reader experience on a premium brand site.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `dateModified` frontmatter field | Google uses it in rich results freshness signals; triggers "Updated" label in byline via existing `ArticleByline` prop | LOW | Optional field; `ArticleByline` already accepts `dateModified`; pass to Schema.org `dateModified` |
| Hybrid JSX + MDX listing unified in `lib/blog.ts` | The 3 migrated articles are complex JSX that cannot become MDX; a unified aggregator hides this from the listing and sitemap | MEDIUM | `lib/blog.ts` exports `BlogPost[]`; JSX articles registered as a static `JSX_POSTS` array; MDX articles discovered via `fs.readdirSync`; both merged and sorted |
| Category badge on listing cards + `category` in Schema.org `keywords` | Helps readers scan; signals topical authority to Google | LOW | Single string field (e.g. `"Travel Tips"`, `"Destinations"`); no taxonomy infra needed yet |
| `lastmod` from `lib/lastmod.ts` for MDX files | Consistent with existing pages; sitemap freshness signal | LOW | `lastModFor()` already calls `git log`; pass the `.mdx` file path |
| `og:type = article` | More specific than `website`; enables richer Facebook/LinkedIn share previews | LOW | Set `openGraph.type: 'article'` in `generateMetadata()`; include `publishedTime` and `authors` |
| Reading time estimate on article page | Qualifies the commitment for the reader; common on premium editorial sites | LOW | ~5 lines: count words in raw MDX source, divide by 200 wpm; computed in `lib/blog.ts` at build time; stored in `BlogPost` |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Client-side category filtering with `useState` | Seems like good UX; common tutorial approach | Adds a client bundle to a page that is otherwise pure RSC; breaks `force-static`; requires Suspense boundary for `useSearchParams`; at low post counts (< 50) server-side URL params are always faster | Use `?category=` query param read via `searchParams` prop in the Server Component page; no JS needed, works with static generation per category |
| Converting existing JSX articles to MDX | Desire for uniformity | The 3 articles contain inline data arrays, tables, and custom JSX components that MDX cannot replicate without a full rewrite; conversion adds risk with zero reader value | Hybrid model: JSX articles as static page directories (`app/blog/slug/page.tsx`) coexist with `app/blog/[slug]/page.tsx`; unified in `lib/blog.ts` registry |
| Dynamic OG image generation (`ImageResponse`) | Looks professional in link previews | `@vercel/og` adds build complexity and a Vercel Edge Function; for a premium service brand the hand-crafted `coverImage` photo is a stronger brand signal than a generated card | Use static `coverImage` from `public/blog/` as `og:image`; consistent with existing editorial pages |
| Pagination with page numbers | Seems needed for scale | At the volume of a specialist chauffeur blog (likely < 30 articles per year), a single card grid page is simpler and avoids `generateStaticParams` for paginated routes | A single listing page; if > 40 posts appear, add simple "Load older" link or infinite scroll as a separate milestone |
| Headless CMS (Contentful, Sanity) | Non-technical content editing | External dependency, cost, API key management, build webhook complexity — none needed for a repo where the only author is the founder | MDX-in-repo; deploy on git push; Vercel handles revalidation automatically |
| Comments / reactions | Community engagement | This is a conversion-focused service site, not a community; a comment section below a premium brand article undercuts the tone and adds spam risk | CTA block at end of article instead: "Book your transfer" deep-link to booking flow |
| Search within blog | Power user feature | Adds a separate search index (Algolia or custom) for < 20 articles; massive over-engineering | Defer; if organic blog grows to 50+ articles, evaluate Pagefind (fully static, no external dependency) |
| Table of contents (auto-generated) | Long articles benefit from it | Requires parsing MDX AST or using `rehype-slug` + `remark-toc`; adds remark/rehype plugin chain complexity | Note this as a Phase 2 enhancement once the article rendering pipeline is stable |

---

## Feature Dependencies

```
[lib/blog.ts aggregator]
    └──requires──> [MDX frontmatter schema defined]
    └──requires──> [JSX_POSTS static registry]

[/blog listing page]
    └──requires──> [lib/blog.ts aggregator]

[/blog/[slug] MDX article page]
    └──requires──> [lib/blog.ts aggregator]
    └──requires──> [next-mdx-remote/rsc MDX renderer installed]
    └──requires──> [MDX files in content/blog/]

[ArticleByline on MDX article]
    └──requires──> [author frontmatter field = AuthorSlug]
    └──enhances──> [personSchemaFor() in BlogPosting schema]

[BlogPosting Schema.org JSON-LD]
    └──requires──> [personSchemaFor() from lib/authors.ts]  ← already exists
    └──requires──> [lib/jsonld.ts]                          ← already exists
    └──enhances──> [og:type = article in generateMetadata]

[sitemap.xml blog entries]
    └──requires──> [lib/blog.ts aggregator]
    └──requires──> [lastModFor() from lib/lastmod.ts]       ← already exists

[301 redirects]
    └──requires──> [/blog/[slug] article pages work]
    └──requires──> [next.config.ts redirects() array]       ← already exists, append only

[Reading time]
    └──requires──> [lib/blog.ts has access to raw MDX source]
    └──enhances──> [article page display]
```

### Dependency Notes

- `lib/blog.ts` is the keystone: listing page, article params, sitemap, and redirects all depend on it existing first.
- `authorSlug` in frontmatter must be a valid `AuthorSlug` — TypeScript should enforce this in `lib/blog.ts` at parse time to catch typos before build.
- `personSchemaFor()` is already built and produces the full E-E-A-T `Person` node; the blog just nests it inside `BlogPosting.author` — no new author infrastructure needed.
- 301 redirects must go live in the same deploy as the new `/blog/[slug]` pages, not before, to avoid redirect chains to 404.

---

## MVP Definition

### Launch With (v1) — Current Milestone Scope

- [x] `lib/blog.ts` — aggregator returning sorted `BlogPost[]` from MDX files + JSX_POSTS registry
- [x] MDX rendering pipeline (`next-mdx-remote/rsc`) installed and wired
- [x] Frontmatter schema: `title`, `description`, `date`, `coverImage`, `category`, `author` (+ optional `dateModified`)
- [x] `/blog` listing page: card grid, coverImage, category, title, description, date
- [x] `/blog` page SEO: `generateMetadata`, canonical, OG
- [x] `/blog/[slug]` article page: hero image, ArticleByline, full MDX render
- [x] Article SEO: `generateMetadata`, canonical, `og:type = article`, Schema.org `BlogPosting`
- [x] 3 existing articles accessible at `/blog/[old-slug]` (JSX static dirs)
- [x] 301 redirects: `/guides/*` and `/compare/*` → `/blog/*`; index pages → `/blog`
- [x] `sitemap.xml` updated: old paths removed, `/blog/*` added

### Add After Validation (v1.x)

- [ ] Reading time estimate — add once a few MDX articles exist and the pipeline is stable
- [ ] `dateModified` field — add when the first article is meaningfully updated
- [ ] Table of contents — add if long-form articles consistently exceed 2000 words

### Future Consideration (v2+)

- [ ] Category filter via `?category=` searchParam — only useful once > 10 articles per category exist
- [ ] Pagefind static search — only useful once > 50 articles exist
- [ ] Second author in `lib/authors.ts` — only needed when a second person publishes content

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `lib/blog.ts` aggregator | HIGH | LOW | P1 |
| Frontmatter schema | HIGH | LOW | P1 |
| `/blog` listing card grid | HIGH | LOW | P1 |
| `/blog/[slug]` MDX article render | HIGH | LOW | P1 |
| `generateMetadata` + canonical + OG per article | HIGH | LOW | P1 |
| Schema.org `BlogPosting` JSON-LD | HIGH | MEDIUM | P1 |
| 301 redirects old → new paths | HIGH | LOW | P1 |
| Sitemap update | HIGH | LOW | P1 |
| ArticleByline on MDX articles | MEDIUM | LOW | P1 — reuse existing, zero marginal cost |
| `og:type = article` + `publishedTime` | MEDIUM | LOW | P1 — one line in `generateMetadata` |
| Reading time estimate | MEDIUM | LOW | P2 |
| `dateModified` in frontmatter + schema | MEDIUM | LOW | P2 |
| Table of contents | LOW | MEDIUM | P3 |
| Category filter (URL param) | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when post count justifies
- P3: Nice to have, future milestone

---

## Existing Infrastructure to Reuse (Dependencies Already Met)

| Utility | Location | How Blog Uses It |
|---------|----------|-----------------|
| `ArticleByline` component | `components/ArticleByline.tsx` | Drop-in on every MDX article page; accepts `authorSlug`, `datePublished`, `dateModified` |
| `AUTHORS` + `personSchemaFor()` | `lib/authors.ts` | `author` frontmatter field is an `AuthorSlug`; `personSchemaFor(slug)` produces the E-E-A-T Person node for `BlogPosting.author` |
| `formatBylineDate()` | `lib/authors.ts` | Format `date` frontmatter on listing cards |
| `lastModFor()` | `lib/lastmod.ts` | Pass `.mdx` file path to get git-based `lastmod` for sitemap entries |
| `lib/jsonld.ts` | `lib/jsonld.ts` | Existing JSON-LD serialisation pattern; follow same structure for BlogPosting |
| `entry()` helper | `app/sitemap.ts` | Add blog posts to sitemap without duplicating helper logic |
| `redirects()` array | `next.config.ts` | Append redirect rules; do not replace existing array |
| Design tokens | Tailwind CSS v4 config | `bg-anthracite`, `border-anthracite-light`, `copper`, `offwhite`, `warmgrey` — use on cards and article typography |

---

## Schema.org Decision: `BlogPosting` over `Article`

Use `BlogPosting` (subtype of `Article`) because:
- Content is time-stamped, opinion/expert-driven editorial — exactly what `BlogPosting` signals
- Google treats `BlogPosting` as eligible for the same rich results as `Article`
- `BlogPosting` inherits all `Article` properties; no fields are lost
- The existing editorial pages already use `Article`; using `BlogPosting` on blog pages creates correct type distinction in the schema graph
- Confidence: HIGH — confirmed against Google Search Central Article structured data docs and schema.org/BlogPosting spec

Required `BlogPosting` properties for Google rich results: `headline`, `image`, `datePublished`, `author` (Person node). Add `dateModified`, `description`, `url`, `publisher` (Organization node) for completeness.

---

## MDX Pipeline Decision: `next-mdx-remote/rsc` is the correct import

`next-mdx-remote` v5 added App Router RSC support via the `/rsc` sub-path. The `MDXRemote` component imported from `next-mdx-remote/rsc` is an async Server Component; it accepts a `source` prop (raw MDX string) and renders on the server with zero client bundle impact.

Caveat (MEDIUM confidence): GitHub issues in early 2025 reported instability in `next-mdx-remote` 5.0.0 with Next.js 15.2.x. An actively maintained fork `next-mdx-remote-client` exists as a drop-in alternative. For this project, start with `next-mdx-remote/rsc` and switch to `next-mdx-remote-client` only if rendering issues appear — the API surface is near-identical.

The alternative `@next/mdx` (official, no gray-matter, file-based only) does not support reading content from a `content/blog/` directory into dynamic `[slug]` routes without bespoke build tooling, making it unsuitable for the hybrid JSX + MDX model required here.

---

## Sources

- [Next.js Official MDX Guide](https://nextjs.org/docs/app/guides/mdx)
- [Next.js generateMetadata API Reference](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Next.js Metadata and OG Images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- [next-mdx-remote GitHub — hashicorp](https://github.com/hashicorp/next-mdx-remote)
- [next-mdx-remote RSC issue #488](https://github.com/hashicorp/next-mdx-remote/issues/488)
- [next-mdx-remote-client — maintained fork](https://github.com/ipikuka/next-mdx-remote-client)
- [Google Search Central: Article Structured Data](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Schema.org BlogPosting](https://schema.org/BlogPosting)
- [Article vs BlogPosting for SEO 2026](https://searchenginezine.com/technical/schema/article-vs-blog-schema/)
- [MDX Frontmatter Guide — mdxjs.com](https://mdxjs.com/guides/frontmatter/)
- [Next.js Image Optimization](https://nextjs.org/docs/app/getting-started/images)
- [Common Next.js App Router Mistakes — Vercel](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them)
- [Building a blog with Next.js App Router and MDX — Alex Chan](https://www.alexchantastic.com/building-a-blog-with-next-and-mdx)

---

*Feature research for: MDX Blog — rideprestigo.com*
*Researched: 2026-05-13*
