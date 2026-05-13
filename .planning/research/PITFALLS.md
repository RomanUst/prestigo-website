# Pitfalls Research

**Domain:** MDX blog addition + URL migration on existing Next.js 16 App Router site
**Researched:** 2026-05-13
**Confidence:** HIGH (most pitfalls verified against official Next.js docs, GitHub issues, and Google Search Central)

---

## Critical Pitfalls

### Pitfall 1: Importing from wrong next-mdx-remote path (Pages Router vs App Router)

**What goes wrong:**
`import { MDXRemote } from 'next-mdx-remote'` is the Pages Router API. In App Router it must be `import { MDXRemote } from 'next-mdx-remote/rsc'`. The RSC import returns an async Server Component; the legacy import returns a client component that expects serialized output from `serialize()`. Mixing the two causes a build error or silent runtime failure where the component renders nothing.

**Why it happens:**
Most tutorials, Stack Overflow answers, and even the official README lead with the Pages Router API. Copying an example without reading the "App Router" section of the README picks up the wrong import.

**How to avoid:**
In `lib/blog.ts` and `app/blog/[slug]/page.tsx` always import from `next-mdx-remote/rsc`. Add an ESLint rule or a single comment at the top of the file: `// App Router — use /rsc import only`. Do not create a shared utility file that wraps `MDXRemote`, as it breaks Next.js code-splitting for RSC.

**Warning signs:**
- TypeScript error: "MDXRemote is not an async component" or "Expected a synchronous component"
- Rendered page is blank even though no build error occurs
- Hydration mismatch warning in browser console mentioning `<div>` replacement

**Phase to address:** Phase 54 (infrastructure — MDX pipeline)

---

### Pitfall 2: Passing a `'use client'` component directly to MDXRemote's components map

**What goes wrong:**
The RSC `<MDXRemote>` renders on the server. If a custom component in the `components` prop itself is a Client Component (marked `'use client'`), it cannot be passed via React Context (which RSC does not support). The `MDXProvider` pattern from `@mdx-js/react` is completely unavailable in RSC. Attempting to use it causes a runtime error: "Context can only be read in a Client Component."

**Why it happens:**
The `MDXProvider` pattern is well-documented for Pages Router and pre-RSC apps. Developers migrate existing code without realising Context is gone in RSC.

**How to avoid:**
Pass custom components directly as props to `<MDXRemote components={{ ... }} />`. Client Components can be listed in the map — they are imported server-side as references and hydrated client-side automatically. Do not wrap `<MDXRemote>` in a Client Component to work around this, as it nullifies the RSC benefit.

**Warning signs:**
- Error at runtime: "You're importing a component that needs context. It only works in a Client Component"
- Error: "Cannot read properties of undefined (reading 'use')" from @mdx-js/react

**Phase to address:** Phase 54 (infrastructure)

---

### Pitfall 3: Frontmatter dates becoming strings after JSON boundary crossing

**What goes wrong:**
`gray-matter` parses YAML dates (e.g., `date: 2026-05-01`) into JavaScript `Date` objects. When the result crosses a React Server Component serialization boundary or is stored in a variable passed between modules, `Date` objects are silently converted to strings via `JSON.stringify`. The `lib/blog.ts` aggregator may return `Date` objects that immediately break when compared (`sort((a, b) => b.date - a.date)` returns `NaN`), or the sort works but metadata renders as `[object Object]`.

**Why it happens:**
gray-matter's YAML parser is helpful — it auto-coerces date strings to `Date`. This is unexpected when you think you're storing a plain string.

**How to avoid:**
In `lib/blog.ts`, always call `.toISOString()` (or `.toString()`) on the date immediately after parsing: `date: frontmatter.date instanceof Date ? frontmatter.date.toISOString() : String(frontmatter.date)`. Define a `BlogPost` TypeScript type with `date: string` (never `Date`) to catch misuse at compile time.

**Warning signs:**
- Blog listing page shows articles sorted randomly or all with the same date
- `date` renders as `[object Object]` or `Invalid Date`
- TypeScript allows `Date` where you expected `string`

**Phase to address:** Phase 54 (infrastructure — lib/blog.ts)

---

### Pitfall 4: Static JSX blog pages conflicting with the dynamic `[slug]` route

