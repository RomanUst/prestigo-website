# Project Research Summary

**Project:** Prestigo — MDX Blog Milestone
**Domain:** Hybrid JSX + MDX blog on Next.js 16 App Router
**Researched:** 2026-05-13
**Confidence:** HIGH

---

## Executive Summary

The MDX blog milestone adds a `/blog` listing page, new MDX article pages at `/blog/[slug]`, and migrates three existing JSX articles from `/guides/` and `/compare/` to `/blog/`. The canonical approach for this architecture is `@next/mdx` (the official, Vercel-maintained package) combined with `gray-matter` for listing-page frontmatter extraction. The previously-common alternative, `next-mdx-remote`, was archived on 2026-04-09 and must not be used; its RSC mode was broken on Next.js 15.2+ with no fix before archival.

The recommended architecture is a hybrid static model: named JSX article directories (`app/blog/<slug>/page.tsx`) coexist with a single dynamic MDX route (`app/blog/[slug]/page.tsx`). Next.js App Router gives named directories inherent routing priority over dynamic segments — no configuration is required. The unifying layer is `lib/blog.ts`, a server-only aggregator that merges a hardcoded `JSX_POSTS` registry with MDX frontmatter extracted via `gray-matter` and `fs.readdirSync`. All blog routes build fully static output; no runtime rendering or ISR is needed at current content volume.

The primary risk area is the URL migration. Each of the three existing JSX articles encodes its old path in nine distinct locations (canonical, hreflang, OG url, and five Schema.org `@id`/`url` fields). Partial updates cause canonical mismatches that suppress Google rich results. The recommended mitigation is a `const CANONICAL_PATH` constant at the top of each migrated file, referenced everywhere. Secondary risks are redirect-chain creation from overlapping wildcard patterns and leaving old paths in `sitemap.ts` after migration — both of which send contradictory canonical signals to Googlebot.

---

## Key Findings

### Recommended Stack

`@next/mdx` is the only viable MDX compiler for this project as of May 2026. It integrates with the existing `next.config.ts` via the `createMDX` wrapper, supports Turbopack, and requires no serialization step — MDX files compile through webpack at build time with the full content tree available to RSC.

For the listing page, `gray-matter` reads YAML frontmatter from `.mdx` files at build time without invoking the full MDX compiler. This is the correct separation of concerns: gray-matter for aggregation/sorting in `lib/blog.ts`, `@next/mdx` dynamic import for article rendering. `remark-gfm` (ESM-only, v4) adds GFM table support and is required for the blog content style.

**Core technologies:**
- `@next/mdx ^16.2.5`: MDX compilation pipeline — the only maintained, officially supported option (`next-mdx-remote` archived April 2026)
- `gray-matter ^4.0.3`: Frontmatter extraction for `lib/blog.ts` listing aggregation — battle-tested, zero breaking-change history; handles YAML efficiently without full MDX compilation
- `remark-gfm ^4.0.1`: GFM table/strikethrough support — ESM-only, compatible with MDX v3 remark pipeline
- `rehype-pretty-code ^0.14.3` + `shiki ^4.0.2`: Optional server-side syntax highlighting — add when code blocks appear in articles
- `@tailwindcss/typography`: Prose rhythm classes for article body — verify installation with `npm ls` before adding

**Critical version note:** `@next/mdx` version must match the installed Next.js version (currently `^16.2.3`). Do not install mismatched versions.

### Expected Features

All features required for launch are low-to-medium complexity because the project already has `ArticleByline`, `personSchemaFor()`, `lastModFor()`, `lib/jsonld.ts`, `formatBylineDate()`, and the sitemap `entry()` helper. The blog milestone assembles existing building blocks rather than building new infrastructure.

**Must have (table stakes):**
- `/blog` listing page: card grid sorted newest-first with coverImage, category badge, title, description, date
- `/blog/[slug]` MDX article pages: hero image, ArticleByline, full MDX render
- `generateMetadata()` per article: unique title, description, canonical, OG, `og:type = article`
- Schema.org `BlogPosting` JSON-LD per article — use `BlogPosting` (not `Article`): it is a more specific subtype eligible for the same Google rich results; signals time-stamped editorial content; creates correct type distinction from existing editorial pages that use `Article`
- 301 redirects from old `/guides/*` and `/compare/*` paths to `/blog/*`
- Sitemap update: old paths removed, `/blog/*` added atomically in the same deploy as redirects

**Should have (competitive differentiators):**
- `dateModified` frontmatter field: triggers "Updated" label in ArticleByline and Google freshness signal
- Hybrid JSX + MDX listing unified in `lib/blog.ts`: hides JSX/MDX distinction from readers and crawlers
- `lastmod` from `lastModFor()` for MDX files: consistent with existing editorial pages
- `og:type = article` + `publishedTime` + `authors` in `generateMetadata`: richer social share previews
- Reading time estimate: computed at build time from raw MDX source word count; stored in `BlogPost`

