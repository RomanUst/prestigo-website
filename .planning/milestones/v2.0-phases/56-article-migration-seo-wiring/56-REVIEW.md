---
phase: 56-article-migration-seo-wiring
reviewed: 2026-05-14T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - app/blog/prague-airport-taxi-vs-chauffeur/page.tsx
  - app/blog/prague-airport-to-city-center/page.tsx
  - app/blog/prague-vienna-transfer-vs-train/page.tsx
  - app/sitemap.ts
  - next.config.ts
  - tests/sitemap.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 56: Code Review Report

**Reviewed:** 2026-05-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Six files were reviewed covering the three migrated JSX blog articles, the sitemap generator, Next.js config, and the sitemap test suite.

The migration itself is clean: canonical paths, hreflang, Open Graph, and Article/FAQPage schema are all present and consistent across the three articles. The sitemap correctly registers the JSX articles via hardcoded entries and filters MDX posts by `source === 'mdx'` to avoid duplication. Redirects in `next.config.ts` from the old `/guides/*` and `/compare/*` paths are correct and permanent. Tests cover the sitemap contract adequately.

One critical issue was found: all three article pages reproduce the exact `</script>`-injection vulnerability that was fixed in `app/blog/[slug]/page.tsx` in phase 55 (commit `fd11633`). That fix was not forward-propagated to the migrated files. Additionally, all three pages have an incorrect `item` URL on the breadcrumb "Blog" list item, which will surface as a structured data error in Google Search Console.

---

## Critical Issues

### CR-01: `</script>` injection in JSON-LD — all three article pages

**Files:**
- `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx:255`
- `app/blog/prague-airport-to-city-center/page.tsx:350`
- `app/blog/prague-vienna-transfer-vs-train/page.tsx:269`

**Issue:** All three pages render their JSON-LD structured data using bare `JSON.stringify()` inside `dangerouslySetInnerHTML`:

```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemaGraph) }} />
```

If any string value in `pageSchemaGraph` (FAQ answers, descriptions, rationale blocks) contains the sequence `</script>`, the browser HTML parser terminates the `<script>` block at that point, and any HTML after it is rendered as page content or interpreted as executable markup. The content here includes multi-paragraph FAQ answers and profile narratives — content that may evolve over time and could introduce the sequence inadvertently.

This is the same vulnerability fixed in `app/blog/[slug]/page.tsx` by commit `fd11633` (phase 55), where a `safeJsonLd()` helper was introduced. That fix was not applied to the migrated files.

**Fix:** Apply the same `safeJsonLd` helper to all three files (inline or extracted to a shared util):

```tsx
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>')
}

// Then in JSX:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: safeJsonLd(pageSchemaGraph) }}
/>
```

Alternatively, extract `safeJsonLd` into `lib/json-ld.ts` and import it in all four files (`app/blog/[slug]/page.tsx` and the three migrated pages) so there is a single, shared implementation.

---

## Warnings

### WR-01: BreadcrumbList "Blog" item points to the article itself — all three pages

**Files:**
- `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx:217`
- `app/blog/prague-airport-to-city-center/page.tsx:312`
- `app/blog/prague-vienna-transfer-vs-train/page.tsx:231`

**Issue:** In the JSON-LD `BreadcrumbList` on every page, position 2 ("Blog") has its `item` URL set to `CANONICAL_ABS` — the article's own URL — rather than the blog hub:

```ts
{ '@type': 'ListItem', position: 2, name: 'Blog', item: CANONICAL_ABS },
{ '@type': 'ListItem', position: 3, name: 'Taxi vs Chauffeur at Prague Airport', item: CANONICAL_ABS },
```

Both the Blog item and the Article item resolve to the same URL. Google's Rich Results Test and schema.org validators flag this as a structural error: a breadcrumb ancestor must point to a distinct parent page, not to the leaf page itself. In practice this may cause the breadcrumb rich result to be suppressed in SERPs.