**What goes wrong:**
The hybrid model places JSX articles at `app/blog/prague-airport-to-city-center/page.tsx` (static directory) alongside the dynamic `app/blog/[slug]/page.tsx`. This is valid in Next.js App Router — static directories always take precedence over dynamic segments. However, two failure modes exist:

1. **generateStaticParams collision**: If `generateStaticParams` in `[slug]/page.tsx` also returns one of the JSX slugs (e.g., `'prague-airport-to-city-center'`), Next.js will error at build time with "Conflicting SSG paths".

2. **Missing `dynamicParams = false`**: Without `export const dynamicParams = false` in `[slug]/page.tsx`, any typo or guessed URL (e.g., `/blog/non-existent-slug`) will attempt a server render and return a blank page or unhandled error instead of 404.

**Why it happens:**
Developers generate params by globbing all MDX files and forget that JSX page directories also resolve to the same segment namespace. The App Router routing table is shared.

**How to avoid:**
In `generateStaticParams` of `[slug]/page.tsx`, only return slugs from the MDX files directory — never from the JSX_POSTS registry. Add `export const dynamicParams = false` immediately below `generateStaticParams`. Call `notFound()` as a fallback inside the page if the slug is not found despite `dynamicParams = false` (belt-and-suspenders).

**Warning signs:**
- Build error: "Conflicting SSG paths: /blog/prague-airport-to-city-center was statically generated..."
- `/blog/random-typo` returns 200 with a blank/broken layout instead of 404
- `generateStaticParams` returns more entries than expected

**Phase to address:** Phase 54 (infrastructure — dynamic route setup)

---

### Pitfall 5: `permanent: true` emits 308, not 301 — browser caches indefinitely

**What goes wrong:**
In `next.config.ts`, `permanent: true` produces HTTP 308 (Permanent Redirect), not HTTP 301. Browsers cache 308 redirects indefinitely with no expiry. If you later need to change the redirect target (e.g., you made a typo in the destination URL), browsers that already received the 308 will continue using the cached redirect even after you deploy the fix. The user is stuck until they clear their browser cache.

**Why it happens:**
Next.js chose 308 because it preserves the HTTP method (POST stays POST across the redirect). Most developers assume `permanent: true` = 301 because that's what "permanent redirect" has meant for 20 years.

**How to avoid:**
Google treats 308 identically to 301 for ranking purposes. For this migration, `permanent: true` is fine for the final correct destinations. Before deploying, double-check every `destination:` value is spelled correctly against the actual file-system paths (`/blog/prague-airport-to-city-center`, `/blog/prague-airport-taxi-vs-chauffeur`, `/blog/prague-vienna-transfer-vs-train`). Use `curl -sI <url> | grep -i location` to verify each redirect before marking it permanent.

If you realise a redirect destination is wrong after deploying, use `statusCode: 302` as a temporary placeholder first, fix the destination, then switch to `permanent: true`.

**Warning signs:**
- After fixing a redirect, some team members (or you in incognito) still see the old destination
- Browser DevTools shows the redirect comes from `(disk cache)` with no network request
- Curl shows the correct redirect but the browser goes elsewhere

**Phase to address:** Phase 55 (migration — redirects in next.config.ts)

---

### Pitfall 6: Redirect chain created by appending to existing array without checking for interactions

**What goes wrong:**
The existing `redirects()` array in `next.config.ts` has a catch-all: `source: '/:path*'` with `has: [{ type: 'host', value: 'www.rideprestigo.com' }]`. Appending new redirects below it is safe — that rule only fires on `www.` hosts. However, the ordering within the non-www rules matters: if a new rule's `source` pattern is more specific but placed after a broader wildcard, the wildcard fires first, creating a redirect chain (`/guides/slug` → `/blog/slug` is correct, but `/guides/*` wildcard → `/blog` → then 200 response would be wrong).

A specific risk for this project: `/compare` and `/guides` index pages must redirect to `/blog`, but the individual article pages redirect to `/blog/[slug]`. If the index redirect pattern is `source: '/compare'` (no wildcard), it is safe. If it uses `source: '/compare/:path*'`, it will catch the article sub-paths too, creating a chain with the individual-slug rules.

**Why it happens:**
Developers add a broad pattern to "catch everything" in a category, not realising it overlaps with more-specific rules that already handle sub-paths correctly.