**Defer (v2+):**
- Category filter via `?category=` search param: useful only when 10+ articles per category exist
- Pagefind static search: justified only at 50+ articles
- Table of contents: add as Phase 2 once article pipeline is stable
- Pagination: unnecessary below 40 articles
- Dynamic OG image generation: static `coverImage` is a stronger brand signal for a premium chauffeur service

### Architecture Approach

The architecture separates three concerns: (1) content discovery and aggregation in `lib/blog.ts`, (2) rendering in route files, and (3) MDX element mapping in the required `mdx-components.tsx`. `lib/blog.ts` is the keystone — every consumer (listing page, article `generateStaticParams`, sitemap, redirects) depends on it. The listing page and sitemap call `getAllPosts()` which merges gray-matter-parsed MDX frontmatter with the hardcoded `JSX_POSTS` registry. The MDX article renderer uses `await import('@/content/${slug}.mdx')` at build time, giving it the compiled MDX component without a separate filesystem read.

**Major components:**
1. `lib/blog.ts` — `BlogPost` type, `JSX_POSTS` registry, `getAllPosts()`: aggregates both content sources; must exist before any other file can be built
2. `mdx-components.tsx` (project root) — global MDX element overrides: required by `@next/mdx`; build fails without it; must be created first in the infrastructure phase
3. `app/blog/page.tsx` — listing page: calls `getAllPosts()`, renders `BlogCard` grid; purely static Server Component
4. `app/blog/[slug]/page.tsx` — MDX article renderer: `generateStaticParams` reads only `content/blog/*.mdx` files; `dynamicParams = false` mandatory; JSX slugs must never appear here
5. `app/blog/<named-slug>/page.tsx` — migrated JSX articles: named directories automatically shadow the `[slug]` dynamic segment (built-in Next.js routing behavior, no config needed)
6. `components/BlogCard.tsx` — listing card with coverImage, category badge, title, description, date
7. `components/BlogArticleLayout.tsx` — prose wrapper for MDX articles

### Critical Pitfalls

1. **`next-mdx-remote` archived — do not install** — FEATURES.md contains residual references to `next-mdx-remote/rsc`; these are superseded by STACK.md and ARCHITECTURE.md. The correct package is `@next/mdx`. `next-mdx-remote` is archived (April 2026) with RSC mode broken on Next.js 15.2+. Use `next-mdx-remote-client` only if MDX content must be fetched from an external source (not applicable here).

2. **9 URL locations per migrated article file** — Each JSX article encodes its canonical path in: `alternates.canonical`, `alternates.languages.en`, `alternates.languages['x-default']`, `openGraph.url`, BreadcrumbList `@id`, BreadcrumbList last `ListItem.item`, Article `@id`, Article `url`, FAQPage `@id`. Updating only the `metadata` export misses five Schema.org fields. Fix: add `const CANONICAL_PATH = '/blog/<slug>'` at the top of each file and reference it in all nine locations. Verify with `grep -n "guides\|compare" app/blog/<slug>/page.tsx` — expect zero hits.

3. **`generateStaticParams` must exclude JSX article slugs** — Including migrated slugs causes build-time "Conflicting SSG paths" error. `generateStaticParams` in `app/blog/[slug]/page.tsx` must read only from `content/blog/*.mdx`. Set `export const dynamicParams = false` immediately; verify `/blog/non-existent-slug` returns HTTP 404.

4. **`mdx-components.tsx` must be created first** — `@next/mdx` requires this file at the project root before the build succeeds. It must export `useMDXComponents()`. Create it as the first action of the infrastructure phase.

5. **`git mv` in its own commit before sitemap path updates** — `lastModFor()` uses `git log -1` on the file path. If `sitemap.ts` references `app/blog/<slug>/page.tsx` before `git mv` has committed that path, git returns no history and `lastModFor()` returns `undefined`. Commit each `git mv` first; verify `git log -1 -- app/blog/<slug>/page.tsx` returns a real date; then update the sitemap in a subsequent commit.

6. **Redirect chains from overlapping wildcard patterns** — Using `source: '/compare/:path*'` as a catch-all conflicts with individual-slug rules, creating multi-hop redirects. Use exact `source` paths for every rule. Verify single-hop with `curl -sIL` after deploy.

7. **Sitemap and redirects must deploy atomically** — Deploying redirects without removing old paths from `sitemap.ts` contradicts the canonical signal. The old `entry()` calls for `/compare/*` and `/guides/*` must be removed and new `/blog/*` entries added in the same deployment as the redirect rules.

