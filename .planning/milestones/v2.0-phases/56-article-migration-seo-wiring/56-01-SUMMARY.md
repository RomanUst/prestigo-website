---
phase: 56-article-migration-seo-wiring
plan: 01
subsystem: seo, content, routing
tags: [git-mv, seo, canonical, schema-org, tdd, blog, migration]

# Dependency graph
requires:
  - phase: 55-blog-article-page
    provides: app/blog/[slug]/page.tsx MDX route, lib/blog.ts JSX_POSTS registry (MIG-06 pre-done)
provides:
  - 3 JSX articles physically at app/blog/<slug>/page.tsx with git history intact
  - All 30 URL occurrences (10 per file) rewritten via const CANONICAL_PATH / CANONICAL_ABS
  - BreadcrumbList position-2 name is "Blog" (not "Guides"/"Compare")
  - Inverted sitemap test in RED state (TDD prerequisite for Plan 03)
affects: [56-02, 56-03, 56-04, sitemap, redirects]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "const CANONICAL_PATH + CANONICAL_ABS: single source of truth for all 10 URL locations per JSX article"
    - "git mv atomic commit: isolates rename from content edits for clean git log --follow history"
    - "TDD RED first: sitemap test inverted before sitemap.ts update, ensuring Plan 03 has a failing target"

key-files:
  created: []
  modified:
    - app/blog/prague-airport-to-city-center/page.tsx
    - app/blog/prague-airport-taxi-vs-chauffeur/page.tsx
    - app/blog/prague-vienna-transfer-vs-train/page.tsx
    - tests/sitemap.test.ts

key-decisions:
  - "git mv (not cp+rm) is mandatory — lib/lastmod.ts uses git log --follow; cp+rm would orphan history and break sitemap lastModified dates"
  - "Two-commit strategy: bare rename commit first, URL rewrite second — isolates R100 rename in git log --name-status"
  - "CANONICAL_ABS as template literal (not string concatenation) — consistent with existing codebase patterns"

patterns-established:
  - "Pattern: const CANONICAL_PATH = '/blog/<slug>' + const CANONICAL_ABS = backtick-https://rideprestigo.com${CANONICAL_PATH} — apply to every future JSX article migration"
  - "Pattern: git mv target directories must be created with mkdir -p before git mv or git mv fails"

requirements-completed: [MIG-01, MIG-02, MIG-06]

# Metrics
duration: 15min
completed: 2026-05-14
---

# Phase 56 Plan 01: JSX Article git mv + Canonical URL Rewrite Summary

**Three legacy JSX articles moved from app/guides/ and app/compare/ to app/blog/ via atomic git mv (history preserved for lastModFor()), all 30 URL occurrences rewritten via const CANONICAL_PATH, and sitemap test inverted to RED as TDD prerequisite for Plan 03.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-14T18:55:00Z
- **Completed:** 2026-05-14T19:02:00Z
- **Tasks:** 3 (Task 0 + Task 1 + Task 2)
- **Files modified:** 4

## Accomplishments

- Inverted `tests/sitemap.test.ts` assertions: old "JSX slugs must NOT appear under /blog/*" replaced with two new tests — "includes /blog/* entries for all 3 migrated JSX articles" and "does NOT include /guides/* or /compare/* entries" — committed in confirmed RED state
- Moved all 3 JSX articles via `git mv` in a single atomic commit (R100 similarity) preserving full git history — `git log --follow` traces 8 commits back through the rename for `prague-airport-to-city-center/page.tsx`
- Rewrote 30 URL occurrences (10 per file) across all 3 moved files using `const CANONICAL_PATH` + `const CANONICAL_ABS`; BreadcrumbList position-2 `name` updated from "Guides"/"Compare" to "Blog"; `tsc --noEmit` and `blog.test.ts` both green

## Task Commits

1. **Task 0: Invert sitemap test (TDD RED)** - `27b2a93` (test)
2. **Task 1: git mv 3 articles to app/blog/*** - `81157de` (feat)
3. **Task 2: Rewrite 30 URL occurrences via const CANONICAL_PATH** - `ee6e725` (feat)

## Files Created/Modified

- `tests/sitemap.test.ts` — inverted test assertions: JSX slugs must appear under /blog/*, no /guides|compare URLs (RED state)
- `app/blog/prague-airport-to-city-center/page.tsx` — moved from app/guides/; CANONICAL_PATH + CANONICAL_ABS constants; 10 URL occurrences rewritten
- `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx` — moved from app/compare/; CANONICAL_PATH + CANONICAL_ABS constants; 10 URL occurrences rewritten
- `app/blog/prague-vienna-transfer-vs-train/page.tsx` — moved from app/compare/; CANONICAL_PATH + CANONICAL_ABS constants; 10 URL occurrences rewritten

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `test -f app/blog/prague-airport-to-city-center/page.tsx` → FOUND
- `test -f app/blog/prague-airport-taxi-vs-chauffeur/page.tsx` → FOUND
- `test -f app/blog/prague-vienna-transfer-vs-train/page.tsx` → FOUND
- `grep -rn "/guides\|/compare" app/blog/` → zero hits (exit 1)
- `npx tsc --noEmit` → exit 0
- `npx vitest run tests/blog.test.ts` → 8 passed
- `npx vitest run tests/sitemap.test.ts` → 2 failed (intentional RED)
- Commits verified: `27b2a93`, `81157de`, `ee6e725`
- `git log --follow -- app/blog/prague-airport-to-city-center/page.tsx | wc -l` → 8