**How to avoid:**
Use exact `source` matches (no wildcard) for the index-to-/blog redirects:
- `source: '/compare'` → `destination: '/blog'`
- `source: '/guides'` → `destination: '/blog'`

Use exact `source` matches for each article slug:
- `source: '/compare/prague-airport-taxi-vs-chauffeur'` → `destination: '/blog/prague-airport-taxi-vs-chauffeur'`
- etc.

Never use `source: '/compare/:path*'` unless that is the only rule for the `/compare` namespace. After adding all rules, verify with `curl -sIL` (follow redirects) that each URL lands at the final destination in exactly one hop.

**Warning signs:**
- `curl -v` shows two or more `location:` headers before reaching 200
- Google Search Console shows "Redirect Error" for old URLs
- Chrome DevTools Network tab shows status 308 → 308 → 200

**Phase to address:** Phase 55 (migration — redirects)

---

### Pitfall 7: Canonical URL updated in `metadata` but missed in Schema.org JSON-LD and breadcrumbs

**What goes wrong:**
Each of the 3 articles has the old path repeated in **9 distinct locations** per file:

1. `alternates.canonical` (relative path)
2. `alternates.languages.en` (absolute URL)
3. `alternates.languages['x-default']` (absolute URL)
4. `openGraph.url` (absolute URL)
5. Schema.org BreadcrumbList `@id` (absolute URL + `#breadcrumb`)
6. Schema.org BreadcrumbList last `ListItem.item` (absolute URL)
7. Schema.org Article `@id` (absolute URL + `#article`)
8. Schema.org Article `url` (absolute URL)
9. Schema.org FAQPage `@id` (absolute URL + `#faq`)

Updating only the `metadata` export (locations 1-4) leaves the JSON-LD (5-9) pointing to the old paths. Google's Rich Results Test and Schema validators will show the article URL as inconsistent with its breadcrumb and canonical, which can suppress rich results.

**Why it happens:**
The `metadata` export and the JSON-LD block are separate code sections, often far apart in large files. A find-and-replace on just `'/guides/prague-airport-to-city-center'` misses the absolute URL variants. An IDE search for the slug alone misses the `#faq`, `#article`, `#breadcrumb` fragment variants.

**How to avoid:**
Use a single `const CANONICAL_PATH = '/blog/prague-airport-to-city-center'` constant at the top of each migrated file. Reference it everywhere: `alternates.canonical`, `openGraph.url`, and all JSON-LD `@id` / `url` / `item` fields. This guarantees a single edit propagates to all 9 locations.

After editing, run: `grep -n "guides\|compare" app/blog/prague-airport-to-city-center/page.tsx` and expect zero matches (except in prose content where historical context is intentional).

**Warning signs:**
- `grep -rn "guides/\|compare/" app/blog/` returns hits after migration
- Google Search Console shows "Soft 404" or canonical mismatch for migrated pages
- Schema.org Rich Results Test shows breadcrumb URL different from article URL
- Open Graph debugger (Facebook Sharing Debugger) shows old URL in `og:url`

**Phase to address:** Phase 55 (migration — MIG-03)

---

### Pitfall 8: Old paths left in `sitemap.ts` after migration (or new paths not added)

**What goes wrong:**
After migration, `app/sitemap.ts` still contains the 5 old `entry()` calls for `/compare`, `/compare/prague-airport-taxi-vs-chauffeur`, `/compare/prague-vienna-transfer-vs-train`, `/guides`, `/guides/prague-airport-to-city-center`. Google's crawler sees these URLs in the sitemap, follows them, receives 308 redirects, and must re-evaluate canonicality. Meanwhile the new `/blog/*` URLs are absent from the sitemap entirely.

A sitemap with redirecting URLs is not technically invalid, but it contradicts the canonical signal: the sitemap says "this URL is canonical" while the server says "no, go here instead." Google treats this ambiguity as a weak canonical signal and may pick the old URL as canonical even after 301s are in place.

**Why it happens:**
Sitemap updates are a separate task from redirect setup, and it's easy to forget one of the two (add new paths, remove old paths). The current `sitemap.ts` has old paths hardcoded — they do not auto-remove when files are moved.

