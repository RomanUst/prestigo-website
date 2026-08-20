---
phase: 56-article-migration-seo-wiring
verified: 2026-05-14T22:10:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7 (8/11 truths)
  gaps_closed:
    - "app/guides/ and app/compare/ directories fully gone (empty orphan dirs removed)"
    - "safeJsonLd() applied to all 3 migrated JSX article pages (CR-01)"
    - "BreadcrumbList position 2 item points to /blog hub, not article URL (WR-01)"
    - "Sitemap JSX entries derived from JSX_POSTS, not hardcoded (WR-02)"
    - "56-04-SUMMARY.md created (plan 04 lifecycle closed)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center after deploy — verify single 301 hop to /blog/prague-airport-to-city-center (no redirect chain)"
    expected: "HTTP/1.1 301 → Location: https://rideprestigo.com/blog/prague-airport-to-city-center"
    why_human: "Redirect behavior requires live deployed app with new next.config.ts"
  - test: "curl -sIL https://rideprestigo.com/guides and curl -sIL https://rideprestigo.com/compare — verify 301 to /blog"
    expected: "HTTP/1.1 301 → Location: /blog in both cases"
    why_human: "Requires live deployment"
  - test: "Google Rich Results Test on each of the 3 migrated article URLs — validate BreadcrumbList schema after WR-01 fix"
    expected: "Breadcrumb rich result displayed; position 2 (Blog) points to https://rideprestigo.com/blog; no structural errors"
    why_human: "Requires Google Rich Results Test tooling (search.google.com/test/rich-results); confirms SERP impact of WR-01 fix"
---

# Phase 56: Article Migration + SEO Wiring — Verification Report (Re-verification)

**Phase Goal:** Three legacy JSX articles are permanently accessible at `/blog/*` canonical URLs; old `/guides/*` and `/compare/*` paths 301-redirect to the new locations; sitemap reflects only the new paths; no contradictory canonical signals remain
**Verified:** 2026-05-14T22:10:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous: gaps_found, 8/11 truths)

## Re-verification Summary

