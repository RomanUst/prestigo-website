# Phase 54: MDX Infrastructure - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Install the MDX compilation pipeline and create `lib/blog.ts` + `content/blog/` directory. This phase delivers a proven end-to-end MDX pipeline: packages installed, `next.config.ts` wrapped with `createMDX()`, `mdx-components.tsx` at repo root, `lib/blog.ts` aggregating both MDX frontmatter and JSX_POSTS, and a test MDX file rendering at a route without build errors. No blog UI pages (those are Phase 55).

</domain>

<decisions>
## Implementation Decisions

### MDX Library
- **D-01:** Use `@next/mdx` (NOT `next-mdx-remote`). The PROJECT.md mention of `next-mdx-remote` is stale — ROADMAP.md INFRA-02 and Phase 54 success criteria are authoritative. User confirmed `@next/mdx` + `createMDX()`.
- **D-02:** Package list: `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`, `gray-matter`, `remark-gfm`. Wrap `next.config.ts` with `createMDX()`.
- **D-03:** `mdx-components.tsx` must be at **repo root** (Next.js requirement for `@next/mdx`). This file maps HTML elements to Prestigo-styled components — minimal implementation for Phase 54 (full styling in Phase 55).

### Content Directory
- **D-04:** MDX article files live in `content/blog/*.mdx` (separate data directory, NOT in `app/`). The `app/blog/[slug]/page.tsx` reads them via `fs` + `gray-matter` for frontmatter aggregation and renders via `compileMDX` (or the `@next/mdx` pipeline).
- **D-05:** `content/blog/` directory created with a test MDX article (not just `.gitkeep`) — success criteria requires it renders at a route without build errors.

### lib/blog.ts Aggregator
- **D-06:** `getAllPosts(): BlogPost[]` merges two sources: (1) MDX files from `content/blog/` read via `gray-matter`, (2) `JSX_POSTS` hardcoded registry for the 3 legacy articles. Returns sorted newest-first by `date`.
- **D-07:** `BlogPost` type defined in `lib/blog.ts` (co-located, not a separate types file). Phase 55 imports from here.
- **D-08:** `BlogPost` type fields: `slug: string`, `title: string`, `description: string`, `date: string` (ISO), `coverImage: string` (relative `/public` path), `category: string`, `author: AuthorSlug`, `dateModified?: string`, `source: 'mdx' | 'jsx'` (for hybrid routing in Phase 55).

### JSX_POSTS Registry (Claude's Discretion)
Claude selects category labels and coverImage values based on the existing OG metadata in the legacy articles:
- `prague-airport-to-city-center` → category: `"Airport Transfer"`, coverImage: `"/hero-airport-transfer.webp"`
- `prague-airport-taxi-vs-chauffeur` → category: `"Airport Transfer"`, coverImage: `"/hero-airport-transfer.webp"`
- `prague-vienna-transfer-vs-train` → category: `"Intercity Routes"`, coverImage: `"/vienna.png"`

Dates to use from `ARTICLE_PUBLISHED` constants already in each file.

### Claude's Discretion
- **mdx-components.tsx initial implementation**: Minimal — pass-through or basic wrappers. Full Prestigo styling is Phase 55's job.
- **Test MDX file**: A short but real article stub with valid frontmatter (all required fields populated). Not a placeholder with fake content — should be something publishable later.
- **BlogPost type location**: Defined in `lib/blog.ts`, exported from there. No separate types file needed.
- **`source` field implementation**: Include in BlogPost type — Phase 55 needs it to distinguish MDX dynamic route from static JSX colocated pages.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external ADRs or specs for this phase — requirements fully captured in decisions above and the ROADMAP success criteria below.

### Requirements
- `.planning/REQUIREMENTS.md` §INFRA-01 through INFRA-05 — exact acceptance criteria per requirement
- `.planning/ROADMAP.md` §Phase 54 — success criteria (4 items) are the authoritative test gates

### Existing Reusable Code
- `lib/authors.ts` — `AuthorSlug` type (`keyof typeof AUTHORS`), `AUTHORS` registry, `personSchemaFor()`
- `lib/lastmod.ts` — `lastModFor()` for git-based sitemap dates
- `next.config.ts` — existing `redirects()` array; Phase 54 wraps this with `createMDX()` without touching redirects

### Legacy Articles (for JSX_POSTS registry)
- `app/guides/prague-airport-to-city-center/page.tsx` — date, OG image, description
- `app/compare/prague-airport-taxi-vs-chauffeur/page.tsx` — date, OG image, description
- `app/compare/prague-vienna-transfer-vs-train/page.tsx` — date, OG image, description

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/authors.ts`: `AuthorSlug = keyof typeof AUTHORS` — use directly in `BlogPost` type; no new type needed
- `lib/lastmod.ts`: `lastModFor(relativePath)` — available for MDX files' sitemap dates (Phase 56)
- `next.config.ts`: Has `redirects()` array and `images.remotePatterns` — `createMDX()` wraps the whole config export

### Established Patterns
- All pages are `force-static` — MDX route must follow the same pattern (`generateStaticParams` + static rendering)
- TypeScript strict mode — all `BlogPost` fields must be fully typed, no `any`
- `@/` alias maps to repo root — use `@/content/blog` if needed, or `process.cwd()` + path join in lib

### Integration Points
- `app/blog/[slug]/page.tsx` (to be created in Phase 55) will call `getAllPosts()` from `lib/blog.ts`
- `app/sitemap.ts` will import `getAllPosts()` in Phase 56 to generate `/blog/*` entries
- `next.config.ts` must be wrapped with `createMDX()` — existing redirects and images config are preserved inside

</code_context>

<specifics>
## Specific Ideas

- User confirmed `@next/mdx` — not `next-mdx-remote`. Update `PROJECT.md` requirements section to reflect this before or during planning.
- Test MDX file: real article stub (not a lorem ipsum placeholder). Valid frontmatter, short body. Publishable later.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 54-mdx-infrastructure*
*Context gathered: 2026-05-13*