**How to avoid:**
In the same PR that adds the 301 redirects (Phase 55), remove the 5 old `entry()` calls and add new ones for `/blog`, `/blog/[slug]` (for all 3 JSX articles), and any MDX articles (via `fs.readdirSync` in Phase 54). Cross-check with `curl https://rideprestigo.com/sitemap.xml | grep "compare\|guides"` post-deploy — expected output is zero matches.

**Warning signs:**
- `curl https://rideprestigo.com/sitemap.xml` shows old `/compare` or `/guides` URLs after migration
- Google Search Console Coverage report shows old URLs as "Discovered - currently not indexed" despite redirects
- Search Console Index Coverage shows canonical URL selected by Google differs from your intended canonical

**Phase to address:** Phase 55 (migration — MIG-05)

---

### Pitfall 9: `fs.readdirSync` in `sitemap.ts` or `lib/blog.ts` blocked at runtime if `runtime = 'edge'`

**What goes wrong:**
Node.js `fs` module (used by `fs.readdirSync` to discover MDX files) is unavailable in the Edge Runtime. If `sitemap.ts` ever gets `export const runtime = 'edge'` added (e.g., copy-pasted from another file), it silently fails or throws: "The edge runtime does not support Node.js APIs."

The current `sitemap.ts` has no `runtime` export, so it defaults to Node.js runtime — this is safe. The risk is accidental addition during editing.

**Why it happens:**
Edge runtime is attractive for performance. Developers add it without realising `fs` is blocked.

**How to avoid:**
In `lib/blog.ts`, add a comment: `// Node.js runtime required — uses fs.readdirSync to discover MDX files`. In `sitemap.ts`, add: `// Do NOT add export const runtime = 'edge' — fs is not available in Edge Runtime`. Rely on Next.js's default Node.js runtime for both files.

**Warning signs:**
- Build succeeds but `sitemap.xml` returns 500 on Vercel
- Error in Vercel function logs: "The edge runtime does not support Node.js 'fs' module"
- `lib/blog.ts` returns empty array for MDX posts on production but works in dev

**Phase to address:** Phase 54 (infrastructure — lib/blog.ts + sitemap)

---

### Pitfall 10: `lastModFor()` called with the new `app/blog/[slug]/page.tsx` source path before the JSX article is moved there

**What goes wrong:**
The existing `lastModFor()` function runs `git log -1` on the provided source file path. The current `sitemap.ts` calls it with `'app/compare/prague-airport-taxi-vs-chauffeur/page.tsx'` etc. After migration, new sitemap entries will call it with `'app/blog/prague-airport-taxi-vs-chauffeur/page.tsx'`. But until the file is physically moved to `app/blog/`, git has no history for that path and `lastModFor()` returns `undefined` or the current date — both incorrect.

**Why it happens:**
The sitemap is updated in the same phase as the migration, but the file move and the sitemap update may be done in separate commits or out of order.

**How to avoid:**
When moving files with `git mv app/compare/X/page.tsx app/blog/X/page.tsx`, git preserves history for the new path (detectable with `git log --follow`). Confirm `lastModFor('app/blog/X/page.tsx')` returns a real date by running `git log -1 --pretty="%ai" -- app/blog/X/page.tsx` after the move commit. Only then update the sitemap. Alternatively, pass both old and new path to a helper that tries the new path first and falls back to the old path.

**Warning signs:**
- Sitemap shows `lastModified` of today's date for all migrated articles (not their real modification history)
- `git log -1 -- app/blog/prague-airport-to-city-center/page.tsx` returns nothing
- Build warnings about undefined `lastModified`

