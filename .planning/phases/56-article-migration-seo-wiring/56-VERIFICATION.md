---
phase: 56-article-migration-seo-wiring
verified: 2026-05-14T21:55:00Z
status: gaps_found
score: 5/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "app/guides/ and app/compare/ directories are gone OR empty (no orphan files)"
    status: partial
    reason: "Three empty subdirectories remain on the filesystem: app/guides/prague-airport-to-city-center/, app/compare/prague-vienna-transfer-vs-train/, app/compare/prague-airport-taxi-vs-chauffeur/. They contain no files and are not tracked by git (git rm removed only the page.tsx files), but the directories physically exist. Next.js build does not route to them (no page.tsx inside), so there is no functional impact — but plan 04 acceptance criteria require `find app/ -path \"*/guides/*\" -o -path \"*/compare/*\" | wc -l` to return 0, which currently returns 3."
    artifacts:
      - path: "app/guides/prague-airport-to-city-center/"
        issue: "Empty directory, not removed from filesystem"
      - path: "app/compare/prague-vienna-transfer-vs-train/"
        issue: "Empty directory, not removed from filesystem"
      - path: "app/compare/prague-airport-taxi-vs-chauffeur/"
        issue: "Empty directory, not removed from filesystem"
    missing:
      - "Run: rmdir app/guides/prague-airport-to-city-center app/compare/prague-vienna-transfer-vs-train app/compare/prague-airport-taxi-vs-chauffeur app/guides app/compare (in dependency order)"
  - truth: "All three JSX article pages apply safeJsonLd() escaping to their JSON-LD output (security: </script> injection fix from Phase 55 forward-propagated)"
    status: failed
    reason: "CR-01 from code review: all three migrated pages use bare JSON.stringify() in dangerouslySetInnerHTML without </script> escaping. The fix was applied to app/blog/[slug]/page.tsx in Phase 55 (commit fd11633) but was not forward-propagated to the migrated JSX files. This is a security gap — FAQ answers and descriptions can contain </script> in future edits."
    artifacts:
      - path: "app/blog/prague-airport-to-city-center/page.tsx"
        issue: "Line 350: bare JSON.stringify(pageSchemaGraph) in dangerouslySetInnerHTML — no </script> escaping"
      - path: "app/blog/prague-airport-taxi-vs-chauffeur/page.tsx"
        issue: "Line 255: bare JSON.stringify(pageSchemaGraph) in dangerouslySetInnerHTML — no </script> escaping"
      - path: "app/blog/prague-vienna-transfer-vs-train/page.tsx"
        issue: "Line 269: bare JSON.stringify(pageSchemaGraph) in dangerouslySetInnerHTML — no </script> escaping"
    missing:
      - "Apply safeJsonLd() helper (or inline replace) to all three files, matching the fix in app/blog/[slug]/page.tsx"
  - truth: "56-04-SUMMARY.md exists (Plan 04 formally closed)"
    status: failed
    reason: "56-04-SUMMARY.md does not exist in .planning/phases/56-article-migration-seo-wiring/. The plan 04 tasks were executed (MIG-05 commit 7523195 exists, MIG-06 verified), but no summary was written, leaving the phase lifecycle incomplete."
    artifacts:
      - path: ".planning/phases/56-article-migration-seo-wiring/56-04-SUMMARY.md"
        issue: "File does not exist"
    missing:
      - "Create 56-04-SUMMARY.md per template, explicitly noting: MIG-05 committed as 7523195; MIG-06 verified as pre-completed; 3 empty orphan directories remain on filesystem (rmdir needed); next build fails due to missing MDX loader (pre-existing, out of scope for phase 56)"
human_verification:
  - test: "curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center — verify single 301 hop to /blog/prague-airport-to-city-center (no redirect chain)"
    expected: "HTTP/1.1 301 → Location: /blog/prague-airport-to-city-center"
    why_human: "Redirect behavior requires live deployed app; cannot verify without running server"
  - test: "curl -sIL https://rideprestigo.com/guides — verify 301 to /blog"
    expected: "HTTP/1.1 301 → Location: /blog"
    why_human: "Same — requires live deployment"
  - test: "Google Rich Results Test on each of the 3 migrated articles — validate BreadcrumbList schema"
    expected: "No structured data errors; breadcrumb position 2 (Blog) points to /blog, not to the article itself"
    why_human: "WR-01 from code review: breadcrumb Blog item incorrectly points to CANONICAL_ABS (the article) instead of /blog hub. Requires Google tooling to confirm impact on SERP rich results."
