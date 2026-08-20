---
phase: 54-mdx-infrastructure
reviewed: 2026-05-13T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - mdx-components.tsx
  - content/blog/premium-airport-transfer-prague-shortcut.mdx
  - next.config.ts
  - package.json
  - tests/blog.test.ts
  - lib/blog.ts
  - app/blog/[slug]/page.tsx
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 54: Code Review Report

**Reviewed:** 2026-05-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 54 introduces the MDX infrastructure: `@next/mdx` wiring, a `gray-matter` post aggregator (`lib/blog.ts`), a minimal render route (`app/blog/[slug]/page.tsx`), and a single test MDX article. The overall architecture is sound and intentionally minimal. The main concerns are:

1. **Path traversal via unsanitised `slug`** in the dynamic import — an attacker-controlled slug can escape the `content/blog/` directory.
2. Three warnings around missing frontmatter validation, type assertions without runtime guards, and missing `await` error handling.
3. Three info items: `remark-gfm` listed as a production dependency despite being unused, hardcoded `author` test assumption, and a magic-string `"roman-ustyugov"` across the codebase.

---

## Critical Issues

### CR-01: Path traversal via unsanitised `slug` in dynamic import

**File:** `app/blog/[slug]/page.tsx:37`
**Issue:** The `slug` parameter comes from the URL and is used directly in a dynamic import template literal without sanitisation:

```ts
const { default: Post } = await import(
  `../../../content/blog/${slug}.mdx`
);
```

`dynamicParams = false` restricts runtime routing to the statically generated params, which mitigates the issue at runtime in production. However, `dynamic = "force-static"` combined with `dynamicParams = false` means Next.js will return a 404 for unknown slugs only if the static export is properly configured — this is not guaranteed in all deployment targets (e.g. Vercel edge with ISR, custom servers). If the guard ever lapses (a slug added outside `generateStaticParams`, a middleware bypass, or a developer removing the flag), a crafted slug like `../../app/api/admin/secret` would attempt to import an arbitrary module from the repo tree.

Additionally, Turbopack/webpack may bundle a broader set of `.mdx` files if the glob used for the dynamic import is wider than intended.

**Fix:** Add an allowlist check before the import so the guard is explicit and in-code rather than relying solely on a config flag:

```ts
export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Allowlist: only accept slugs that are simple path segments
  // (alphanumeric + hyphens). Rejects any traversal attempts.
  if (!/^[a-z0-9-]+$/.test(slug)) {
    notFound(); // import { notFound } from "next/navigation"
  }

  const { default: Post } = await import(
    `../../../content/blog/${slug}.mdx`
  );
  return <Post />;
}
```

---

## Warnings

### WR-01: No runtime validation of MDX frontmatter — silent bad data

**File:** `lib/blog.ts:37-45`
**Issue:** `getMDXPosts()` reads frontmatter fields with bare `as string` casts. If any required field is missing or has the wrong type in an `.mdx` file, the resulting `BlogPost` will have `undefined` values silently coerced to `string`. Downstream consumers (sort by date, `new Date(post.date)`) will produce `NaN` without any error, causing silent sort corruption.

```ts
title: data.title as string,         // could be undefined
date: data.date as string,           // NaN if missing
coverImage: data.coverImage as string,
```

**Fix:** Validate required fields after parsing and throw (or skip + warn) on missing data:

```ts
const required = ["title", "description", "date", "coverImage", "category", "author"];
for (const key of required) {
  if (!data[key]) {
    throw new Error(`MDX file "${filename}" is missing required frontmatter field: "${key}"`);
  }
}
```

A `zod` schema (already a project dependency) would make this more robust:

```ts
import { z } from "zod";
const FrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coverImage: z.string().startsWith("/"),
  category: z.string().min(1),
  author: z.enum(["roman-ustyugov"]),
  dateModified: z.string().optional(),
});
```