**Phase to address:** Phase 55 (migration — file moves before sitemap update)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip `dynamicParams = false` on `[slug]` route | One less line of code | Any URL typo returns blank page instead of 404; crawlers waste budget on 200-status garbage | Never |
| Hardcode slug list in sitemap instead of using `fs.readdirSync` | Simpler code | New MDX files require manual sitemap update; easy to forget | Only if MDX file count is permanently < 5 |
| Keep old paths in sitemap alongside 301 redirects | No sitemap work in migration phase | Contradicts canonical signal; delays Google re-indexing old → new | Never for permanent migrations |
| Use `permanent: false` (302) for article redirects | Can change destination later | Google does not pass full link equity; old URL may stay indexed | Only as a temporary measure during testing |
| Single regex replace for URL updates in JSX articles | Fast | Misses `#fragment` variants in JSON-LD `@id` fields | Never; use the `const CANONICAL_PATH` pattern instead |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `next-mdx-remote/rsc` + custom components | Using MDXProvider context (not available in RSC) | Pass `components` prop directly to `<MDXRemote>` |
| `gray-matter` + TypeScript | Accepting `Date` type from frontmatter | Always coerce to `string` with `.toISOString()` immediately after parsing |
| `next.config.ts` redirects + existing rules | Adding wildcard patterns that overlap individual-slug rules | Use exact `source` paths for each slug; verify with curl after deploy |
| `sitemap.ts` + `fs.readdirSync` | Adding `export const runtime = 'edge'` | Use default Node.js runtime; add explicit comment warning against edge |
| Schema.org JSON-LD + metadata migration | Updating `metadata` export but not the inline JSON-LD object | Use `const CANONICAL_PATH` at file top, referenced by both |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Reading MDX files synchronously with `fs.readdirSync` + `fs.readFileSync` for every request | High TTFB on blog listing page in dev | This is fine — Next.js caches at build time for static pages | Only if `dynamic = 'force-dynamic'` is added to blog listing |
| Parsing all MDX frontmatter to build the listing page | Slow build times if blog grows to 100+ files | Use `gray-matter` excerpt mode (parse only frontmatter, skip body) | Noticeably slow at 200+ MDX files |
| `<Image>` with no explicit `width`/`height` on cover images | Layout shift (CLS) on article pages | Always declare dimensions matching the `public/blog/*.webp` actual pixel size | Any screen size |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering MDX from user-submitted content | XSS via arbitrary JSX execution | MDX is only ever read from the committed repo; never accept user-uploaded MDX |
| Exposing internal file paths in error messages from `fs.readdirSync` | Path disclosure | Wrap in try/catch and return empty array; log internally |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 301 deployed without the destination page existing yet | User lands on 404 after following the redirect | Always create `app/blog/[slug]/page.tsx` (or JSX directory) before or in the same deploy as the redirect |
| Sitemap submitted to Search Console before redirects are live | Googlebot crawls new URLs, gets 404, marks them as errors | Deploy redirects + new pages + sitemap update as a single atomic deployment |
| Cover image path in MDX frontmatter does not match actual file in `public/blog/` | Broken image on article and incorrect OG thumbnail | Validate frontmatter `coverImage` field against `fs.existsSync` in `lib/blog.ts` at build time; throw if missing |

---

## "Looks Done But Isn't" Checklist