**Fix:** Change the Blog list item to point to the blog index URL:

```ts
{ '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://rideprestigo.com/blog' },
```

Apply to all three files. The `CANONICAL_ABS` constant should only appear on position 3.

### WR-02: JSX article entries in `sitemap.ts` require a two-place update when slugs change

**File:** `app/sitemap.ts:54-56`

**Issue:** The three JSX article slugs are hardcoded in `sitemap.ts` independently of their canonical definitions in `lib/blog.ts` (`JSX_POSTS`):

```ts
entry('/blog/prague-airport-to-city-center',    'app/blog/prague-airport-to-city-center/page.tsx'),
entry('/blog/prague-airport-taxi-vs-chauffeur', 'app/blog/prague-airport-taxi-vs-chauffeur/page.tsx'),
entry('/blog/prague-vienna-transfer-vs-train',  'app/blog/prague-vienna-transfer-vs-train/page.tsx'),
```

`JSX_POSTS` already holds the correct slugs and source file derivation. If a slug is added or changed in `JSX_POSTS`, the sitemap block will silently diverge (the existing sitemap test only checks presence of the three current slugs; it would not catch a new fourth post). The test in `tests/sitemap.test.ts:19-23` iterates `JSX_POSTS` for URL presence but does not verify the `sourceFile` path used for `lastModified`, so a path mismatch would also go undetected.

**Fix:** Replace the three hardcoded `entry()` calls with a derived list, mirroring how `mdxBlogEntries` and `routeEntries` work:

```ts
const jsxBlogEntries: MetadataRoute.Sitemap = JSX_POSTS.map((p) =>
  entry(`/blog/${p.slug}`, `app/blog/${p.slug}/page.tsx`)
)

// Then in the return array:
...jsxBlogEntries,
```

Import `JSX_POSTS` from `@/lib/blog` (it is already exported). The `app/blog/${p.slug}/page.tsx` path pattern is consistent with how MDX entries use `content/blog/${p.slug}.mdx`. This makes `JSX_POSTS` the single source of truth for both blog listing and sitemap registration.

---

## Info

### IN-01: `lastmod.ts` uses oldest commit date — contradicts sitemap freshness goal

**File:** `lib/lastmod.ts:31-48`

**Issue:** The `lastModFor()` function intentionally fetches the *oldest* (creation) commit for each file (`tail -1` on `git log`), reasoning that batch commits would otherwise reset all pages to the same date. However, `app/sitemap.ts` comment (line 13) states: "real per-page dates let Search Console see genuine freshness signals." Using the oldest commit means a genuinely revised article will never have its `lastModified` updated in the sitemap — the date is permanently locked to the original commit, regardless of subsequent content edits.

This is a design trade-off, not a bug, but the two comments are contradictory and the chosen strategy defeats the stated freshness goal for revised pages.

**Fix:** Use the most-recent commit date (`head -1` / omit `tail -1`) and accept that a chore/batch commit touching multiple files will produce a uniform date for those files. Alternatively, document the trade-off explicitly and remove the claim about "genuine freshness signals" from the sitemap comment, to avoid future confusion.

### IN-02: Local filesystem path leaked in `next.config.ts` comment

**File:** `next.config.ts:6`

**Issue:** The comment contains an absolute local machine path:

```ts
// — see /Users/romanustyugov/Desktop/founder prestigo/routes/03-noindex-rules-20-red-routes.md
```

This leaks the developer's local filesystem layout (username, directory structure) into the committed source. It is not a security risk in a typical private repo, but it is a hygiene issue that should be replaced with a relative or repo-relative reference.

**Fix:** Replace with a relative reference:

```ts
// — see docs/routes/03-noindex-rules-20-red-routes.md (or equivalent repo-relative path)
```

The same pattern appears in the `app/sitemap.ts` comment at line 9 and should be cleaned up there as well.

---

_Reviewed: 2026-05-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
