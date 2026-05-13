---
phase: 55-blog-ui-listing-article-pages
plan: "02"
subsystem: blog-ui
tags: [blog, ui, listing, BlogCard, seo, LIST-01, LIST-02, LIST-03]
dependency_graph:
  requires: [55-01]
  provides: [components/BlogCard.tsx, app/blog/page.tsx]
  affects: [app/blog/[slug]/page.tsx, app/sitemap.ts]
tech_stack:
  added: []
  patterns:
    - BlogCard: reusable card component with aria-label, img alt, formatBylineDate
    - blog page: force-static + module-level getAllPosts() + responsive grid
    - metadata: canonical + language alternates + OG image as absolute URL
key_files:
  created:
    - components/BlogCard.tsx
    - app/blog/page.tsx
  modified: []
decisions:
  - "Posts read at module top (build-time) — safe because lib/blog.ts uses node:fs synchronously and page is force-static"
  - "JSX-source posts appear in grid with links to /blog/{slug} — will 404 until Phase 56 (documented and accepted per RESEARCH.md Open Question #2)"
  - "OG image falls back to /hero-airport-transfer.webp if posts array is empty"
metrics:
  duration: "~15 min"
  completed: "2026-05-13"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 0
---

# Phase 55 Plan 02: Blog Listing Page + BlogCard Summary

**One-liner:** /blog listing page with 3-column card grid, full SEO metadata, and accessible BlogCard component wired to getAllPosts() newest-first.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement components/BlogCard.tsx | 796bf2e | components/BlogCard.tsx |
| 2 | Implement app/blog/page.tsx | a6b93f4 | app/blog/page.tsx |
| 3 | Human verify /blog visual + SEO contract | — | Approved by user |

## Commits

- `796bf2e` feat(55-02): implement BlogCard component
- `a6b93f4` feat(55-02): implement /blog listing page with metadata and card grid

## What Was Built

### components/BlogCard.tsx
Reusable card component for the /blog listing grid:
- `<a href="/blog/{slug}" aria-label={post.title}>` — wraps entire card for accessibility
- Cover image: `<img src alt width=800 height=450 loading="lazy" decoding="async">`
- Category label with `var(--copper-light)` (WCAG AA on anthracite-mid: 5.6:1)
- Display-font h2 title with hover transition to copper-light
- Body description text at 13px / line-height 1.8
- Formatted date via `formatBylineDate(post.date)` — uppercase tracked warmgrey
- "Read article ->" CTA in `var(--copper)`
- Card border hover to `var(--copper)`, image hover `scale-[1.02]`

### app/blog/page.tsx
Listing route with:
- `export const dynamic = 'force-static'`
- SEO metadata: title, description, canonical `/blog`, language alternates en + x-default, OG image as absolute URL of first post coverImage
- Hero section: "Prague travel, explained clearly." with copper-pale italic
- Responsive card grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Each card wrapped in `<Reveal variant="up" delay={i * 100}>`
- Empty state: "No articles yet." with Book a Transfer CTA
- Bottom CTA: "Ready to book? Fixed price, door-to-door."

## Test Results

All 5 BlogCard.test.tsx tests GREEN:
- renders title accessible via aria-label on the link
- links to /blog/{slug}
- renders category label
- renders cover image with title as alt text
- renders the formatted date string

TypeScript: `npx tsc --noEmit` exits 0.

## Human Verification

Task 3 checkpoint:human-verify passed. User approved all 8 visual verification points:
1. Hero "Prague travel, explained clearly." with italic copper-pale second clause
2. 4-card grid rendered (1 MDX + 3 JSX legacy entries)
3. Mobile single-column layout confirmed
4. Card hover states: copper border, copper-light title, image scale 1.02
5. MDX card navigates to /blog/premium-airport-transfer-prague-shortcut
6. Page source: correct title, meta description, canonical, OG image tags
7. Tab navigation: focus-visible copper outline on each card link

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data is wired to `getAllPosts()` which returns real MDX + JSX posts.

Note: JSX-source post cards link to `/blog/{slug}` paths which 404 until Phase 56 migration. This is the documented and accepted state per RESEARCH.md Open Question #2, not a stub.

## Threat Flags

None — no new network endpoints or auth paths introduced. All output is static HTML from build-time trusted content (in-repo MDX + JSX_POSTS registry). Threat register T-55-02-01 through T-55-02-04 assessed and mitigated per plan's threat model.

## Self-Check: PASSED

- [x] components/BlogCard.tsx exists
- [x] app/blog/page.tsx exists
- [x] commit 796bf2e exists (feat(55-02): implement BlogCard component)
- [x] commit a6b93f4 exists (feat(55-02): implement /blog listing page with metadata and card grid)
- [x] 5/5 BlogCard tests GREEN
- [x] TypeScript clean
- [x] Human checkpoint approved by user