- [ ] **Canonical migration:** grep for old paths in all 3 migrated files — `grep -rn "guides/\|/compare/" app/blog/` must return zero hits (excluding intentional prose mentions)
- [ ] **Schema.org `@id` fields:** each migrated article's JSON-LD `@id` for BreadcrumbList, Article, and FAQPage all use the new `/blog/` path, not the old path
- [ ] **Sitemap:** old `/compare` and `/guides` `entry()` calls removed; new `/blog/*` entries added; confirmed with `curl .../sitemap.xml | grep "compare\|guides"` returning zero
- [ ] **Redirects verified:** `curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center` reaches `/blog/prague-airport-to-city-center` in exactly one hop
- [ ] **`dynamicParams = false`:** present in `app/blog/[slug]/page.tsx`; verified that `/blog/not-a-real-slug` returns HTTP 404
- [ ] **`generateStaticParams` excludes JSX slugs:** the 3 migrated slugs are NOT in the return value of `generateStaticParams` in `[slug]/page.tsx`
- [ ] **`lastModFor()` paths valid:** `git log -1 -- app/blog/X/page.tsx` returns a date for all 3 migrated articles after `git mv`
- [ ] **MDX frontmatter dates:** all MDX articles render with correct sorted dates on `/blog` listing; no `Invalid Date` or `[object Object]`
- [ ] **No edge runtime on sitemap or lib/blog:** `grep -rn "runtime.*edge" app/sitemap.ts lib/blog.ts` returns zero
- [ ] **Search Console:** "Change of Address" tool submitted after migration (even though this is a path change, not domain change — it helps accelerate re-crawl); new sitemap URL submitted

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong import (`next-mdx-remote` vs `/rsc`) | LOW | Change import, redeploy — no data loss |
| Date coercion broke sorting | LOW | Add `.toISOString()` call, redeploy |
| Redirect chain created | LOW | Remove overlapping rule, verify with curl, redeploy |
| Old paths left in sitemap after migration | LOW | Remove stale `entry()` calls, redeploy, resubmit sitemap in Search Console |
| Canonical URL missed in JSON-LD (post-deploy) | MEDIUM | Fix all 9 locations using `const CANONICAL_PATH` pattern, redeploy; Google may take days to re-crawl |
| 308 cached by browsers pointing to wrong destination | MEDIUM | Deploy `statusCode: 302` override temporarily, fix destination, switch back to `permanent: true`; instruct users to clear cache |
| JSX slug appearing in `generateStaticParams` (build conflict) | LOW | Remove JSX slug from the MDX params array, rebuild |
| `fs.readdirSync` fails in edge runtime | LOW | Remove `export const runtime = 'edge'`, redeploy |
| `lastModFor()` returns undefined for moved files | LOW | Add `git mv` to commit history before running sitemap; or hardcode date as fallback |
| Google indexed old URLs despite 301s (weeks after migration) | HIGH — time, not code | Submit sitemap, wait; use Search Console URL Inspection to force re-crawl for each old URL; keep redirects for ≥1 year |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Wrong `next-mdx-remote` import | Phase 54 (infrastructure) | Build succeeds; MDX renders server-side without client bundle |
| Client component via MDXProvider context | Phase 54 (infrastructure) | No "Context" runtime errors; custom components render |
| Frontmatter date coercion | Phase 54 (lib/blog.ts) | Blog listing sorted correctly; no `Invalid Date` |
| Static/dynamic route conflict in `/blog` | Phase 54 (dynamic route setup) | Build succeeds; `/blog/non-existent` returns 404 |
| `dynamicParams` not set to false | Phase 54 (dynamic route setup) | `curl -o /dev/null -w "%{http_code}" .../blog/fake` returns 404 |
| `permanent: true` = 308, not 301 | Phase 55 (migration — redirects) | Destination URLs verified correct before deploy |
| Redirect chain from overlapping patterns | Phase 55 (migration — redirects) | `curl -sIL` shows single-hop to final URL |
| Canonical URL missed in JSON-LD | Phase 55 (migration — MIG-03) | `grep -rn "guides/\|/compare/" app/blog/` = zero; Schema.org validator passes |
| Old paths left in sitemap | Phase 55 (migration — MIG-05) | `curl .../sitemap.xml \| grep compare` = zero |
| `fs` blocked by edge runtime | Phase 54 (infrastructure) | No `runtime = 'edge'` in sitemap.ts or lib/blog.ts |
| `lastModFor()` broken after `git mv` | Phase 55 (migration — file moves) | `git log -1 -- app/blog/X/page.tsx` returns real date |

---

## Sources

- [next-mdx-remote GitHub — RSC usage and known issues #488](https://github.com/hashicorp/next-mdx-remote/issues/488)
- [next-mdx-remote hydration reconciliation issue #118](https://github.com/hashicorp/next-mdx-remote/issues/118)
- [Next.js redirects — official API reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)
- [Next.js redirect permanent creates browser cache — SEO Component blog](https://www.seocomponent.com/blog/nextjs-redirect-permanent-cache/)
- [Next.js sitemap.xml — official file convention docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [generateStaticParams + dynamicParams = false issue #54270](https://github.com/vercel/next.js/issues/54270)
- [Conflicting SSG paths — Next.js error docs](https://nextjs.org/docs/messages/conflicting-ssg-paths)
- [Edge Runtime limitations — oneuptime.com, Jan 2026](https://oneuptime.com/blog/post/2026-01-24-fix-nextjs-edge-runtime-limitations/view)
- [Google: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [Google: Site moves with URL changes](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [Google: Can I use 308 instead of 301? — Search Central Community](https://support.google.com/webmasters/thread/214728753/can-i-use-308-permanent-redirect-instead-of-301?hl=en)
- [next-mdx-remote frontmatter typing issue #269](https://github.com/hashicorp/next-mdx-remote/issues/269)
- Codebase analysis: 9 URL locations per article file verified by direct inspection of 3 existing JSX article files

---
*Pitfalls research for: MDX blog addition + URL migration on Next.js 16 App Router (Prestigo)*
*Researched: 2026-05-13*
