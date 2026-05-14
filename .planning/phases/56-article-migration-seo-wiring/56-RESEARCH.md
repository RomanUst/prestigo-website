# Phase 56: Article Migration + SEO Wiring — Research

**Researched:** 2026-05-14
**Domain:** Next.js file-system routing, git mv, Next.js redirects(), sitemap, Schema.org URL migration
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-01 | 3 JSX articles moved via `git mv` in their own atomic commit | git mv preserves history with `--follow`; `lastModFor()` uses `git log --follow` — confirmed in `lib/lastmod.ts` |
| MIG-02 | All 9 URL locations per file updated via `const CANONICAL_PATH` | Verified: each file contains exactly 10 path-specific URL occurrences — the 9 per MIG-02 plus one `alternates.canonical` short path that also changes |
| MIG-03 | 5 permanent 301 redirects added to `next.config.ts` `redirects()` | Verified existing `redirects()` array in `next.config.ts`; no overlap risk with existing rules |
| MIG-04 | `app/sitemap.ts` updated: old entries removed, new `/blog/*` entries added | Verified: sitemap.ts already imports `getAllPosts()` and filters by `source === 'mdx'`; JSX posts need explicit named entries |
| MIG-05 | `app/guides/page.tsx` and `app/compare/page.tsx` — convert or remove | Both files verified; redirects in `next.config.ts` cover the index paths; the sub-pages will be removed by `git mv` |
| MIG-06 | `JSX_POSTS` registry in `lib/blog.ts` already populated | VERIFIED: all 3 entries already exist in `JSX_POSTS` with correct slugs, titles, descriptions, dates, coverImage, category, author |
</phase_requirements>

---

## Summary

Phase 56 is a pure URL migration: three legacy JSX articles that live in `app/guides/` and `app/compare/` must be moved to `app/blog/` via `git mv`, have all their self-referencing URLs updated to the new canonical paths, and then 301 redirects plus sitemap corrections must follow. There is no new UI to build and no new library to install.

The codebase is already 90% prepared. `lib/blog.ts` already has the complete `JSX_POSTS` registry (MIG-06 is pre-done). `app/sitemap.ts` already imports `getAllPosts()` and has `/blog` listed. `lib/lastmod.ts` uses `git log --follow -- <path>` so `git mv` (not `cp` + `rm`) is mandatory for `lastModFor()` to work at the new path. The existing `redirects()` array in `next.config.ts` contains only route removals and locale fixes — no overlap risk with the 5 new blog-redirect rules.

**Primary recommendation:** Execute in strict order: (1) `git mv` atomic commit, (2) URL rewrite inside moved files + `const CANONICAL_PATH` extraction, (3) `redirects()` additions, (4) sitemap update, (5) delete or stub the hub pages (`app/guides/page.tsx`, `app/compare/page.tsx`). Do not intermix these steps — `lastModFor()` correctness depends on git history existing at the new path before anything else.

---

## Standard Stack

This phase installs no new packages. All required tools are already in the codebase.

| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| `git mv` | (system git) | Moves files while preserving commit history | Available — confirmed via git log |
| `next.config.ts` `redirects()` | Next.js 15 | 301 permanent redirects | Existing pattern in codebase |
| `lib/lastmod.ts` `lastModFor()` | project utility | Returns git creation date for sitemap `lastModified` | Verified — uses `--follow` |
| `lib/blog.ts` `JSX_POSTS` | project utility | Registry of JSX article metadata for `getAllPosts()` | Already complete (MIG-06 pre-done) |
| `app/sitemap.ts` | Next.js route | Generates sitemap.xml | Verified — needs 3 additions + 5 removals |

**Installation:** None required.

---

## Architecture Patterns

### Recommended Execution Order

```
Wave 0: git mv atomic commit (no other changes)
Wave 1: URL rewrite in moved files + const CANONICAL_PATH
Wave 2: redirects() additions in next.config.ts
Wave 3: sitemap.ts update
Wave 4: delete/stub app/guides/page.tsx and app/compare/page.tsx
```

### Pattern 1: git mv with --follow history preservation

