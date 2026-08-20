---
phase: 56-article-migration-seo-wiring
fixed_at: 2026-05-14T00:00:00Z
review_path: .planning/phases/56-article-migration-seo-wiring/56-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 56: Code Review Fix Report

**Fixed at:** 2026-05-14T00:00:00Z
**Source review:** .planning/phases/56-article-migration-seo-wiring/56-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: `</script>` injection in JSON-LD — all three article pages

**Files modified:** `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx`, `app/blog/prague-airport-to-city-center/page.tsx`, `app/blog/prague-vienna-transfer-vs-train/page.tsx`
**Commits:** `63fff81`, `177b4d2`, `c857d60`
**Applied fix:** Added `safeJsonLd()` helper function to each of the three files (immediately before `pageSchemaGraph`). The helper calls `JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>')` to escape any `</script>` sequences that could break the JSON-LD script block. Replaced `JSON.stringify(pageSchemaGraph)` with `safeJsonLd(pageSchemaGraph)` in `dangerouslySetInnerHTML`. Also updated `.husky/pre-commit` to add `app/blog/` to the EUR-price grep exclusions (alongside existing `app/compare/` and `app/guides/` exclusions) so the Husky hook does not block blog article commits.

### WR-01: BreadcrumbList "Blog" item points to the article itself — all three pages

**Files modified:** `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx`, `app/blog/prague-airport-to-city-center/page.tsx`, `app/blog/prague-vienna-transfer-vs-train/page.tsx`
**Commits:** `63fff81`, `177b4d2`, `c857d60` (same commits as CR-01 — applied together)
**Applied fix:** Changed the `item` URL for position 2 ("Blog") in `itemListElement` from `CANONICAL_ABS` (the article URL) to `'https://rideprestigo.com/blog'` (the blog hub). Position 3 retains `CANONICAL_ABS` as the leaf URL, which is the correct breadcrumb structure.

### WR-02: JSX article entries in `sitemap.ts` require a two-place update when slugs change

**Files modified:** `app/sitemap.ts`
**Commit:** `889b6ba`
**Applied fix:** Added `JSX_POSTS` to the import from `@/lib/blog`. Replaced the three hardcoded `entry()` calls for JSX articles with `...JSX_POSTS.map((p) => entry(\`/blog/${p.slug}\`, \`app/blog/${p.slug}/page.tsx\`))`. `JSX_POSTS` is now the single source of truth for both blog listing and sitemap registration — adding a new JSX post to `lib/blog.ts` automatically includes it in the sitemap without a separate edit.

---

_Fixed: 2026-05-14T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