---

# Phase 56: Article Migration + SEO Wiring — Verification Report

**Phase Goal:** Migrate 3 JSX blog articles to /blog/*, add 301 redirects from legacy URLs, update sitemap, and remove orphan hub pages — making /blog the single canonical home for all content (MDX + JSX).
**Verified:** 2026-05-14T21:55:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 3 JSX articles physically reside under app/blog/* | VERIFIED | Files confirmed: app/blog/prague-airport-to-city-center/page.tsx, app/blog/prague-airport-taxi-vs-chauffeur/page.tsx, app/blog/prague-vienna-transfer-vs-train/page.tsx |
| 2 | git log --follow traces history back to original paths | VERIFIED | `git log --follow --oneline -- app/blog/prague-airport-to-city-center/page.tsx` returns 8 commits; similar for other two files (9, 10 commits) |
| 3 | No /guides or /compare strings remain inside moved files | VERIFIED | `grep -rn "/guides\|/compare" app/blog/` returns 0 hits; all 10 URL locations per file use CANONICAL_PATH / CANONICAL_ABS (12 references per file confirmed) |
| 4 | tests/sitemap.test.ts contains inverted assertions and is GREEN | VERIFIED | Two new tests present: "includes /blog/* entries for all 3 migrated JSX articles" and "does NOT include /guides/* or /compare/* entries"; 5/5 tests pass in tests/sitemap.test.ts |
| 5 | 5 permanent 301 redirect rules present in next.config.ts | VERIFIED | All 5 rules confirmed with permanent: true; MIG-03 comment marker present; tsc passes |
| 6 | sitemap.xml entries: 3 /blog/* added, 0 /guides|/compare remaining | VERIFIED | app/sitemap.ts: 3 explicit entry() calls for migrated slugs; 0 /guides|/compare entries; mdxBlogEntries block untouched |
| 7 | app/guides/page.tsx and app/compare/page.tsx deleted | VERIFIED | Both files deleted via git rm (commit 7523195); neither path exists |
| 8 | app/guides/ and app/compare/ directories fully gone | PARTIAL | Hub page.tsx files gone; but 3 empty subdirectories remain: app/guides/prague-airport-to-city-center/, app/compare/prague-vienna-transfer-vs-train/, app/compare/prague-airport-taxi-vs-chauffeur/ |
| 9 | JSX_POSTS registry in lib/blog.ts contains all 3 migrated articles | VERIFIED | lib/blog.ts JSX_POSTS array has 3 entries with slugs (double-quoted), titles, descriptions, dates, coverImage, category, author; tests/blog.test.ts 24/24 green |
| 10 | safeJsonLd() escaping applied to migrated JSX article JSON-LD | FAILED | All 3 pages use bare JSON.stringify() in dangerouslySetInnerHTML — CR-01 from code review; fix from Phase 55 not forward-propagated |
| 11 | 56-04-SUMMARY.md exists | FAILED | File absent from .planning/phases/56-article-migration-seo-wiring/ |

**Score:** 8/11 truths verified (truths 8, 10, 11 failed)

For the 6 requirements from REQUIREMENTS.md:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| MIG-01 | VERIFIED | 3 files at app/blog/* via git mv; R100 rename commit 81157de |
| MIG-02 | VERIFIED | 12 CANONICAL_PATH/CANONICAL_ABS references per file; 0 /guides or /compare in app/blog/ |
| MIG-03 | VERIFIED | 5 redirect rules in next.config.ts; all permanent: true |
| MIG-04 | VERIFIED | sitemap.ts: 3 /blog/* entries added; 5 legacy entries removed; tests GREEN |
| MIG-05 | VERIFIED (partial) | Hub pages deleted; but 3 empty orphan directories remain on filesystem |
| MIG-06 | VERIFIED | JSX_POSTS has all 3 slugs with required metadata fields; blog.test.ts green |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/blog/prague-airport-to-city-center/page.tsx` | Moved JSX article with /blog/* canonical | VERIFIED | CANONICAL_PATH = '/blog/prague-airport-to-city-center' present; no /guides strings |
| `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx` | Moved JSX article with /blog/* canonical | VERIFIED | CANONICAL_PATH = '/blog/prague-airport-taxi-vs-chauffeur' present |
| `app/blog/prague-vienna-transfer-vs-train/page.tsx` | Moved JSX article with /blog/* canonical | VERIFIED | CANONICAL_PATH = '/blog/prague-vienna-transfer-vs-train' present |
| `tests/sitemap.test.ts` | Inverted assertions; JSX slugs under /blog/* | VERIFIED | 2 new tests; old assertion gone; 5/5 GREEN |
| `next.config.ts` | 5 permanent redirect rules | VERIFIED | All 5 sources/destinations confirmed; MIG-03 marker present |
| `app/sitemap.ts` | 3 /blog/* entries; 0 /guides|/compare entries | VERIFIED | Correct; mdxBlogEntries untouched |
| `(no app/guides/page.tsx)` | File deleted | VERIFIED | git rm confirmed in commit 7523195 |
| `(no app/compare/page.tsx)` | File deleted | VERIFIED | git rm confirmed in commit 7523195 |
| `.planning/phases/56-article-migration-seo-wiring/56-04-SUMMARY.md` | Plan 04 closure document | MISSING | File does not exist |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| moved file metadata.alternates.canonical | CANONICAL_PATH constant | single source of truth | WIRED | Pattern `canonical: CANONICAL_PATH` confirmed in all 3 files |
| lib/lastmod.ts lastModFor() | git history at app/blog/slug/page.tsx | git log --follow | WIRED | --follow traces 8-10 commits through rename for all 3 files |
| next.config.ts redirects() | moved article paths /blog/slug | 5 explicit permanent: true entries | WIRED | All 5 source/destination pairs confirmed |
| app/sitemap.ts entry() | app/blog/slug/page.tsx | lastModFor() with git --follow | WIRED | 3 entry() calls pointing to correct new paths |
| GET /guides | /blog | next.config.ts redirect + no orphan page.tsx | WIRED | Redirect rule present; app/guides/page.tsx deleted |

### Data-Flow Trace (Level 4)

Not applicable — this phase involves static file migrations, build-time configuration, and sitemap generation. No runtime data rendering with dynamic state.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| sitemap.test.ts GREEN | npx vitest run tests/sitemap.test.ts | 5/5 tests passed | PASS |
| blog.test.ts GREEN | npx vitest run tests/blog.test.ts | 24/24 tests passed | PASS |
| tsc passes (after .next cache cleared) | npx tsc --noEmit | 0 errors | PASS |
| git --follow preserves history | git log --follow --oneline -- app/blog/.../page.tsx | 8-10 commits | PASS |
| No /guides|/compare in app/blog/ | grep -rn "/guides\|/compare" app/blog/ | 0 hits | PASS |
| next build | npx next build | BUILD FAILED — MDX loader not configured | FAIL (pre-existing, see note) |

**Note on next build failure:** The build fails with "Unknown module type" for `.mdx` files — this is because `next.config.ts` is not wrapped with `createMDX()` (INFRA-02, Phase 54 scope). This failure predates Phase 56: the same error is present in the pre-56 baseline commit `fd11633`. Plan 04 acceptance criteria listed `next build exits 0` but this was not achievable without Phase 54 INFRA-02 being completed first. This is a pre-existing dependency gap, not introduced by Phase 56.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MIG-01 | 56-01 | git mv 3 articles to /blog/* (atomic commit) | SATISFIED | Commit 81157de; R100 similarity; --follow works |
| MIG-02 | 56-01 | All URL locations updated via const CANONICAL_PATH | SATISFIED | 12 CANONICAL refs per file; 0 /guides|/compare in app/blog/ |
| MIG-03 | 56-02 | 5 permanent redirects in next.config.ts | SATISFIED | 5 rules with permanent: true confirmed |
| MIG-04 | 56-03 | sitemap.ts updated: legacy removed, /blog/* added | SATISFIED | 3 entries added; 0 legacy entries remain; tests GREEN |
| MIG-05 | 56-04 | Hub pages app/guides/page.tsx and app/compare/page.tsx deleted | PARTIAL | Files deleted; 3 empty sibling directories remain on filesystem |
| MIG-06 | 56-01, 56-04 | JSX_POSTS registry populated for 3 articles | SATISFIED | All 3 entries with required fields; blog.test.ts green |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| app/blog/prague-airport-to-city-center/page.tsx | 350 | JSON.stringify() in dangerouslySetInnerHTML without </script> escaping | BLOCKER | XSS via JSON-LD if FAQ/description text ever contains </script> — same vuln fixed in [slug]/page.tsx by commit fd11633 |
| app/blog/prague-airport-taxi-vs-chauffeur/page.tsx | 255 | Same bare JSON.stringify() pattern | BLOCKER | Same impact |
| app/blog/prague-vienna-transfer-vs-train/page.tsx | 269 | Same bare JSON.stringify() pattern | BLOCKER | Same impact |
| app/blog/prague-airport-to-city-center/page.tsx | 312 | BreadcrumbList position 2 item: CANONICAL_ABS (should be blog hub URL) | WARNING | Google Rich Results Test will flag; breadcrumb SERP display may be suppressed |
| app/blog/prague-airport-taxi-vs-chauffeur/page.tsx | 217 | BreadcrumbList position 2 item: CANONICAL_ABS | WARNING | Same |
| app/blog/prague-vienna-transfer-vs-train/page.tsx | 231 | BreadcrumbList position 2 item: CANONICAL_ABS | WARNING | Same |

### Human Verification Required

#### 1. Live Redirect Smoke Test

**Test:** `curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center` after deploy
**Expected:** Single 301 hop to `https://rideprestigo.com/blog/prague-airport-to-city-center`; no redirect chains
**Why human:** Requires live deployed app with new next.config.ts

#### 2. Hub Redirect Smoke Tests

**Test:** `curl -sIL https://rideprestigo.com/guides` and `curl -sIL https://rideprestigo.com/compare`
**Expected:** 301 to `/blog` in both cases
**Why human:** Same — requires live deployment

#### 3. Google Rich Results Test — BreadcrumbList

**Test:** Run each article URL through Google Rich Results Test (search.google.com/test/rich-results)
**Expected:** Breadcrumb rich result displayed; position 2 (Blog) points to `https://rideprestigo.com/blog`; no structural errors flagged
**Why human:** WR-01: all 3 pages have breadcrumb position 2 `item: CANONICAL_ABS` (the article itself) instead of the blog hub. This requires Google tooling to verify SERP impact. Fix should be applied before testing.

### Gaps Summary

**Three gaps block full goal achievement:**

1. **Empty orphan directories** (MIG-05 partial): `app/guides/prague-airport-to-city-center/`, `app/compare/prague-vienna-transfer-vs-train/`, `app/compare/prague-airport-taxi-vs-chauffeur/` are empty but not removed. Functionally harmless (no page.tsx inside means Next.js won't route there), but the acceptance criterion `find app/ -path "*/guides/*" ... | wc -l = 0` is not met. Fix: `rmdir` the three directories.

2. **safeJsonLd() not applied to migrated pages** (Security): The `</script>`-injection fix from Phase 55 (commit fd11633) was forward-propagated to `app/blog/[slug]/page.tsx` but not to the 3 migrated JSX article pages. All 3 pages use bare `JSON.stringify()` in `dangerouslySetInnerHTML`. This is the same vulnerability that was specifically fixed in Phase 55. Fix: apply `safeJsonLd()` helper to all 3 files.

3. **56-04-SUMMARY.md missing**: Plan 04 was executed (commits exist, MIG-05 done, MIG-06 verified) but the summary document was not created. The phase lifecycle is formally incomplete.

**Pre-existing issue (not a Phase 56 gap):** `npx next build` fails due to missing MDX loader — this is INFRA-02 from Phase 54, which was never completed. Phase 56 plans noted this dependency but it was not in Phase 56 scope.

---

_Verified: 2026-05-14T21:55:00Z_
_Verifier: Claude (gsd-verifier)_
