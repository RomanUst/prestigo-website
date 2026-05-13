---
phase: 55-blog-ui-listing-article-pages
plan: "01"
subsystem: blog-testing
tags: [blog, testing, tdd, wave-0, mdx]
completed_date: "2026-05-13"
duration_minutes: 12
tasks_completed: 3
files_created: 4
files_modified: 0

dependency_graph:
  requires: []
  provides:
    - tests/BlogCard.test.tsx
    - tests/blog-jsonld.test.ts
    - tests/sitemap.test.ts
    - lib/blog-jsonld.ts
  affects:
    - Plan 55-02 (BlogCard component — turns BlogCard.test RED→GREEN)
    - Plan 55-03 (article page + sitemap — turns blog-jsonld and sitemap tests RED→GREEN)

tech_stack:
  added: []
  patterns:
    - "TDD Wave 0: RED stubs committed before any UI code"
    - "vi.hoisted pattern not needed here (no module mocks required)"
    - "blog-jsonld.ts helper stub: throws to guarantee RED tests"

key_files:
  created:
    - tests/BlogCard.test.tsx
    - tests/blog-jsonld.test.ts
    - tests/sitemap.test.ts
    - lib/blog-jsonld.ts
  modified: []

key_decisions:
  - "lib/blog-jsonld.ts stub throws Error (not returns undefined) to ensure all 7 tests fail loudly and immediately"
  - "sitemap.test.ts: test 3 (JSX_POSTS not in /blog) correctly passes in RED state — that is expected behavior (no JSX slugs should appear under /blog)"
  - "BlogCard.test.tsx uses jsdom environment (default vitest config) matching existing component test pattern"

commits:
  - hash: 6cf23a2
    message: "test(55-01): add RED stub BlogCard.test.tsx for LIST-02 field rendering"
  - hash: 22ea5fa
    message: "test(55-01): add RED stub blog-jsonld.test.ts + helper stub for ART-04 BlogPosting schema"
  - hash: 7c2676c
    message: "test(55-01): add RED stub sitemap.test.ts for ART-05 /blog sitemap entries"
---

# Phase 55 Plan 01: Wave 0 RED Test Stubs Summary

**One-liner:** Three RED test stubs for BlogCard rendering, BlogPosting JSON-LD schema, and sitemap /blog entries — gating Plans 02 and 03 via TDD contract.

## What Was Built

Three Wave 0 TDD stub files committed before any UI code. Each stub fails for the documented reason so that downstream plans can drive RED -> GREEN.

### tests/BlogCard.test.tsx (LIST-02)

5 tests asserting BlogCard field rendering:
- Title accessible as link (`getByRole('link', { name: post.title })`)
- Link href equals `/blog/${post.slug}`
- Category label present
- Cover image with `alt === post.title` and `src === post.coverImage`
- Formatted date string via `formatBylineDate(post.date)`

**RED reason:** `components/BlogCard.tsx` does not exist. Vitest fails at import resolution.

### lib/blog-jsonld.ts + tests/blog-jsonld.test.ts (ART-04)

Minimal helper stub (`buildBlogPostingJsonLd`) that throws `"not implemented"`. 7 tests:
- `@context` is `https://schema.org`, `@graph` has length 2
- `@graph[0]` is BreadcrumbList with 3 items
- `@graph[1]` is `BlogPosting` (not `Article`)
- `image.url` is absolute `https://rideprestigo.com{coverImage}`
- `author` equals `personSchemaFor(post.author)`
- `datePublished`/`dateModified` defaults
- `url` is absolute canonical `/blog/{slug}`

**RED reason:** Helper throws on every call. All 7 tests fail with `Error: buildBlogPostingJsonLd not implemented`.

### tests/sitemap.test.ts (ART-05)

4 tests for sitemap /blog coverage:
- `/blog` listing URL present
- MDX test post slug `premium-airport-transfer-prague-shortcut` present
- JSX_POSTS slugs NOT in `/blog/*` (Phase 56 concern — passes in RED state, correct)
- Every `/blog/*` entry has `lastModified Date` and `en`/`x-default` alternates

**RED reason:** `app/sitemap.ts` has no `/blog` entries. 3 of 4 tests fail; test 3 (JSX exclusion) passes — this is expected.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — test-only plan, no runtime boundaries crossed.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| tests/BlogCard.test.tsx exists | FOUND |
| tests/blog-jsonld.test.ts exists | FOUND |
| tests/sitemap.test.ts exists | FOUND |
| lib/blog-jsonld.ts exists | FOUND |
| commit 6cf23a2 exists | FOUND |
| commit 22ea5fa exists | FOUND |
| commit 7c2676c exists | FOUND |
| All 3 test files fail (RED) | CONFIRMED — 3 failed, 1 passed (expected) |