---

## Implications for Roadmap

Based on the dependency graph in architecture research, three phases emerge naturally.

### Phase 1: Infrastructure (MDX Pipeline)

**Rationale:** Everything depends on the MDX compilation pipeline and `lib/blog.ts` aggregator existing. The build fails without `mdx-components.tsx`. The listing page, article renderer, sitemap, and migration all depend on `getAllPosts()`. No external dependencies — start here.

**Delivers:** Working MDX pipeline end-to-end validated with one real MDX article; `lib/blog.ts` with `BlogPost` type, `JSX_POSTS` registry, and `getAllPosts()`; `content/blog/` directory; `app/blog/[slug]/page.tsx` skeleton with `generateStaticParams` + `dynamicParams = false` verified (HTTP 404 on unknown slug confirmed).

**Implements:** `@next/mdx` install and `next.config.ts` `createMDX` wrapper; `mdx-components.tsx` at project root (first file created); `lib/blog.ts`; `content/blog/` directory.

**Avoids:** `mdx-components.tsx` missing (build fails); JSX slugs in `generateStaticParams` (build conflict); `fs` in edge runtime (add warning comments to `lib/blog.ts` and `sitemap.ts` now).

**Research flag:** Standard patterns — skip `/gsd-research-phase`. `@next/mdx` install is fully documented in Next.js 16 official guide (verified 2026-05-13).

---

### Phase 2: Listing + Article UI

**Rationale:** Depends on Phase 1's `lib/blog.ts` and verified MDX rendering. All required utilities (`ArticleByline`, `personSchemaFor`, `formatBylineDate`, `lib/jsonld.ts`) already exist — this phase is assembly, not construction.

**Delivers:** `/blog` listing page with card grid; `/blog/[slug]` MDX article pages with hero image, ArticleByline, MDX render, `generateMetadata`, canonical, OG, `og:type = article`, Schema.org `BlogPosting` JSON-LD.

**Implements:** `app/blog/page.tsx`; `components/BlogCard.tsx`; `components/BlogArticleLayout.tsx`; `generateMetadata()` on both pages; Schema.org `BlogPosting` (reuse `lib/jsonld.ts` and `personSchemaFor()` patterns).

**Avoids:** `BlogPosting` vs `Article` type confusion (use `BlogPosting`); duplicate Nav/Footer in `app/blog/layout.tsx` (add prose container only, not chrome).

**Research flag:** Standard patterns — skip `/gsd-research-phase`. Schema.org `BlogPosting` spec and Next.js `generateMetadata` API are well-documented with HIGH-confidence sources.

---

### Phase 3: JSX Migration + SEO Wiring

**Rationale:** Must come last because migrated JSX articles require blog infrastructure from Phases 1–2 (ArticleByline, sitemap pattern, redirect array). Redirects must not deploy before destination pages exist. This phase deploys atomically: file moves + canonical updates + redirects + sitemap changes in a single deployment.

**Delivers:** Three migrated articles at `/blog/<slug>` with updated canonicals in all 9 URL locations; 301 redirects from `/guides/*` and `/compare/*`; sitemap updated with `/blog/*` entries and old paths removed; `lastModFor()` returning valid dates for moved files.

**Implements:** `git mv` for each JSX article in its own commit (before sitemap updates); `const CANONICAL_PATH` pattern in each migrated file; exact-path redirect rules in `next.config.ts`; `app/sitemap.ts` additions and old-path deletions; Search Console sitemap resubmission.

**Avoids:** 9 URL locations pitfall (`CANONICAL_PATH` constant); redirect chains (exact source paths); split sitemap/redirect deployment; `lastModFor()` broken path (`git mv` committed first); 308 caching wrong destination (verify all destination paths before `permanent: true`).

**Research flag:** Pre-implementation: read the current `redirects()` array in `next.config.ts` to identify existing patterns before appending. No full `/gsd-research-phase` needed.

---

### Phase Ordering Rationale

- `mdx-components.tsx` must precede any MDX compilation — build fails without it.
- `lib/blog.ts` must precede listing page, article `generateStaticParams`, and sitemap — all three are consumers.
- `app/blog/[slug]/page.tsx` with `dynamicParams = false` must be deployed before any redirects are live — visitors following a redirect to `/blog/<slug>` must not hit 404.
- Sitemap changes and redirect rules must ship in the same deployment — split deployment creates contradictory canonical signals that can take weeks for Google to resolve.
- `git mv` commits must precede sitemap updates — `lastModFor()` depends on git history at the new path.

### Research Flags

