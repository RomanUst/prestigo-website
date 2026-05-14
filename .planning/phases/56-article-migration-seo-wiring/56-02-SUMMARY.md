---
phase: 56
plan: "02"
subsystem: routing
tags: [redirects, seo, migration, next-config]
dependency_graph:
  requires: [56-01]
  provides: [MIG-03]
  affects: [next.config.ts]
tech_stack:
  added: []
  patterns: [next.config.ts redirects() permanent 301]
key_files:
  created: []
  modified:
    - next.config.ts
decisions:
  - "Explicit per-path redirect rules (no wildcards) to avoid catching future sub-paths"
  - "Append-only: existing rules untouched; 5 new rules at end of array"
metrics:
  duration: "~3 min"
  completed: "2026-05-14"
  tasks_completed: 1
  files_modified: 1
---

# Phase 56 Plan 02: 301 Redirects /guides|/compare → /blog Summary

## One-liner

5 permanent 301 redirect rules appended to `next.config.ts` redirects() array, routing all legacy /guides and /compare paths to their /blog/* counterparts for SEO link-equity preservation.

## What Was Built

Added 5 explicit `{ source, destination, permanent: true }` entries to the `redirects()` async function in `next.config.ts`, under the comment marker `// MIG-03: Migrate /guides and /compare to /blog`:

| Source | Destination |
|--------|-------------|
| `/guides` | `/blog` |
| `/guides/prague-airport-to-city-center` | `/blog/prague-airport-to-city-center` |
| `/compare` | `/blog` |
| `/compare/prague-airport-taxi-vs-chauffeur` | `/blog/prague-airport-taxi-vs-chauffeur` |
| `/compare/prague-vienna-transfer-vs-train` | `/blog/prague-vienna-transfer-vs-train` |

All rules use `permanent: true` (HTTP 301) to transfer SEO link equity to the new canonical paths.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Append 5 redirect rules to next.config.ts redirects() | f3adc0f | next.config.ts |

## Acceptance Criteria Verification

All criteria passed via automated Python check:

- `source: '/guides',` — found 1 (expected 1)
- `source: '/guides/prague-airport-to-city-center'` — found 1 (expected 1)
- `source: '/compare',` — found 1 (expected 1)
- `source: '/compare/prague-airport-taxi-vs-chauffeur'` — found 1 (expected 1)
- `source: '/compare/prague-vienna-transfer-vs-train'` — found 1 (expected 1)
- `destination: '/blog',` — found 2 (expected 2, the two hub redirects)
- `destination: '/blog/prague-airport-to-city-center'` — found 1 (expected 1)
- `destination: '/blog/prague-airport-taxi-vs-chauffeur'` — found 1 (expected 1)
- `destination: '/blog/prague-vienna-transfer-vs-train'` — found 1 (expected 1)
- `MIG-03` comment marker — found 1 (expected 1)
- `npx tsc --noEmit` — exits 0

## Deviations from Plan

### Worktree reset issue (auto-resolved)

**Found during:** Task 1 commit  
**Issue:** Initial `git reset --soft` to rebase worktree pulled staged deletions from the eeddb8a → f883b24 diff into the index. First commit inadvertently included 44 file deletions from previous phases.  
**Fix:** Reverted with `git reset --soft f883b24`, cleared index with `git reset HEAD -- .`, staged only `next.config.ts`, committed cleanly.  
**Files modified:** none (infrastructure issue only)  
**Impact:** No code changes; final commit is clean (1 file, 6 insertions).

## Known Stubs

None. This plan modifies only build-time configuration.

## Threat Flags

None. `redirects()` is a build-time configuration with no security surface (no auth, no input handling, no user data).

## Self-Check: PASSED

- `next.config.ts` modified: FOUND
- Commit f3adc0f exists: FOUND (git log confirmed)
- 5 new redirect rules with `permanent: true`: VERIFIED
- `npx tsc --noEmit` exits 0: VERIFIED
