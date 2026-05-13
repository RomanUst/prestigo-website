---
phase: 54-mdx-infrastructure
fixed_at: 2026-05-13T00:00:00Z
review_path: .planning/phases/54-mdx-infrastructure/54-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 54: Code Review Fix Report

**Fixed at:** 2026-05-13T00:00:00Z
**Source review:** .planning/phases/54-mdx-infrastructure/54-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Path traversal via unsanitised `slug` in dynamic import

**Files modified:** `app/blog/[slug]/page.tsx`
**Commit:** 1fdc771
**Applied fix:** Added `import { notFound } from "next/navigation"` and an allowlist regex guard `if (!/^[a-z0-9-]+$/.test(slug)) { notFound(); }` immediately after `await params` — before the dynamic import. This ensures any slug containing path separators, dots, or other non-slug characters is rejected with a 404 at the code level, independent of Next.js config flags.

### WR-01: No runtime validation of MDX frontmatter — silent bad data

**Files modified:** `lib/blog.ts`
**Commit:** f0fb0ae
**Applied fix:** Added a required-fields loop in `getMDXPosts()` after `matter(raw)`. Iterates over `["title", "description", "date", "coverImage", "category", "author"]` and throws a descriptive `Error` naming the file and missing field if any value is falsy. This converts silent `undefined` coercions into loud build-time errors.

### WR-02: `import` error from missing `.mdx` file has no error handling

**Files modified:** `app/blog/[slug]/page.tsx`
**Commit:** 1fdc771
**Applied fix:** Wrapped the dynamic import in a try/catch block. On failure, calls `notFound()` — consistent with Next.js Server Component conventions — rather than allowing an unhandled rejection to produce a 500. Combined with CR-01 fix in the same commit since both touch the same file section.

### WR-03: `getAllPosts()` date sort silently corrupts on malformed dates

**Files modified:** `lib/blog.ts`
**Commit:** f0fb0ae
**Applied fix:** Replaced the inline sort arrow with a named comparator body that computes `ta` and `tb` separately, checks `isNaN(ta) || isNaN(tb)`, and throws a descriptive error identifying the offending slug. Combined with WR-01 fix in the same commit since both touch `lib/blog.ts`.

---

_Fixed: 2026-05-13T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
