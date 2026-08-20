---
phase: 54-mdx-infrastructure
plan: "02"
subsystem: blog
tags: [mdx, blog, lib, aggregator, tdd, route]
dependency_graph:
  requires: ["54-01"]
  provides: ["lib/blog.ts", "app/blog/[slug]/page.tsx", "tests/blog.test.ts"]
  affects: ["app/sitemap.ts", "Phase 55 article UI", "Phase 56 JSX migration"]
tech_stack:
  added: ["gray-matter (frontmatter extraction at build time)"]
  patterns: ["TDD RED→GREEN", "build-time fs.readdirSync", "dynamic MDX import with relative path"]
key_files:
  created:
    - tests/blog.test.ts
    - lib/blog.ts
    - app/blog/[slug]/page.tsx
  modified:
    - next.config.ts (remarkGfm removed from createMDX options — Turbopack fix)
decisions:
  - "getAllPosts() reads content/blog/*.mdx via gray-matter at build time; JSX_POSTS hardcoded for 3 legacy articles"
  - "generateStaticParams reads fs directly (not getAllPosts) to exclude JSX slugs from MDX route"
  - "remarkGfm removed from createMDX options: Turbopack cannot serialize function references in loader options"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-05-13"
  tasks_completed: 3
  files_created: 3
  files_modified: 1
---

# Phase 54 Plan 02: Blog Aggregator + MDX Render Route Summary

**One-liner:** BlogPost type + getAllPosts() aggregator merging MDX frontmatter and JSX_POSTS registry, plus minimal MDX render route proving @next/mdx pipeline end-to-end.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 RED: failing tests for getAllPosts() | 8b5df80 | tests/blog.test.ts |
| 2 | GREEN: implement lib/blog.ts | 5427683 | lib/blog.ts |
| 3 | Create app/blog/[slug]/page.tsx + build smoke | 453a8f1 | app/blog/[slug]/page.tsx, next.config.ts |

## Test Results

`npx vitest run tests/blog.test.ts` — **8/8 tests PASS**

| Test | Status |
|------|--------|
| returns a non-empty array | PASS |
| includes all 3 JSX_POSTS slugs | PASS |
| marks all 3 legacy entries with source: 'jsx' | PASS |
| includes at least one MDX-sourced entry | PASS |
| includes the test MDX article from plan 01 | PASS |
| is sorted newest-first by date | PASS |
| every entry has all required BlogPost fields populated | PASS |
| every author resolves to 'roman-ustyugov' | PASS |

## Build Output

`npm run build` — **EXIT 0**

Static routes generated under `/blog/`:
- `/blog/premium-airport-transfer-prague-shortcut` (MDX, statically generated via generateStaticParams)

JSX article slugs (`prague-airport-to-city-center`, `prague-airport-taxi-vs-chauffeur`, `prague-vienna-transfer-vs-train`) correctly absent from generateStaticParams output — they are served by colocated app/ routes, not the MDX dynamic route.

## Dynamic Import Path Verification

`app/blog/[slug]/page.tsx` uses relative path in dynamic import:
```
`../../../content/blog/${slug}.mdx`
```
No `@/` alias used. `grep -c "@/content/blog" app/blog/[slug]/page.tsx` returns 0. Confirmed correct.

## JSX_POSTS Registry (data extracted verbatim from source files, 2026-05-13)

| slug | title | date | coverImage | category |
|------|-------|------|------------|----------|
| prague-airport-to-city-center | Prague Airport to City Centre 2026 — By Passenger Type (Full Guide) | 2026-04-09 | /hero-airport-transfer.webp | Airport Transfer |
| prague-airport-taxi-vs-chauffeur | Prague Airport Taxi vs Chauffeur 2026 — After Uber Took the Rank | 2026-04-09 | /hero-airport-transfer.webp | Airport Transfer |
| prague-vienna-transfer-vs-train | Prague to Vienna 2026: Private Transfer vs Train vs Bus (Honest Guide) | 2026-04-09 | /vienna.png | Intercity Routes |

All three use `author: "roman-ustyugov"` (only valid AuthorSlug). Dates match `ARTICLE_PUBLISHED = '2026-04-09'` verified in source files.