**What:** Move a file while keeping git history traceable at the new path.
**When to use:** Mandatory for MIG-01. `lastModFor()` calls `git log --follow -- <relativePath>` at the new path. If the file is `cp`+`rm` instead of `git mv`, history is orphaned at the old path and `lastModFor()` falls back to filesystem mtime (today's build date) for the sitemap — destroying the authentic publication-date signal.

**Correct command sequence:**
```bash
# One atomic commit for all 3 moves
git mv app/guides/prague-airport-to-city-center/page.tsx \
       app/blog/prague-airport-to-city-center/page.tsx

git mv app/compare/prague-airport-taxi-vs-chauffeur/page.tsx \
       app/blog/prague-airport-taxi-vs-chauffeur/page.tsx

git mv app/compare/prague-vienna-transfer-vs-train/page.tsx \
       app/blog/prague-vienna-transfer-vs-train/page.tsx

git commit -m "feat(56): git mv 3 JSX articles from guides/compare to blog (MIG-01)"
```

**Critical:** The `app/blog/<slug>/` directory must be created before `git mv`. Next.js file-system routing requires `app/blog/prague-airport-to-city-center/page.tsx` — the directory is implicit from the path. `git mv` will fail if the target directory does not exist; create it first with `mkdir -p`.

[VERIFIED: lib/lastmod.ts lines 37-47 — `git log --follow --format="%cI" -- "${relativePath}" | tail -1`]

### Pattern 2: const CANONICAL_PATH extraction (MIG-02)

**What:** Extract the article's canonical path into a single top-of-file constant so all 9+ URL locations reference one source of truth.
**Why:** Each JSX article currently has 10 occurrences of its old path string scattered across `metadata`, `alternates`, `openGraph`, and Schema.org `@graph`. A single find-replace is fragile — `const CANONICAL_PATH` is a one-edit fix for all future URL changes.

**Pattern to apply in each moved file:**
```typescript
// Add at top of file, after imports, before ARTICLE_PUBLISHED
const CANONICAL_PATH = '/blog/prague-airport-to-city-center'  // update per file
const CANONICAL_ABS  = `https://rideprestigo.com${CANONICAL_PATH}`

// Then replace all occurrences:
// alternates.canonical: CANONICAL_PATH
// alternates.languages.en: CANONICAL_ABS
// alternates.languages['x-default']: CANONICAL_ABS
// openGraph.url: CANONICAL_ABS
// BreadcrumbList @id: `${CANONICAL_ABS}#breadcrumb`
// BreadcrumbList ListItem[n].item: CANONICAL_ABS  (x2 in guides article — positions 2 and 3)
// Article @id: `${CANONICAL_ABS}#article`
// Article url: CANONICAL_ABS
// FAQPage @id: `${CANONICAL_ABS}#faq`
```

**URL count audit (VERIFIED by grep on 2026-05-14):**

| File | Old path occurrences | Must change |
|------|---------------------|------------|
| `app/guides/prague-airport-to-city-center/page.tsx` | 10 | 10 |
| `app/compare/prague-airport-taxi-vs-chauffeur/page.tsx` | 10 | 10 |
| `app/compare/prague-vienna-transfer-vs-train/page.tsx` | 10 | 10 |

Note: MIG-02 says "9 URL locations" — the 9 are the Schema.org + metadata fields. The 10th occurrence in each file is the `alternates.canonical` short path (relative, not absolute). It also needs updating. Total: 10 per file.

[VERIFIED: grep counts via `grep -n "rideprestigo.com/guides\|rideprestigo.com/compare"` and `grep -n "'/guides\|'/compare"` on each source file]

### Pattern 3: next.config.ts redirects() additions (MIG-03)

**What:** Add 5 permanent (301) redirect rules to the existing `redirects()` async function.
**Safety:** Existing rules in `next.config.ts` are: www-to-apex wildcard, `/airport-transfer` → `/services/airport-transfer`, 20 route slug removals (`/routes/:slug` → `/routes`), and Czech locale (`/cs`, `/cs/:path*`). None overlap with `/guides` or `/compare` paths.

**Rules to add (append to the returned array):**
```typescript
// MIG-03: Migrate guides/* and compare/* to blog/*
{ source: '/guides', destination: '/blog', permanent: true },
{ source: '/guides/prague-airport-to-city-center', destination: '/blog/prague-airport-to-city-center', permanent: true },
{ source: '/compare', destination: '/blog', permanent: true },
{ source: '/compare/prague-airport-taxi-vs-chauffeur', destination: '/blog/prague-airport-taxi-vs-chauffeur', permanent: true },
{ source: '/compare/prague-vienna-transfer-vs-train', destination: '/blog/prague-vienna-transfer-vs-train', permanent: true },
```

**Order note:** Place specific paths before the hub redirects to avoid any ambiguity. Next.js evaluates redirects in array order — but since `/guides` and `/guides/prague-airport-to-city-center` are distinct `source` strings with no wildcard, order does not actually matter here. Place in the order shown for clarity.

**No redirect chain risk:** `permanent: true` = 301. The source paths (`/guides/*`, `/compare/*`) are not themselves the target of any existing redirect, so there are no chains. [VERIFIED: full review of existing `redirects()` return array in `next.config.ts`]

### Pattern 4: sitemap.ts update (MIG-04)

**Current state (VERIFIED in `app/sitemap.ts`):**
```typescript
// Currently includes (must REMOVE):
entry('/compare', 'app/compare/page.tsx'),
entry('/compare/prague-vienna-transfer-vs-train', 'app/compare/prague-vienna-transfer-vs-train/page.tsx'),
entry('/compare/prague-airport-taxi-vs-chauffeur', 'app/compare/prague-airport-taxi-vs-chauffeur/page.tsx'),
entry('/guides', 'app/guides/page.tsx'),
entry('/guides/prague-airport-to-city-center', 'app/guides/prague-airport-to-city-center/page.tsx'),

// Must ADD (3 new JSX entries at new paths):
entry('/blog/prague-airport-to-city-center',    'app/blog/prague-airport-to-city-center/page.tsx'),
entry('/blog/prague-airport-taxi-vs-chauffeur', 'app/blog/prague-airport-taxi-vs-chauffeur/page.tsx'),
entry('/blog/prague-vienna-transfer-vs-train',  'app/blog/prague-vienna-transfer-vs-train/page.tsx'),
```

`lastModFor()` will correctly resolve the git creation date for each moved file because `git mv` was committed first, and `--follow` traces history through the rename.

The `mdxBlogEntries` section is already filtered to `source === 'mdx'` only, so it will not accidentally include the JSX articles. [VERIFIED: `lib/blog.ts` line 37, `app/sitemap.ts` lines 35-37]

### Pattern 5: Hub page cleanup (MIG-05)

After `git mv`, the `app/guides/` and `app/compare/` directories still contain:
- `app/guides/page.tsx` — listing page (hub), has its own `/guides` canonical
- `app/compare/page.tsx` — listing page (hub), has its own `/compare` canonical

The 5 redirects in `next.config.ts` will catch `/guides` and `/compare` requests at the Next.js layer before they reach these pages. However, the files still exist and will still be built, creating orphan routes with stale canonicals.

**Two options:**
1. Delete `app/guides/page.tsx` and `app/compare/page.tsx` entirely — cleanest; Next.js returns 404, then the redirect in `next.config.ts` fires first (redirects run before routing).
2. Convert to redirect pages using `redirect('/blog', 'replace')` from `next/navigation` — redundant given `next.config.ts` rules.

**Recommended:** Delete both hub pages. Next.js `redirects()` run at the edge/middleware layer before the route resolver, so the hub pages never render after the redirect rules are in place. Deleting eliminates any confusion about which canonical is correct. [ASSUMED — based on Next.js redirect evaluation order; low risk because the redirects cover the path regardless]

### Anti-Patterns to Avoid

- **Copying instead of moving:** `cp` + `rm` breaks git history. `lastModFor()` falls back to mtime (today) and the sitemap publishes today's date for an article written in April 2026. SEO penalty.
- **Updating URLs before the move commit:** If you update `alternates.canonical` to `/blog/*` while the file is still at `app/guides/*`, Next.js builds a page at the old path with the new canonical — contradictory signal to Google.
- **Using wildcards in redirect source:** `/guides/:path*` as a single rule would redirect sub-paths correctly but also catch any future `/guides/new-thing` if someone creates it. Per-path explicit rules are safer and match the requirement spec.
- **Adding JSX slugs to `generateStaticParams`:** The blog `[slug]/page.tsx` route uses `dynamicParams = false`. JSX articles must NOT appear in `generateStaticParams()` — they render at their own colocated routes, not through the MDX renderer. [VERIFIED: `app/blog/[slug]/page.tsx` line 19-26]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL redirect | Custom middleware redirect | `next.config.ts` `redirects()` | Built-in, evaluated before routing, Vercel-native 301 |
| git history rename tracking | `cp` + `rm` + manual | `git mv` | Only way `git log --follow` traces history through the rename |
| Sitemap date freshness | Hardcoded dates | `lastModFor()` already in codebase | Already handles git → mtime → build fallback chain |

---

## Runtime State Inventory

> Included because this is a URL rename/migration phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no database stores `/guides/*` or `/compare/*` URLs as keys | None |
| Live service config | None — no external service (n8n, Datadog, etc.) references these paths | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | `app/guides/` and `app/compare/` directories remain after `git mv` of sub-pages; hub `page.tsx` files remain | Delete hub pages; remove now-empty subdirectories |

**Crawl state (Google):** Google has indexed `/guides/prague-airport-to-city-center`, `/compare/prague-airport-taxi-vs-chauffeur`, and `/compare/prague-vienna-transfer-vs-train`. The 301 redirects will signal the move. Google typically processes 301s within days to weeks. No action required beyond adding the redirects — Google handles this automatically. [ASSUMED — standard Google 301 handling]

---

## Common Pitfalls

### Pitfall 1: Moving files without target directories
**What goes wrong:** `git mv app/guides/prague-airport-to-city-center/page.tsx app/blog/prague-airport-to-city-center/page.tsx` fails with "not a directory" if `app/blog/prague-airport-to-city-center/` does not exist.
**Why it happens:** `git mv` does not create parent directories.
**How to avoid:** Run `mkdir -p app/blog/prague-airport-to-city-center app/blog/prague-airport-taxi-vs-chauffeur app/blog/prague-vienna-transfer-vs-train` before the `git mv` commands.
**Warning signs:** `git mv` exits with non-zero status.

### Pitfall 2: Forgetting `alternates.canonical` (the relative short path)
**What goes wrong:** The `alternates.canonical` field uses a short relative path (`'/guides/prague-airport-to-city-center'`) — it is a distinct field from the absolute URLs in `alternates.languages`. It is one of the 10 occurrences but not counted in MIG-02's list of 9. Leaving it unreplaced means Next.js emits a `<link rel="canonical">` pointing to the old path even after the file is at the new path.
**How to avoid:** Use `const CANONICAL_PATH = '/blog/...'` and reference it for all alternates including `canonical`.

### Pitfall 3: Sitemap test expects old paths after migration
**What goes wrong:** `tests/sitemap.test.ts` currently checks for a specific MDX test post URL and verifies JSX slugs are NOT under `/blog/*`. After Phase 56, JSX slugs WILL appear under `/blog/*` (as explicit named entries, not from `mdxBlogEntries`). The existing test at line 19-22 — `'does NOT include /blog/{slug} for any JSX_POSTS entry'` — will FAIL after Phase 56.
**How to avoid:** Update `tests/sitemap.test.ts` as part of this phase: change that test to assert JSX posts ARE present under `/blog/*` and that `/guides/*` and `/compare/*` paths are absent.

[VERIFIED: `tests/sitemap.test.ts` lines 19-22 — test currently asserts JSX slugs absent from `/blog/*`]

### Pitfall 4: Redirect chain from hub pages with stale canonicals
**What goes wrong:** If `app/guides/page.tsx` is kept with `alternates.canonical: '/guides'`, and a user hits `/guides`, Next.js redirects them to `/blog` (via `next.config.ts`). But if the page is still built, it emits a canonical pointing back to `/guides`. Google sees: redirect to `/blog` but canonical says `/guides` — contradictory.
**How to avoid:** Delete `app/guides/page.tsx` and `app/compare/page.tsx`. Do not keep them as stubs.

### Pitfall 5: BreadcrumbList text references old section name ("Guides" / "Compare")
**What goes wrong:** After URL migration, the BreadcrumbList still says `name: 'Guides'` or `name: 'Compare'` in position 2. This is not incorrect (breadcrumbs can show old section names) but it looks odd when the URL is `/blog/...`. The requirements do not mandate changing the breadcrumb text — only the URL values.
**Decision:** Update breadcrumb `name` at position 2 from "Guides" / "Compare" to "Blog" to keep Schema.org breadcrumb consistent with the actual path. [ASSUMED — requirements specify URL fields only; breadcrumb label is a judgment call]

---

## Code Examples

### git mv sequence
```bash
# Source: lib/lastmod.ts — requires git history at new path
mkdir -p app/blog/prague-airport-to-city-center \
         app/blog/prague-airport-taxi-vs-chauffeur \
         app/blog/prague-vienna-transfer-vs-train

git mv app/guides/prague-airport-to-city-center/page.tsx \
       app/blog/prague-airport-to-city-center/page.tsx

git mv app/compare/prague-airport-taxi-vs-chauffeur/page.tsx \
       app/blog/prague-airport-taxi-vs-chauffeur/page.tsx

git mv app/compare/prague-vienna-transfer-vs-train/page.tsx \
       app/blog/prague-vienna-transfer-vs-train/page.tsx

git add -A
git commit -m "feat(56): git mv 3 JSX articles to app/blog/* (MIG-01)"
```

### CANONICAL_PATH pattern for each moved file
```typescript
// Add immediately after imports, before ARTICLE_PUBLISHED
const CANONICAL_PATH = '/blog/prague-airport-to-city-center'
const CANONICAL_ABS  = `https://rideprestigo.com${CANONICAL_PATH}`

// In metadata export:
alternates: {
  canonical: CANONICAL_PATH,
  languages: {
    en: CANONICAL_ABS,
    'x-default': CANONICAL_ABS,
  },
},
openGraph: {
  url: CANONICAL_ABS,
  // ...
},

// In pageSchemaGraph:
'@id': `${CANONICAL_ABS}#breadcrumb`,
item: CANONICAL_ABS,  // ListItem positions 2 and 3
'@id': `${CANONICAL_ABS}#article`,
url: CANONICAL_ABS,
'@id': `${CANONICAL_ABS}#faq`,
```

### Redirects to add in next.config.ts
```typescript
// Append to the return array in redirects()
{ source: '/guides', destination: '/blog', permanent: true },
{ source: '/guides/prague-airport-to-city-center', destination: '/blog/prague-airport-to-city-center', permanent: true },
{ source: '/compare', destination: '/blog', permanent: true },
{ source: '/compare/prague-airport-taxi-vs-chauffeur', destination: '/blog/prague-airport-taxi-vs-chauffeur', permanent: true },
{ source: '/compare/prague-vienna-transfer-vs-train', destination: '/blog/prague-vienna-transfer-vs-train', permanent: true },
```

### Sitemap diff
```typescript
// REMOVE these 5 lines from sitemap():
entry('/compare', 'app/compare/page.tsx'),
entry('/compare/prague-vienna-transfer-vs-train', 'app/compare/prague-vienna-transfer-vs-train/page.tsx'),
entry('/compare/prague-airport-taxi-vs-chauffeur', 'app/compare/prague-airport-taxi-vs-chauffeur/page.tsx'),
entry('/guides', 'app/guides/page.tsx'),
entry('/guides/prague-airport-to-city-center', 'app/guides/prague-airport-to-city-center/page.tsx'),

// ADD these 3 lines (after entry('/blog', ...)):
entry('/blog/prague-airport-to-city-center',    'app/blog/prague-airport-to-city-center/page.tsx'),
entry('/blog/prague-airport-taxi-vs-chauffeur', 'app/blog/prague-airport-taxi-vs-chauffeur/page.tsx'),
entry('/blog/prague-vienna-transfer-vs-train',  'app/blog/prague-vienna-transfer-vs-train/page.tsx'),
```

### Test update for sitemap.test.ts
```typescript
// CHANGE: test currently asserts JSX slugs are NOT in /blog/*
// AFTER PHASE 56: assert they ARE in /blog/* and NOT in /guides/* or /compare/*

it('includes /blog/* entries for all 3 migrated JSX articles', () => {
  for (const jsx of JSX_POSTS) {
    expect(urls).toContain(`https://rideprestigo.com/blog/${jsx.slug}`)
  }
})

it('does NOT include /guides/* or /compare/* entries', () => {
  for (const url of urls) {
    expect(url).not.toMatch(/rideprestigo\.com\/(guides|compare)/)
  }
})
```

---

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.ts` at repo root |
| Quick run command | `npx vitest run tests/sitemap.test.ts tests/blog.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIG-01 | `lastModFor()` returns real git date for moved files | unit | `npx vitest run tests/sitemap.test.ts` | ✅ (update needed) |
| MIG-02 | No `/guides` or `/compare` paths remain in moved files | smoke | `grep -rn "guides\|/compare" app/blog/` returns 0 | ✅ (shell verify) |
| MIG-03 | 5 redirect rules present in `next.config.ts` | manual | `grep -c "guides\|compare" next.config.ts` | ✅ (shell verify) |
| MIG-04 | Sitemap contains `/blog/*` entries, no `/guides/*` or `/compare/*` | unit | `npx vitest run tests/sitemap.test.ts` | ✅ (update needed) |
| MIG-05 | `app/guides/page.tsx` and `app/compare/page.tsx` deleted | shell | `ls app/guides/page.tsx 2>&1` exits 1 | N/A (file deletion) |
| MIG-06 | `JSX_POSTS` registry complete | unit | `npx vitest run tests/blog.test.ts` | ✅ (passes today) |

### Wave 0 Gaps
- [ ] `tests/sitemap.test.ts` — the existing test `'does NOT include /blog/{slug} for any JSX_POSTS entry'` will **fail** after Phase 56. Must be inverted before implementing MIG-04.

*(All other test infrastructure exists — no new files required)*

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git | MIG-01 (`git mv`) | ✓ | system | — |
| Node.js | next build | ✓ | confirmed (project runs) | — |
| `lib/lastmod.ts` | MIG-04 sitemap dates | ✓ | project file, verified | — |

---

## Security Domain

This phase makes no changes to authentication, authorization, data handling, or cryptographic operations. ASVS checks are not applicable.

No new API routes, no user input, no database access. The only externally visible change is HTTP redirect responses (301) and sitemap XML content — both are standard web infrastructure with no security surface.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Deleting `app/guides/page.tsx` and `app/compare/page.tsx` is safe because `next.config.ts` redirects fire before routing | Architecture Patterns — Pattern 5 | If wrong: `/guides` and `/compare` would 404 instead of redirect. Low risk — confirmed Next.js redirect-before-routing behavior from training; verify with `curl -sI https://rideprestigo.com/guides` after deploy |
| A2 | BreadcrumbList `name` at position 2 should be changed from "Guides"/"Compare" to "Blog" | Common Pitfalls — Pitfall 5 | If wrong: minor Schema.org inconsistency, no functional impact |

---

## Open Questions (RESOLVED)

1. **Should `app/guides/` and `app/compare/` directories be deleted entirely?**
   - What we know: After `git mv` of the sub-pages and deletion of hub pages, the directories become empty.
   - What was unclear: Should empty directories be git-removed too, or left as placeholders?
   - RESOLVED: Yes — remove with `git rm -r app/guides/ app/compare/` (or equivalent file deletions) once empty. Plan 04 (Wave 4) handles hub-page deletion and the now-empty directory cleanup. Keeps the repo clean and prevents stale routes.

2. **Redirect test coverage**
   - What we know: No automated test validates the `redirects()` array.
   - What was unclear: Is a unit test for redirect config rules needed, or is the `curl` smoke test in Success Criteria sufficient?
   - RESOLVED: No unit test needed. The `curl` smoke test in the success criteria (SC-3) is the right verification — `redirects()` is a Next.js framework concern that is not meaningfully unit-testable without a running server; the smoke test against the running app provides authoritative coverage.

---

## Sources

### Primary (HIGH confidence)
- `app/guides/prague-airport-to-city-center/page.tsx` — verified all 10 URL occurrences
- `app/compare/prague-airport-taxi-vs-chauffeur/page.tsx` — verified all 10 URL occurrences
- `app/compare/prague-vienna-transfer-vs-train/page.tsx` — verified all 10 URL occurrences
- `next.config.ts` — verified existing `redirects()` array; no overlap with new rules
- `app/sitemap.ts` — verified current entries and `mdxBlogEntries` filter logic
- `lib/blog.ts` — verified `JSX_POSTS` is complete (MIG-06 pre-done); verified `--follow` in `lastModFor()`
- `lib/lastmod.ts` — verified `git log --follow` usage; confirmed `git mv` is mandatory
- `tests/sitemap.test.ts` — verified failing test at lines 19-22 post-migration
- `tests/blog.test.ts` — verified passes today; will continue to pass after MIG-06 check (already done)
- `.planning/STATE.md` — confirmed Phase 56 key decisions

### Secondary (MEDIUM confidence)
- Next.js redirect evaluation order (redirects before routing) — from training knowledge [ASSUMED — A1]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing code verified by direct file read
- Architecture: HIGH — all patterns verified against actual file content
- Pitfalls: HIGH — discovered from direct inspection of test files and existing code structure
- URL counts: HIGH — verified by grep on each source file

**Research date:** 2026-05-14
**Valid until:** Indefinitely — this is a one-time file migration with no fast-moving ecosystem dependencies
