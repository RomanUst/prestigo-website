---
phase: 56
plan: "03"
subsystem: sitemap
tags: [sitemap, seo, migration, mig-04]
dependency_graph:
  requires: [56-01, 56-02]
  provides: [MIG-04]
  affects: [app/sitemap.ts]
tech_stack:
  added: []
  patterns: [entry() helper, lastModFor() git-date, mdxBlogEntries filter]
key_files:
  created: []
  modified:
    - app/sitemap.ts
decisions:
  - "Removed 5 legacy /compare/* and /guides/* sitemap entries"
  - "Added 3 explicit /blog/<slug> entries for migrated JSX articles immediately after /blog hub"
  - "Left mdxBlogEntries block (source === 'mdx') untouched — it serves MDX-only posts"
  - "Pre-existing test failures in google-reviews.test.ts and BookingWizard.test.tsx are out of scope (present in base commit 4e5230b)"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-14"
  tasks_completed: 1
  files_modified: 1
---

# Phase 56 Plan 03: Sitemap — Remove Legacy Entries, Add /blog/* Summary

**One-liner:** Removed 5 legacy `/compare/*` and `/guides/*` sitemap entries; added 3 explicit `/blog/<slug>` entries for migrated JSX articles so sitemap.xml matches the new canonical paths.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Remove 5 legacy entries and add 3 /blog/* entries in app/sitemap.ts | `300bcb4` | `app/sitemap.ts` |

## What Was Done

`app/sitemap.ts` had 5 stale entries pointing to `/compare/*` and `/guides/*` routes that were moved to `/blog/*` in Plan 01 (MIG-01). This plan:

1. Removed all 5 legacy entries:
   - `entry('/compare', 'app/compare/page.tsx')`
   - `entry('/compare/prague-vienna-transfer-vs-train', ...)`
   - `entry('/compare/prague-airport-taxi-vs-chauffeur', ...)`
   - `entry('/guides', 'app/guides/page.tsx')`
   - `entry('/guides/prague-airport-to-city-center', ...)`

2. Added 3 new explicit `/blog/*` entries immediately after `entry('/blog', ...)`:
   - `entry('/blog/prague-airport-to-city-center', 'app/blog/prague-airport-to-city-center/page.tsx')`
   - `entry('/blog/prague-airport-taxi-vs-chauffeur', 'app/blog/prague-airport-taxi-vs-chauffeur/page.tsx')`
   - `entry('/blog/prague-vienna-transfer-vs-train', 'app/blog/prague-vienna-transfer-vs-train/page.tsx')`

3. Left the `mdxBlogEntries` block (filtering `source === 'mdx'`) completely untouched.

`lastModFor()` uses `git log --follow` so it correctly traces git history back through the `git mv` commits from Plan 01 and returns real publication dates (not today's build date).

## Verification Results

- `grep /guides|/compare app/sitemap.ts` → 0 hits
- `grep /blog/prague-* app/sitemap.ts` → 3 hits (all 3 migrated slugs)
- `npx tsc --noEmit` → exit 0
- `npx vitest run tests/sitemap.test.ts` → 5/5 passed (GREEN — was RED in TDD commit 27b2a93)
- Full suite: 762 passed (12 pre-existing failures in google-reviews and BookingWizard unrelated to this plan)

## Deviations from Plan

### Worktree State Issue

**Found during:** Setup

**Issue:** Worktree was checked out at a stale commit. `tests/sitemap.test.ts` (created in commit `27b2a93`) was not present in working tree despite being in the base commit `4e5230b`.

**Fix:** Used `git checkout 4e5230b -- tests/sitemap.test.ts` and `git checkout 4e5230b -- .` to restore all files from the correct base commit. Removed 3 stale untracked directories (`app/compare/prague-*`, `app/guides/prague-*`) left over from the worktree setup.

**Files modified:** None (setup only).

### Pre-existing Test Failures (Out of Scope)

12 tests in `tests/google-reviews.test.ts` (7 failures) and `tests/BookingWizard.test.tsx` (5 failures) were already failing in base commit `4e5230b`. These are not caused by this plan's changes. Logged for reference only — not fixed.

## Known Stubs

None. The 3 sitemap entries point to real files that exist at `app/blog/<slug>/page.tsx` (moved in Plan 01 via `git mv`).

## Threat Flags

None. Sitemap is a build-time static XML file with no security surface.

## Self-Check: PASSED

- `app/sitemap.ts` exists and contains 3 `/blog/prague-*` entries, 0 `/guides|/compare` entries
- Commit `300bcb4` verified: `git log --oneline | grep 300bcb4`
- `tests/sitemap.test.ts` 5/5 GREEN