Phases with standard patterns (skip `/gsd-research-phase`):
- **Phase 1 (Infrastructure):** `@next/mdx` setup is a first-party workflow in Next.js 16 official docs (verified 2026-05-13).
- **Phase 2 (Listing + Article UI):** Schema.org `BlogPosting`, `generateMetadata`, and existing utility reuse are all HIGH-confidence established patterns.

Phases that warrant a pre-implementation file inspection (not full research):
- **Phase 3 (Migration):** Read current `redirects()` in `next.config.ts` and `sitemap.ts` before writing migration code to avoid accidental pattern overlap with existing rules.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against Next.js 16.2.6 official docs and npm registry as of 2026-05-13; `next-mdx-remote` archival confirmed from GitHub |
| Features | HIGH | All features straightforward; existing infrastructure (`ArticleByline`, `personSchemaFor`, `lastModFor`) confirmed in codebase; `BlogPosting` decision verified against Google Search Central and schema.org |
| Architecture | HIGH | Hybrid routing behavior verified against Next.js 16.2.6 official routing docs; `dynamicParams = false` behavior verified; `@next/mdx` dynamic import pattern from official guide |
| Pitfalls | HIGH | 9 URL locations verified by direct inspection of existing JSX article files; redirect and sitemap pitfalls verified against Next.js docs and Google Search Central |

**Overall confidence:** HIGH

### Gaps to Address

- **FEATURES.md internal inconsistency:** FEATURES.md references `next-mdx-remote/rsc` in its dependency diagram and MDX pipeline section. This is superseded by STACK.md and ARCHITECTURE.md which correctly mandate `@next/mdx`. During Phase 1, follow STACK.md and ARCHITECTURE.md; disregard the `next-mdx-remote` references in FEATURES.md entirely.

- **gray-matter vs exported const frontmatter:** ARCHITECTURE.md recommends using `export const metadata = { ... }` inside MDX files (avoiding gray-matter for rendering), while STACK.md recommends gray-matter for listing-page frontmatter extraction. These are complementary: use gray-matter in `lib/blog.ts` for efficient frontmatter extraction without full MDX compilation; use `await import('@/content/${slug}.mdx')` in the article renderer for the compiled MDX component. The roadmap should reflect this dual pattern explicitly.

- **`@tailwindcss/typography` presence:** Research flags this as "likely available" but recommends checking before adding. Verify with `npm ls @tailwindcss/typography` before Phase 2 begins.

- **Cover image dimensions for MDX articles:** Research establishes the `public/blog/*.avif` convention but does not specify required `width`/`height` values. Declare explicit dimensions on `next/image` cover images to avoid CLS. Add `fs.existsSync` check in `lib/blog.ts` for `coverImage` paths as a build-time guard against broken images.

---

## Sources

### Primary (HIGH confidence)
- [Next.js 16.2.6 Official MDX Guide](https://nextjs.org/docs/app/guides/mdx) — `@next/mdx` install, `mdx-components.tsx` requirement, `pageExtensions`, `createMDX` wrapper, dynamic import pattern
- [Next.js 16.2.6 Dynamic Routes docs](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes) — named directory routing precedence, `dynamicParams`, `generateStaticParams`
- [Next.js 16.2.6 generateMetadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) — OG, canonical, `og:type = article`
- [Next.js 16.2.6 redirects config](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects) — `permanent: true` = 308 behavior
- [hashicorp/next-mdx-remote GitHub — issue #488](https://github.com/hashicorp/next-mdx-remote/issues/488) — archival date 2026-04-09, unresolved RSC issue
- [Google Search Central: Article Structured Data](https://developers.google.com/search/docs/appearance/structured-data/article) — `BlogPosting` eligibility for rich results
- [Schema.org/BlogPosting](https://schema.org/BlogPosting) — required properties for Google rich results
- [Google Search Central: Site moves with URL changes](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) — redirect and sitemap canonical interaction
- [Next.js Conflicting SSG paths error docs](https://nextjs.org/docs/messages/conflicting-ssg-paths) — `generateStaticParams` + named directory conflict behavior

### Secondary (MEDIUM confidence)
- [ipikuka/next-mdx-remote-client](https://github.com/ipikuka/next-mdx-remote-client) — drop-in alternative if remote MDX content ever needed; v2.1.10 tested with next@16
- [rehype-pretty-code official site](https://rehype-pretty.pages.dev/) — syntax highlighting approach; add only when code blocks are needed
- [Vercel: Common Next.js App Router Mistakes](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them) — RSC boundaries, layout pitfalls

### Tertiary
- Direct codebase inspection — 9 URL locations per JSX article file verified by reading existing `/guides/` and `/compare/` page.tsx files
- [Next.js sitemap.xml file convention docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap) — sitemap + edge runtime limitations

---
*Research completed: 2026-05-13*
*Ready for roadmap: yes*