### WR-02: `import` error from missing `.mdx` file has no error handling

**File:** `app/blog/[slug]/page.tsx:36-39`
**Issue:** The dynamic `import()` is not wrapped in try/catch. If an `.mdx` file listed by `generateStaticParams` fails to compile (syntax error, broken frontmatter export, etc.), the route will throw an unhandled rejection and produce a 500. Next.js will not render an error boundary for unhandled async errors in Server Components in all configurations.

**Fix:** Wrap the import and call `notFound()` on failure, consistent with Next.js conventions:

```ts
import { notFound } from "next/navigation";

let Post: React.ComponentType;
try {
  const mod = await import(`../../../content/blog/${slug}.mdx`);
  Post = mod.default;
} catch {
  notFound();
}
return <Post />;
```

### WR-03: `getAllPosts()` date sort silently corrupts on malformed dates

**File:** `lib/blog.ts:101-104`
**Issue:** The sort comparator uses `new Date(post.date).getTime()`. If any post has a missing or malformed `date` field, `new Date(undefined).getTime()` returns `NaN`. JavaScript sort is not stable under `NaN` comparisons — posts with bad dates float to unpredictable positions without any visible error.

This is related to WR-01 (no frontmatter validation), but is independently exploitable because JSX_POSTS dates are hardcoded strings that could also be edited incorrectly.

**Fix:** Either validate dates at ingestion (see WR-01) or add a guard in the sort comparator:

```ts
(a, b) => {
  const ta = new Date(a.date).getTime();
  const tb = new Date(b.date).getTime();
  if (isNaN(ta) || isNaN(tb)) {
    throw new Error(`Invalid date in BlogPost: "${isNaN(ta) ? a.slug : b.slug}"`);
  }
  return tb - ta;
}
```

---

## Info

### IN-01: `remark-gfm` in `dependencies` but not used

**File:** `package.json:45`, `next.config.ts:131-136`
**Issue:** `remark-gfm` is listed as a production dependency (`"remark-gfm": "^4.0.1"`) but the `remarkPlugins: []` array in `next.config.ts` explicitly omits it, with a comment explaining this is intentional pending a Turbopack fix. A production dependency that is intentionally not loaded adds bundle weight and maintenance overhead.

**Fix:** Move `remark-gfm` to `devDependencies` for now, or add a comment in `package.json` cross-referencing the Turbopack issue so the intent is clear. When Phase 55 re-enables it, move it back to `dependencies`.

### IN-02: Test hardcodes the only valid `AuthorSlug` value — will need updating when a second author is added

**File:** `tests/blog.test.ts:73-77`
**Issue:** The test "every author resolves to 'roman-ustyugov'" asserts that all posts must have a specific author slug. This assertion will fail as soon as a second author contributes an article, requiring a test rewrite rather than just adding test data. The test intent (authors must be valid `AuthorSlug` values) is sound, but the assertion is over-specified.

**Fix:** Import the valid `AuthorSlug` union from `lib/authors` and test membership instead of equality:

```ts
import { AUTHORS } from "@/lib/authors"; // or equivalent export
it("every author is a known AuthorSlug", () => {
  const validSlugs = Object.keys(AUTHORS);
  for (const post of posts) {
    expect(validSlugs).toContain(post.author);
  }
});
```

### IN-03: Absolute local filesystem path in a code comment

**File:** `next.config.ts:8`
**Issue:** The comment on line 8 embeds an absolute local path:

```
// — see /Users/romanustyugov/Desktop/founder prestigo/routes/03-noindex-rules-20-red-routes.md
```

This is a developer machine path that will not resolve on any other machine or CI environment. It leaks the developer's local directory structure and adds noise for collaborators.

**Fix:** Replace with a relative reference or a description of the document:

```ts
// — see founder-notes/routes/03-noindex-rules-20-red-routes.md (local founder docs)
```

---

_Reviewed: 2026-05-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
