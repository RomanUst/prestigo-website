---
phase: 55-blog-ui-listing-article-pages
plan: "03"
subsystem: blog
tags: [blog, mdx, article, seo, jsonld, sitemap]
dependency_graph:
  requires: [55-01]
  provides: [ART-01, ART-02, ART-03, ART-04, ART-05]
  affects: [app/blog/[slug]/page.tsx, lib/blog-jsonld.ts, mdx-components.tsx, app/sitemap.ts]
tech_stack:
  added: []
  patterns:
    - Schema.org @graph with BreadcrumbList + BlogPosting
    - MDX prose component mapping via useMDXComponents
    - MDX-only generateStaticParams (JSX_POSTS excluded)
    - Sitemap filter on source === 'mdx'
key_files:
  created: []
  modified:
    - lib/blog-jsonld.ts
    - mdx-components.tsx
    - app/blog/[slug]/page.tsx
    - app/sitemap.ts
decisions:
  - "font-normal (not font-medium) on <strong> — design system forbids weights 500/600/700"
  - "BlogPosting @type (not Article) — locked in STATE.md Phase 55 decisions"
  - "dynamicParams=false + slug allowlist regex preserved verbatim from Phase 54"
  - "JSX_POSTS not referenced anywhere in generateStaticParams (ART-02)"
metrics:
  duration: "~10 min"
  completed_date: "2026-05-13"
  tasks_completed: 5
  tasks_total: 5
  files_modified: 4
---

# Phase 55 Plan 03: Article Page Full UI + SEO + Sitemap Summary

**One-liner:** MDX article page with BlogPosting JSON-LD, Prestigo prose styling, full SEO metadata, and sitemap registration — two RED test suites turned GREEN.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Implement lib/blog-jsonld.ts buildBlogPostingJsonLd | 4eef0d1 | DONE |
| 2 | Upgrade mdx-components.tsx with Prestigo prose mappings | a26b9e9 | DONE |
| 3 | Replace app/blog/[slug]/page.tsx with full article UI + SEO + JSON-LD | b6e78a1 | DONE |
| 4 | Add /blog + MDX /blog/{slug} entries to app/sitemap.ts | f2c01da | DONE |
| 5 | Human verify article page + 404 behaviour + sitemap.xml | — | APPROVED |

## What Was Built

### lib/blog-jsonld.ts
Implemented `buildBlogPostingJsonLd(post: BlogPost)` replacing the throwing stub from Plan 01. Returns `{ '@context': 'https://schema.org', '@graph': [BreadcrumbList, BlogPosting] }`:
- BreadcrumbList: 3 items (Home → Blog → post.title)
- BlogPosting: headline, description, ImageObject (absolute URL), personSchemaFor(author), publisher @id reference, datePublished, dateModified (falls back to date), url (absolute)

### mdx-components.tsx
Full Prestigo prose mapping for MDX-rendered HTML:
- h2/h3: Cormorant Garamond font-light, offwhite
- p: Montserrat font-light 14px warmgrey
- ul/li: custom copper bullet dots via inline `<span>`
- strong: text-offwhite font-normal (design system forbids 500/600/700)
- a: copper-light underline
- blockquote: copper left border, display font italic
- hr: border-anthracite-light

### app/blog/[slug]/page.tsx
Full article page replacing Phase 54 minimal scaffold:
- Phase 54 invariants preserved: `force-static`, `dynamicParams=false`, slug allowlist regex, relative dynamic import path
- Hero section: category label (copper-light), copper-line, h1, description, ArticleByline
- Hero image: full-bleed 16/9, max-w-4xl
- MDX body: max-w-3xl prose container
- Bottom CTA: "Skip the taxi rank. Chauffeur inside Arrivals."
- `generateMetadata`: og:title, og:description, og:image (absolute), canonical /blog/{slug}, x-default hreflang
- BlogPosting JSON-LD emitted in `<script type="application/ld+json">`
- JSX_POSTS not referenced anywhere (ART-02)

### app/sitemap.ts
Added blog entries:
- `entry('/blog', 'app/blog/page.tsx')` — listing page hub
- `...mdxBlogEntries` — one entry per MDX file, filtered `source === 'mdx'`
- Existing /guides/* and /compare/* entries preserved (Phase 56 will remove them)

## Test Results

| Suite | Before | After |
|-------|--------|-------|
| tests/blog-jsonld.test.ts | RED (throwing stub) | GREEN (7/7) |
| tests/sitemap.test.ts | RED | GREEN (4/4) |

## Human Verification (Task 5)

User approved all 6 visual checks on 2026-05-13:
- Hero renders category label, copper-line, title, description, ArticleByline
- Cover image renders 16:9 full-width below hero
- MDX body uses Cormorant Garamond (h2/h3) + Montserrat 14px (p) with copper bullet dots
- Bottom CTA "Skip the taxi rank. Chauffeur inside Arrivals." present with Book button
- `application/ld+json` script contains `"@type":"BlogPosting"`, BreadcrumbList, personSchemaFor author block
- `/blog/non-existent-slug` returns HTTP 404
- sitemap.xml contains `/blog` and `/blog/premium-airport-transfer-prague-shortcut`; does NOT contain `/blog/prague-airport-to-city-center` (JSX slug)

## Deviations from Plan

None — plan executed exactly as written.

Note: `npx tsc --noEmit` reports one pre-existing error (`tests/BlogCard.test.tsx` — missing `@/components/BlogCard` from Plan 02). This is out of scope for Plan 03 and does not affect our files.

## Known Stubs

None. All plan goals implemented. BlogCard component referenced in tests/BlogCard.test.tsx is a Plan 02 concern, not a stub in Plan 03 files.

## Self-Check

Files created/modified:
- lib/blog-jsonld.ts — EXISTS
- mdx-components.tsx — EXISTS
- app/blog/[slug]/page.tsx — EXISTS
- app/sitemap.ts — EXISTS

Commits:
- 4eef0d1 — feat(55-03): implement buildBlogPostingJsonLd
- a26b9e9 — feat(55-03): upgrade mdx-components.tsx
- b6e78a1 — feat(55-03): replace blog article scaffold
- f2c01da — feat(55-03): add /blog + MDX entries to sitemap

## Self-Check: PASSED
