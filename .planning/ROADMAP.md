# Roadmap: Prestigo — Milestone v1.0 SEO Blog

## Overview

Build an MDX-powered blog at `/blog` that captures organic search traffic and migrates three existing editorial articles from scattered `/guides` and `/compare` routes into a single canonical hub. The milestone delivers a complete content pipeline: MDX infrastructure, listing and article UI, and atomic URL migration with 301 redirects and sitemap reconciliation.

## Milestones

- 🚧 **v1.0 SEO Blog** - Phases 54-56 (in progress)

## Phases

### 🚧 v1.0 SEO Blog (In Progress)

**Milestone Goal:** Scalable MDX blog at `/blog` with full SEO wiring, unified listing, and migrated legacy articles accessible at canonical `/blog/*` paths.

- [x] **Phase 54: MDX Infrastructure** - Install @next/mdx pipeline, create lib/blog.ts aggregator and content/blog/ directory (completed 2026-05-13)
- [ ] **Phase 55: Blog UI — Listing + Article Pages** - Build /blog listing card grid and /blog/[slug] MDX article renderer with full SEO metadata
- [ ] **Phase 56: Article Migration + SEO Wiring** - git mv 3 JSX articles to /blog/*, update all 9 canonical URL locations, add 301 redirects, reconcile sitemap

## Phase Details

### Phase 54: MDX Infrastructure
**Goal**: The MDX compilation pipeline is installed and proven end-to-end; `lib/blog.ts` aggregates both MDX frontmatter and JSX article metadata into a single sorted `BlogPost[]`
**Depends on**: Nothing (first phase of this milestone; builds on existing Next.js 16 codebase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. `next build` succeeds with `@next/mdx` installed, `createMDX()` wrapper in `next.config.ts`, and `mdx-components.tsx` present at repo root
  2. A test MDX file in `content/blog/` with valid frontmatter (title, description, date, coverImage, category, author) renders at a route without build errors
  3. `getAllPosts()` from `lib/blog.ts` returns a merged, newest-first array containing both MDX-sourced posts (via gray-matter) and the hardcoded `JSX_POSTS` registry entries
  4. TypeScript compilation passes with the `BlogPost` type enforcing all required frontmatter fields including `author` typed as `AuthorSlug`
**Plans**: 2 plans
  - [x] 54-01-PLAN.md — Install @next/mdx pipeline, wrap next.config.ts, create mdx-components.tsx + test MDX article
  - [x] 54-02-PLAN.md — Implement lib/blog.ts (BlogPost type + getAllPosts + JSX_POSTS) and minimal app/blog/[slug]/page.tsx render route
**UI hint**: no

### Phase 55: Blog UI — Listing + Article Pages
**Goal**: Visitors can browse all blog posts on `/blog` and read any MDX article at `/blog/[slug]` with correct SEO metadata, Schema.org `BlogPosting`, and Prestigo design system styling
**Depends on**: Phase 54
**Requirements**: LIST-01, LIST-02, LIST-03, ART-01, ART-02, ART-03, ART-04, ART-05
**Success Criteria** (what must be TRUE):
  1. `/blog` renders a card grid sorted newest-first; each card shows coverImage, copper category label, title, description, and formatted date; cards link to `/blog/[slug]`
  2. `/blog` has correct `<title>`, `<meta name="description">`, canonical `/blog`, and OG tags; the page appears in `sitemap.xml` with a valid `lastmod`
  3. `/blog/[slug]` for a valid MDX article renders the hero image, `ArticleByline`, full MDX body, and a bottom CTA — all within the Prestigo dark-theme design system
  4. Each MDX article page has unique `og:title`, `og:description`, `og:image` (= coverImage), canonical `/blog/[slug]`, and a `Schema.org BlogPosting` JSON-LD block with author via `personSchemaFor()`
  5. `/blog/non-existent-slug` returns HTTP 404 (`dynamicParams = false` confirmed); JSX article slugs are absent from `generateStaticParams()` output
**Plans**: TBD
**UI hint**: yes

### Phase 56: Article Migration + SEO Wiring
**Goal**: Three legacy JSX articles are permanently accessible at `/blog/*` canonical URLs; old `/guides/*` and `/compare/*` paths 301-redirect to the new locations; sitemap reflects only the new paths; no contradictory canonical signals remain
**Depends on**: Phase 55
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06
**Success Criteria** (what must be TRUE):
  1. All 3 JSX articles are moved via `git mv` in their own atomic commit and render correctly at `/blog/prague-airport-to-city-center`, `/blog/prague-airport-taxi-vs-chauffeur`, and `/blog/prague-vienna-transfer-vs-train`
  2. `grep -rn "guides\|/compare" app/blog/` returns zero hits — all 9 URL locations per file (canonical, hreflang x2, OG url, 5 Schema.org @id/url fields) reference `/blog/*` via `const CANONICAL_PATH`
  3. `curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center` shows a single 301 hop to `/blog/prague-airport-to-city-center` with no redirect chain; same verified for all 5 redirect rules
  4. `sitemap.xml` contains `/blog`, `/blog/prague-airport-to-city-center`, `/blog/prague-airport-taxi-vs-chauffeur`, `/blog/prague-vienna-transfer-vs-train` and contains no `/guides/*` or `/compare/*` entries
  5. `lastModFor()` returns a real date for each moved file (git history at new path is intact from the `git mv` commit)
**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:** 54 → 55 → 56

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 54. MDX Infrastructure | 2/2 | Complete    | 2026-05-13 |
| 55. Blog UI — Listing + Article Pages | 0/? | Not started | - |
| 56. Article Migration + SEO Wiring | 0/? | Not started | - |