All 5 reported gaps have been closed by commits `63fff81`, `177b4d2`, `c857d60`, `889b6ba`, and the creation of `56-04-SUMMARY.md`. All 11 truths now pass automated verification. Three human smoke tests remain (live redirect verification and Google Rich Results Test) — these cannot be verified without a deployed environment and are the only reason status is `human_needed` rather than `passed`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 3 JSX articles physically reside under app/blog/* | VERIFIED | All 3 files present: app/blog/prague-airport-to-city-center/page.tsx, app/blog/prague-airport-taxi-vs-chauffeur/page.tsx, app/blog/prague-vienna-transfer-vs-train/page.tsx |
| 2 | git log --follow traces history back to original paths | VERIFIED | `git log --follow` traces 8+ commits through rename for all 3 files (git mv commit 81157de preserved R100 history) |
| 3 | No /guides or /compare strings remain inside moved files | VERIFIED | `grep -rn "/guides\|/compare" app/blog/` returns 0 hits; all 10 URL locations per file use CANONICAL_PATH / CANONICAL_ABS |
| 4 | tests/sitemap.test.ts is GREEN (inverted assertions pass) | VERIFIED | 15/15 tests pass across sitemap test suite; "includes /blog/* entries for all 3 migrated JSX articles" and "does NOT include /guides/* or /compare/* entries" both green |
| 5 | 5 permanent 301 redirect rules present in next.config.ts | VERIFIED | All 5 source/destination pairs confirmed with permanent: true; MIG-03 comment marker present |
| 6 | sitemap.xml entries: 3 /blog/* added, 0 /guides or /compare remaining | VERIFIED | app/sitemap.ts: JSX_POSTS.map() derives /blog/* entries dynamically (WR-02 fix, commit 889b6ba); 0 /guides or /compare entries |
| 7 | app/guides/page.tsx and app/compare/page.tsx deleted | VERIFIED | Both deleted via git rm (commit 7523195); app/guides/ and app/compare/ directories completely absent from filesystem |
| 8 | app/guides/ and app/compare/ directories fully gone | VERIFIED | `find app/ -path "*/guides/*" -o -path "*/compare/*" | wc -l` = 0; top-level directories gone |
| 9 | JSX_POSTS registry in lib/blog.ts contains all 3 migrated articles | VERIFIED | All 3 slugs present with required fields; tests/blog.test.ts 24/24 green |
| 10 | safeJsonLd() escaping applied to all 3 migrated JSX article pages | VERIFIED | All 3 pages define `function safeJsonLd(obj): string { return JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>') }` and use it in dangerouslySetInnerHTML (commits 63fff81, 177b4d2, c857d60) |
| 11 | BreadcrumbList position 2 item points to /blog hub (not article URL) | VERIFIED | All 3 pages have `{ '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://rideprestigo.com/blog' }` — WR-01 fix confirmed |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/blog/prague-airport-to-city-center/page.tsx` | Moved JSX article, CANONICAL_PATH, safeJsonLd, breadcrumb fixed | VERIFIED | CANONICAL_PATH = '/blog/prague-airport-to-city-center'; safeJsonLd() defined and used; breadcrumb pos 2 item = 'https://rideprestigo.com/blog' |
| `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx` | Same | VERIFIED | CANONICAL_PATH = '/blog/prague-airport-taxi-vs-chauffeur'; safeJsonLd() at line 209; breadcrumb pos 2 item = hub URL |
| `app/blog/prague-vienna-transfer-vs-train/page.tsx` | Same | VERIFIED | CANONICAL_PATH = '/blog/prague-vienna-transfer-vs-train'; safeJsonLd() at line 223; breadcrumb pos 2 item = hub URL |
| `tests/sitemap.test.ts` | Inverted assertions, GREEN | VERIFIED | 15/15 tests pass; both new tests present; old assertion gone |
| `next.config.ts` | 5 permanent redirect rules | VERIFIED | 2 sources matching /guides + 3 matching /compare; all permanent: true |
| `app/sitemap.ts` | 3 /blog/* entries via JSX_POSTS derivation, 0 legacy entries | VERIFIED | `JSX_POSTS.map(p => entry('/blog/${p.slug}', ...))` replaces hardcoded entries (WR-02); 0 /guides or /compare entries |
| `(no app/guides/page.tsx)` | File deleted | VERIFIED | Gone; directory gone entirely |
| `(no app/compare/page.tsx)` | File deleted | VERIFIED | Gone; directory gone entirely |
| `.planning/phases/56-article-migration-seo-wiring/56-04-SUMMARY.md` | Plan 04 closure document | VERIFIED | File exists with MIG-05 commit reference and MIG-06 pre-completion note |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| moved file metadata.alternates.canonical | CANONICAL_PATH constant | single source of truth | WIRED | `canonical: CANONICAL_PATH` confirmed in all 3 files |
| lib/lastmod.ts lastModFor() | git history at app/blog/slug/page.tsx | git log --follow | WIRED | --follow traces through git mv commit 81157de for all 3 files |
| next.config.ts redirects() | moved article paths /blog/slug | 5 explicit permanent: true entries | WIRED | All 5 source/destination pairs confirmed |
| app/sitemap.ts entry() | app/blog/slug/page.tsx | JSX_POSTS.map() + lastModFor() | WIRED | Dynamic derivation from JSX_POSTS (WR-02 fix) — no hardcoded slugs |
| GET /guides | /blog | next.config.ts redirect + no orphan page.tsx | WIRED | Redirect rule present; app/guides/page.tsx and directory deleted |
| GET /compare | /blog | next.config.ts redirect + no orphan page.tsx | WIRED | Redirect rule present; app/compare/page.tsx and directory deleted |
| dangerouslySetInnerHTML JSON-LD | safeJsonLd() | </script> escaping | WIRED | All 3 migrated pages use safeJsonLd() — consistent with app/blog/[slug]/page.tsx |

### Data-Flow Trace (Level 4)

Not applicable — this phase involves static file migrations, build-time configuration, and sitemap generation. No runtime data rendering with dynamic state.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| sitemap.test.ts GREEN | npx vitest run tests/sitemap.test.ts | 15/15 passed | PASS |
| blog.test.ts GREEN | npx vitest run tests/blog.test.ts | 24/24 passed | PASS |
| tsc passes | npx tsc --noEmit | 0 errors | PASS |
| No /guides or /compare in app/blog/ | grep -rn "/guides\|/compare" app/blog/ | 0 hits | PASS |
| No guides/compare dirs | find app/ -path "*/guides/*" -o -path "*/compare/*" \| wc -l | 0 | PASS |
| sitemap uses JSX_POSTS derivation | grep "JSX_POSTS.map" app/sitemap.ts | Found at line 55 | PASS |
| next build | npx next build | BUILD FAILED — MDX loader (pre-existing INFRA-02 gap from Phase 54) | FAIL (pre-existing, out of scope) |

**Note on next build failure:** Failure is `Unknown module type` for `.mdx` files — `next.config.ts` is not wrapped with `createMDX()` (INFRA-02, Phase 54 scope). This failure predated Phase 56 and is confirmed present in the pre-56 baseline. No Phase 56 change introduces or worsens this error.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MIG-01 | 56-01 | git mv 3 articles to /blog/* (atomic commit, history preserved) | SATISFIED | Commit 81157de; R100 similarity; --follow traces 8+ commits |
| MIG-02 | 56-01 | All URL locations updated via const CANONICAL_PATH | SATISFIED | 10 occurrences per file rewritten; 0 /guides or /compare in app/blog/ |
| MIG-03 | 56-02 | 5 permanent redirects in next.config.ts | SATISFIED | All 5 rules with permanent: true; commit f3adc0f |
| MIG-04 | 56-03 | sitemap.ts updated: legacy removed, /blog/* added dynamically | SATISFIED | JSX_POSTS.map() derivation (WR-02); 0 legacy entries; tests GREEN |
| MIG-05 | 56-04 | Hub pages deleted; directories removed; no orphan files | SATISFIED | app/guides/ and app/compare/ completely absent from filesystem |
| MIG-06 | 56-01, 56-04 | JSX_POSTS registry populated for all 3 articles | SATISFIED | All 3 entries with required metadata fields; blog.test.ts 24/24 green |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| app/authors/roman-ustyugov/page.tsx | 12 | Code comment mentioning /guides and /compare (historical context) | INFO | Comment only — not a URL, canonical, or routing artifact. Plan 04 decision recorded: historical-context comments are acceptable. |

No blockers remain. The bare JSON.stringify() vulnerability (CR-01) was fixed in commits 63fff81, 177b4d2, c857d60. The BreadcrumbList WR-01 issue was fixed in the same commits. The WR-02 hardcoded-slugs issue was fixed in commit 889b6ba.

### Human Verification Required

#### 1. Live Redirect Smoke Test — Article Paths

**Test:** `curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center` after deploy
**Expected:** Single 301 hop → `https://rideprestigo.com/blog/prague-airport-to-city-center`; no redirect chains, no 404
**Why human:** Requires live deployed app with new next.config.ts

#### 2. Live Redirect Smoke Test — Hub Paths

**Test:** `curl -sIL https://rideprestigo.com/guides` and `curl -sIL https://rideprestigo.com/compare`
**Expected:** 301 → `/blog` in both cases
**Why human:** Requires live deployment

#### 3. Google Rich Results Test — BreadcrumbList (Post-WR-01 Fix)

**Test:** Run each of the 3 migrated article URLs through Google Rich Results Test (search.google.com/test/rich-results)
**Expected:** Breadcrumb rich result displayed; position 2 (Blog) shows `https://rideprestigo.com/blog`; no structural errors
**Why human:** Confirms SERP impact of the WR-01 breadcrumb fix; requires Google tooling

### Gaps Summary

No automated gaps remain. All 5 previously reported gaps are closed:

1. **Empty orphan directories** — CLOSED: `find app/ -path "*/guides/*" -o -path "*/compare/*" | wc -l` = 0; both directories gone from filesystem.
2. **safeJsonLd() not applied** — CLOSED: All 3 migrated pages define and use `safeJsonLd()` with `</script>` escaping (commits 63fff81, 177b4d2, c857d60).
3. **BreadcrumbList position 2 item WR-01** — CLOSED: All 3 pages now use `item: 'https://rideprestigo.com/blog'` for position 2 (same commits).
4. **Sitemap hardcoded slugs WR-02** — CLOSED: `app/sitemap.ts` now uses `JSX_POSTS.map()` for dynamic derivation (commit 889b6ba).
5. **56-04-SUMMARY.md missing** — CLOSED: File exists at `.planning/phases/56-article-migration-seo-wiring/56-04-SUMMARY.md`.

**Pre-existing issue (not a Phase 56 gap):** `npx next build` fails due to missing MDX loader (INFRA-02, Phase 54 scope). Confirmed pre-existing before Phase 56 changes. Does not affect tsc, vitest, or the routing/SEO correctness verified here.

---

_Verified: 2026-05-14T22:10:00Z_
_Verifier: Claude (gsd-verifier)_
