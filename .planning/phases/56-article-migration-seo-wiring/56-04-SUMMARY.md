---
phase: 56-article-migration-seo-wiring
plan: "04"
subsystem: seo
tags: [nextjs, routing, redirects, sitemap, blog]

# Dependency graph
requires:
  - phase: 56-02
    provides: "Permanent 301 redirects /guides/* and /compare/* → /blog/* in next.config.ts"
  - phase: 56-01
    provides: "JSX articles moved to app/blog/* via git mv; CANONICAL_PATH rewrites"
  - phase: 54
    provides: "JSX_POSTS registry pre-populated in lib/blog.ts (MIG-06)"

provides:
  - "Deleted app/guides/page.tsx — hub page removed, redirect rule now sole handler for /guides"
  - "Deleted app/compare/page.tsx — hub page removed, redirect rule now sole handler for /compare"
  - "MIG-05 complete: no contradictory canonical signal from orphan hub pages"
  - "MIG-06 verified: JSX_POSTS in lib/blog.ts contains all 3 migrated articles with correct metadata"

affects: [deploy, seo, sitemap, blog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hub page deletion pattern: git rm page.tsx after redirect rules are confirmed in next.config.ts"
    - "Pre-flight redirect check before destructive deletion: grep for source patterns before git rm"

key-files:
  created: []
  modified: []
  deleted:
    - "app/guides/page.tsx (hub page, replaced by redirect rule)"
    - "app/compare/page.tsx (hub page, replaced by redirect rule)"

key-decisions:
  - "Build error (Turbopack MDX loader) confirmed as pre-existing issue predating plan 56-04; not introduced by hub page deletion"
  - "MIG-06 verified as pre-completed in phase 54; no edits to lib/blog.ts required"
  - "Comments mentioning /guides and /compare in source code (not URL references) are acceptable — they describe historical context"

patterns-established:
  - "Delete hub page only AFTER confirming redirect rules are present: grep source pattern in next.config.ts returns >= 1"
  - "MIG-06 pre-completion via JSX_POSTS registry is the correct approach for hybrid JSX+MDX blog"

requirements-completed: [MIG-05, MIG-06]

# Metrics
duration: 25min
completed: 2026-05-14
---

# Phase 56 Plan 04: Legacy Hub Pages Cleanup Summary

**Deleted app/guides/page.tsx and app/compare/page.tsx — eliminating contradictory canonical signals; verified JSX_POSTS registry complete for all 3 migrated articles (MIG-06 pre-completed in phase 54)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-14T19:15:00Z
- **Completed:** 2026-05-14T19:40:00Z
- **Tasks:** 2 (1 with commit, 1 read-only verification)
- **Files deleted:** 2

## Accomplishments

- Deleted `app/guides/page.tsx` and `app/compare/page.tsx` via `git rm` — eliminates the "contradictory canonical signal" anti-pattern (RESEARCH.md Pitfall 4)
- Cleaned empty `app/guides/` and `app/compare/` directories from filesystem
- Confirmed pre-flight: both redirect rules (`/guides → /blog`, `/compare → /blog`) were present in next.config.ts before deletion
- MIG-06 verified: `JSX_POSTS` in `lib/blog.ts` contains all 3 entries (`prague-airport-to-city-center`, `prague-airport-taxi-vs-chauffeur`, `prague-vienna-transfer-vs-train`) with correct fields (slug, title, description, date, coverImage, category, author)
- `npx vitest run tests/blog.test.ts` — 24 tests passed (MIG-06 assertion green)

## Task Commits

1. **Task 1: Delete app/guides/page.tsx and app/compare/page.tsx** - `7523195` (feat)
2. **Task 2: Verify JSX_POSTS registry (MIG-06 — read-only)** - no commit (verification only, no changes needed)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/guides/page.tsx` — DELETED (320 lines; hub page for /guides route; replaced by redirect rule in next.config.ts)
- `app/compare/page.tsx` — DELETED (was inside deletion; hub page for /compare route; replaced by redirect rule in next.config.ts)

## Decisions Made

- Build error (Turbopack MDX loader for `content/blog/premium-airport-transfer-prague-shortcut.mdx`) confirmed as pre-existing issue — same error existed on HEAD before our changes. Not introduced by this plan. Logged as out-of-scope.
- MIG-06 verified as pre-completed in phase 54; `lib/blog.ts` required no edits.

## Deviations from Plan

None — plan executed exactly as written.

Pre-flight checks passed (redirect rules confirmed present). Both deletions succeeded. JSX_POSTS verification passed. The one pre-existing build failure (Turbopack MDX loader) was confirmed to predate this plan and is out of scope.

## Issues Encountered

**Pre-existing Turbopack build error:** `npx next build` fails with "Unknown module type" for `content/blog/premium-airport-transfer-prague-shortcut.mdx`. This error existed before plan 56-04 changes (confirmed via `git stash` test). It is a pre-existing issue from phase 54 MDX infrastructure setup and is not introduced or worsened by this plan's deletions. Deferred to the appropriate phase for resolution.

## Known Stubs

None — this plan only deletes files and performs read-only verification. No stubs introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 56 is now complete:
- MIG-01: JSX articles at `/blog/[slug]` — done (Plan 56-01)
- MIG-02: Canonical URLs rewritten in all 3 articles — done (Plan 56-01)
- MIG-03: 5 permanent 301 redirects `/guides/*`, `/compare/*` → `/blog/*` — done (Plan 56-02)
- MIG-04: Sitemap updated (old paths removed, `/blog/*` paths added) — done (Plan 56-03)
- MIG-05: Legacy hub pages deleted — done (this plan)
- MIG-06: JSX_POSTS registry complete — verified (pre-completed in phase 54)

The pre-existing Turbopack build error should be addressed before the next production deploy. It affects `npx next build` but does NOT affect `npx tsc --noEmit` or `npx vitest run`.

---
*Phase: 56-article-migration-seo-wiring*
*Completed: 2026-05-14*