## Phase 54 Success Criteria Checklist

| Criterion | Verification | Status |
|-----------|-------------|--------|
| SC-1: `npm run build` succeeds with @next/mdx | `npm run build` → EXIT 0 | VERIFIED |
| SC-2: Test MDX renders at /blog/premium-airport-transfer-prague-shortcut | Build output lists route; no errors | VERIFIED |
| SC-3: getAllPosts() returns merged newest-first array | 8 tests pass including sort test | VERIFIED |
| SC-4: TypeScript compile passes with BlogPost.author: AuthorSlug | `npx tsc --noEmit` → EXIT 0 | VERIFIED |

**INFRA-04:** lib/blog.ts exports getAllPosts(): BlogPost[] merging MDX + JSX_POSTS sorted newest-first. Proven by 8 passing tests.

**INFRA-05:** BlogPost type defined with author: AuthorSlug. Proven by tsc --noEmit exit 0. Changing author to anything other than 'roman-ustyugov' would fail compile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed remarkGfm from createMDX() options**

- **Found during:** Task 3 — first npm run build attempt
- **Issue:** Turbopack (Next.js 16 default bundler) throws `loader ... does not have serializable options` when a function reference (`remarkGfm`) is passed in createMDX loader options. Turbopack requires plain serializable JavaScript objects in loader options — functions cannot cross the IPC boundary.
- **Fix:** Removed `import remarkGfm from 'remark-gfm'` and changed `remarkPlugins: [remarkGfm]` to `remarkPlugins: []` in `next.config.ts`. Added explanatory comment pointing to Turbopack constraint.
- **Impact:** GFM syntax (tables, strikethrough, task lists) will not render in MDX articles until Phase 55 resolves this. Test article `premium-airport-transfer-prague-shortcut.mdx` uses only standard Markdown — no GFM, so Phase 54 success criteria are unaffected.
- **Files modified:** next.config.ts
- **Commit:** 453a8f1

## Known Stubs

None — `getAllPosts()` is fully wired to real data sources (gray-matter + JSX_POSTS). The MDX route renders the actual test article. No placeholder data flows to UI rendering.

## Threat Surface Scan

No new trust boundaries introduced. All three files are build-time only:
- `lib/blog.ts` runs at build time via `fs.readdirSync` + `gray-matter`. No user input.
- `app/blog/[slug]/page.tsx` has `dynamicParams = false` — only pre-generated slugs served; unknown slugs return 404 from static manifest before reaching any code path.
- `tests/blog.test.ts` is test-only.

Threat register items T-54-03, T-54-04, T-54-05 from plan threat model — all `accept` disposition, no mitigations required.

## Hand-off Note for Phase 55

- `app/blog/[slug]/page.tsx` is the MDX route — replace with full article UI (hero coverImage, ArticleByline, prose styling, CTA, SEO metadata, Schema.org BlogPosting JSON-LD)
- `app/blog/page.tsx` (listing page) does not yet exist — Phase 55 creates it (LIST-01, LIST-02, LIST-03)
- Legacy articles at `/guides/prague-airport-to-city-center`, `/compare/prague-airport-taxi-vs-chauffeur`, `/compare/prague-vienna-transfer-vs-train` remain untouched — Phase 56 handles migration (`git mv`) and 301 redirects
- `remarkGfm` is disabled in `createMDX()` options due to Turbopack serialization constraint — Phase 55 should investigate enabling GFM support (possibly via `turbopack.root` config or waiting for Turbopack fix)
- `getAllPosts()` from `lib/blog.ts` is ready for use in the blog listing page — import and call to get sorted BlogPost[] for card grid

## Self-Check: PASSED

Files verified present:
- FOUND: tests/blog.test.ts
- FOUND: lib/blog.ts
- FOUND: app/blog/[slug]/page.tsx

Commits verified:
- FOUND: 8b5df80 (test(54-02): add failing tests for getAllPosts())
- FOUND: 5427683 (feat(54-02): implement lib/blog.ts getAllPosts aggregator)
- FOUND: 453a8f1 (feat(54-02): add minimal MDX render route to prove pipeline)
