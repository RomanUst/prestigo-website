# Phase 54: MDX Infrastructure — Research

**Researched:** 2026-05-13
**Domain:** Next.js MDX pipeline, blog aggregation, TypeScript frontmatter types
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `@next/mdx` (NOT `next-mdx-remote`). The PROJECT.md mention of `next-mdx-remote` is stale — ROADMAP.md INFRA-02 and Phase 54 success criteria are authoritative. User confirmed `@next/mdx` + `createMDX()`.
- **D-02:** Package list: `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`, `gray-matter`, `remark-gfm`. Wrap `next.config.ts` with `createMDX()`.
- **D-03:** `mdx-components.tsx` must be at **repo root** (Next.js requirement for `@next/mdx`). Minimal implementation for Phase 54 (full styling in Phase 55).
- **D-04:** MDX article files live in `content/blog/*.mdx` (separate data directory, NOT in `app/`). The `app/blog/[slug]/page.tsx` reads them via `fs` + `gray-matter` for frontmatter and renders via dynamic `await import()`.
- **D-05:** `content/blog/` directory created with a test MDX article (not just `.gitkeep`) — success criteria requires it renders at a route without build errors.
- **D-06:** `getAllPosts(): BlogPost[]` merges two sources: (1) MDX files from `content/blog/` read via `gray-matter`, (2) `JSX_POSTS` hardcoded registry for the 3 legacy articles. Returns sorted newest-first by `date`.
- **D-07:** `BlogPost` type defined in `lib/blog.ts` (co-located, not a separate types file).
- **D-08:** `BlogPost` type fields: `slug: string`, `title: string`, `description: string`, `date: string` (ISO), `coverImage: string`, `category: string`, `author: AuthorSlug`, `dateModified?: string`, `source: 'mdx' | 'jsx'`.

### JSX_POSTS Registry (Claude's Discretion)
Claude selects category labels and coverImage values:
- `prague-airport-to-city-center` → category: `"Airport Transfer"`, coverImage: `"/hero-airport-transfer.webp"`
- `prague-airport-taxi-vs-chauffeur` → category: `"Airport Transfer"`, coverImage: `"/hero-airport-transfer.webp"`
- `prague-vienna-transfer-vs-train` → category: `"Intercity Routes"`, coverImage: `"/vienna.png"`

Dates from `ARTICLE_PUBLISHED` constants already in each file.

### Claude's Discretion
- `mdx-components.tsx` initial implementation: minimal pass-through or basic wrappers
- Test MDX file: real article stub with valid frontmatter, short body, publishable later
- `BlogPost` type location: defined and exported from `lib/blog.ts`
- `source` field: include in BlogPost type

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | `mdx-components.tsx` at repo root, maps HTML elements to Prestigo-styled components | Verified: required by @next/mdx App Router; minimal pass-through valid for Phase 54 |
| INFRA-02 | `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`, `gray-matter`, `remark-gfm` installed; `next.config.ts` wrapped with `createMDX()` | Verified via npm registry + Next.js docs; exact versions confirmed |
| INFRA-03 | `content/blog/` directory with first real MDX test file | Covered: `content/blog/` is outside `app/`; files read via `fs.readdirSync` at build time |
| INFRA-04 | `lib/blog.ts` exports `getAllPosts(): BlogPost[]` — MDX frontmatter + JSX_POSTS, sorted newest-first | Pattern verified; gray-matter 4.0.3 API confirmed; JSX_POSTS dates extracted from source files |
| INFRA-05 | MDX frontmatter schema: `title`, `description`, `date`, `coverImage`, `category`, `author (AuthorSlug)`, optional `dateModified` | Fully typed via `BlogPost` interface; `AuthorSlug` imported from `lib/authors.ts` |
</phase_requirements>

---

## Summary

Phase 54 installs the `@next/mdx` compilation pipeline into an existing Next.js 16.2.3 codebase. The primary work is: (1) wrapping `next.config.ts` with `createMDX()`, (2) creating `mdx-components.tsx` at repo root, (3) creating `content/blog/` with a test article, (4) building `lib/blog.ts` to aggregate MDX frontmatter and `JSX_POSTS`, and (5) wiring a minimal `app/blog/[slug]/page.tsx` that renders one MDX article at build time to prove the pipeline works end-to-end.

The most important technical constraint: `@next/mdx` with `dynamic import()` using a template string and `content/` outside `app/` requires using **relative paths** (e.g., `../../content/blog/${slug}.mdx`) rather than the `@/` alias. The `@/` alias in dynamic template strings does not resolve in webpack or Turbopack's static analysis. This affects `app/blog/[slug]/page.tsx` which must be created in Phase 54 as a thin route to prove render (full UI is Phase 55).

The `getAllPosts()` function in `lib/blog.ts` uses `fs.readdirSync` + `gray-matter` to extract frontmatter at build time. This is a Node.js Server Component pattern — it runs at build time, never on the client, and `fs` is safe in App Router server components.

**Primary recommendation:** Create `mdx-components.tsx` first (build fails without it), then wrap `next.config.ts`, then create `lib/blog.ts`, then create the test MDX file and minimal `app/blog/[slug]/page.tsx`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@next/mdx` | 16.2.6 | Webpack/Turbopack loader; `createMDX()` config wrapper | Official Next.js package, version-matched to Next.js |
| `@mdx-js/loader` | 3.1.1 | Underlying webpack MDX loader (peer dep of @next/mdx) | Required peer dependency |
| `@mdx-js/react` | 3.1.1 | React MDX context provider for component mapping | Required by @next/mdx for `useMDXComponents` hook |
| `@types/mdx` | 2.0.13 | TypeScript types for `.mdx` imports | Required for TS strict mode with MDX files |
| `gray-matter` | 4.0.3 | YAML frontmatter parser | Battle-tested; used by Gatsby, Astro, Next.js docs examples |
| `remark-gfm` | 4.0.1 | GitHub Flavored Markdown (tables, strikethrough, task lists) | Standard remark plugin; enables real article content |

[VERIFIED: npm registry — versions confirmed 2026-05-13]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` | built-in | `readdirSync` to scan `content/blog/` | Already available; no extra install |
| `node:path` | built-in | Path joining for content directory | Already available |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@next/mdx` | `next-mdx-remote` | `next-mdx-remote` was the decision in old PROJECT.md; user confirmed it is STALE — `next-mdx-remote` has broken RSC support on Next.js 15.2+; `@next/mdx` is the correct choice [VERIFIED: STATE.md decision log] |
| `gray-matter` | `remark-frontmatter` | `gray-matter` reads raw `.mdx` files without full MDX compilation — faster, simpler for the aggregator; `remark-frontmatter` requires the full remark pipeline [ASSUMED] |

**Installation:**
```bash
npm install @next/mdx @mdx-js/loader @mdx-js/react @types/mdx gray-matter remark-gfm
```

**Version verification (confirmed 2026-05-13):**
```
@next/mdx       16.2.6   (published 2026-05-07)
@mdx-js/loader  3.1.1
@mdx-js/react   3.1.1
@types/mdx      2.0.13
gray-matter     4.0.3    (published 2021-04-24)
remark-gfm      4.0.1    (published 2025-02-10)
```

---

## Architecture Patterns

### Recommended File Structure

```
/ (repo root)
├── mdx-components.tsx          # REQUIRED by @next/mdx — MUST exist before next build
├── next.config.ts              # Wrapped with createMDX()
├── content/
│   └── blog/
│       └── test-article.mdx    # Test article with valid frontmatter
├── lib/
│   └── blog.ts                 # BlogPost type + getAllPosts() + JSX_POSTS
└── app/
    └── blog/
        └── [slug]/
            └── page.tsx        # Thin route: dynamic import + generateStaticParams
```

### Pattern 1: next.config.ts — createMDX() Wrapper

**What:** Import `createMDX`, configure `remarkPlugins`, wrap the existing config export.

**Important:** `remark-gfm` v4 is ESM-only. Since `next.config.ts` is TypeScript (not `.mjs`), import it normally — TypeScript handles ESM interop.

```typescript
// Source: https://nextjs.org/docs/app/guides/mdx (Next.js 16.2.6 docs)
import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  // ... existing redirects(), images, headers() preserved inside here
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
```

**Key:** `pageExtensions` must include `"mdx"`. Wrap the WHOLE `nextConfig` object (including the existing `redirects`, `images`, `headers` — verified they survive `withMDX` wrapping).

[CITED: https://nextjs.org/docs/app/guides/mdx]

### Pattern 2: mdx-components.tsx — Minimal Pass-Through

**What:** Satisfies the `@next/mdx` App Router requirement. Phase 54 keeps it minimal.

```typescript
// Source: https://nextjs.org/docs/app/guides/mdx
import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
  };
}
```

**Warning:** File must export `useMDXComponents` (not a default export). Build will fail with a confusing error if the export name is wrong. [CITED: https://nextjs.org/docs/app/guides/mdx]

### Pattern 3: lib/blog.ts — getAllPosts() Aggregator

**What:** Reads `content/blog/*.mdx` with `gray-matter`, merges with `JSX_POSTS`, sorts by date.

```typescript
// Source: gray-matter docs + Next.js fs pattern
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { AuthorSlug } from "@/lib/authors";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO YYYY-MM-DD
  coverImage: string; // relative /public path
  category: string;
  author: AuthorSlug;
  dateModified?: string;
  source: "mdx" | "jsx";
};

const CONTENT_DIR = path.join(process.cwd(), "content/blog");

function getMDXPosts(): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf-8");
      const { data } = matter(raw);
      return {
        slug,
        title: data.title as string,
        description: data.description as string,
        date: data.date as string,
        coverImage: data.coverImage as string,
        category: data.category as string,
        author: data.author as AuthorSlug,
        dateModified: data.dateModified as string | undefined,
        source: "mdx" as const,
      };
    });
}

const JSX_POSTS: BlogPost[] = [
  {
    slug: "prague-airport-to-city-center",
    title: "Prague Airport to City Center: Complete Transfer Guide",
    description: "...",
    date: "2026-04-09",
    coverImage: "/hero-airport-transfer.webp",
    category: "Airport Transfer",
    author: "roman-ustyugov",
    source: "jsx",
  },
  // ... other two JSX posts
];

export function getAllPosts(): BlogPost[] {
  return [...getMDXPosts(), ...JSX_POSTS].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
```

[VERIFIED: gray-matter npm registry; Next.js fs pattern from official docs]

### Pattern 4: app/blog/[slug]/page.tsx — Dynamic MDX Import

**Critical pitfall:** `await import(\`@/content/blog/${slug}.mdx\`)` FAILS — webpack/Turbopack cannot statically analyze `@/` alias in dynamic template strings. Use a relative path.

```typescript
// Source: Next.js docs dynamic import pattern + Discussion #82837 workaround
export const dynamicParams = false;
export const dynamic = "force-static";

import fs from "node:fs";
import path from "node:path";

export function generateStaticParams() {
  const contentDir = path.join(process.cwd(), "content/blog");
  if (!fs.existsSync(contentDir)) return [];
  return fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => ({ slug: f.replace(/\.mdx$/, "") }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // MUST use relative path — @/ alias fails in dynamic template strings
  const { default: Post } = await import(`../../../content/blog/${slug}.mdx`);
  return <Post />;
}
```

[CITED: https://nextjs.org/docs/app/guides/mdx; VERIFIED: GitHub Discussion #82837]

### Pattern 5: MDX Frontmatter Format (content/blog/*.mdx)

```mdx
---
title: "Premium Airport Transfer: Prague's Hidden Shortcut"
description: "Most travellers waste 40 minutes in taxi queues at Václav Havel Airport. Here is the faster option."
date: "2026-05-13"
coverImage: "/hero-airport-transfer.webp"
category: "Airport Transfer"
author: roman-ustyugov
---

## Introduction

Content here...
```

**Note:** `author` value must match exactly one key in `AUTHORS` from `lib/authors.ts`. Currently the only valid value is `roman-ustyugov`. [VERIFIED: lib/authors.ts]

### Anti-Patterns to Avoid

- **`@/` alias in dynamic import template strings:** `await import(\`@/content/blog/${slug}.mdx\`)` fails at build time. Use relative paths.
- **`mdx-components.tsx` with default export:** The file must export `useMDXComponents` as a named export. Default export will not work.
- **Missing `pageExtensions`:** Without `pageExtensions: ['mdx', ...]` in `next.config.ts`, `.mdx` files are invisible to the Next.js router.
- **`gray-matter` on the client:** `lib/blog.ts` uses `node:fs` and `gray-matter` — only valid in Server Components, Route Handlers, or build-time calls. Never import in client components.
- **`fs.readdirSync` in Edge Runtime:** The `content/blog/` scanner must NOT be used in Edge Runtime routes. Blog pages are `force-static`, not edge — no issue here.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MDX compilation | Custom webpack config | `@next/mdx` + `createMDX()` | Handles RSC, Turbopack compatibility, HMR |
| YAML frontmatter parsing | Custom regex parser | `gray-matter` | Handles edge cases: multi-line values, nested objects, special characters in YAML |
| Markdown extensions (tables, task lists) | Custom rehype transform | `remark-gfm` | Well-tested; covers GFM spec completely |
| TypeScript types for `.mdx` imports | `declare module "*.mdx"` in d.ts | `@types/mdx` | Provides `MDXComponents`, correct default export typing |

---

## Common Pitfalls

### Pitfall 1: Dynamic Import Template String + Path Alias

**What goes wrong:** `await import(\`@/content/blog/${slug}.mdx\`)` throws a build-time module-not-found error.

**Why it happens:** Webpack and Turbopack statically analyze dynamic import expressions to build the module graph. The `@/` alias is not expanded in template strings by either bundler. The module reference must be a string literal or a relative path that the bundler can resolve at analysis time.

**How to avoid:** Use relative path from the file location: `../../../content/blog/${slug}.mdx`. The relative depth depends on where `page.tsx` lives (`app/blog/[slug]/page.tsx` is 3 directories deep).

**Warning signs:** `Module not found: Can't resolve '@/content/blog/...'` during `next build`.

[VERIFIED: GitHub Discussion vercel/next.js #82837]

### Pitfall 2: mdx-components.tsx Missing or Wrong Export

**What goes wrong:** `next build` fails with a cryptic error about MDX components not found.

**Why it happens:** `@next/mdx` with App Router requires `mdx-components.tsx` at the project root (same level as `app/`) and expects the named export `useMDXComponents`. If the file is missing or the export name is wrong, the build fails.

**How to avoid:** Create the file as the FIRST action (Wave 0). Use the exact export signature: `export function useMDXComponents(components: MDXComponents): MDXComponents`.

[CITED: https://nextjs.org/docs/app/guides/mdx]

### Pitfall 3: remark-gfm ESM Import

**What goes wrong:** `SyntaxError: Cannot use import statement in a module` or equivalent if the wrong import pattern is used.

**Why it happens:** `remark-gfm` v4 (current) is ESM-only. In `next.config.ts` (TypeScript, compiled by Next.js transpiler), ESM `import` is supported. However, if the project uses `next.config.js` (CommonJS), `require('remark-gfm')` fails.

**How to avoid:** The project already uses `next.config.ts` — TypeScript. Use `import remarkGfm from 'remark-gfm'` at the top of the file. No workaround needed.

[VERIFIED: npm registry remark-gfm 4.0.1; project uses next.config.ts confirmed]

### Pitfall 4: JSX_POSTS Slug Collision with generateStaticParams

**What goes wrong:** Phase 55's `generateStaticParams()` accidentally includes JSX article slugs, causing the `app/blog/[slug]/page.tsx` to try to dynamic-import a JSX article as an MDX file and fail with 404 at runtime.

**Why it happens:** If `generateStaticParams()` reads from `getAllPosts()` (which includes JSX_POSTS) instead of reading from `content/blog/*.mdx` directly.

**How to avoid:** In Phase 54's minimal `app/blog/[slug]/page.tsx`, `generateStaticParams()` reads ONLY from `fs.readdirSync('content/blog')` — NOT from `getAllPosts()`. This is the authoritative separation enforced by ART-02 in Phase 55. [CITED: REQUIREMENTS.md ART-02]

### Pitfall 5: gray-matter Returns Loose Types

**What goes wrong:** TypeScript strict mode rejects `data.author` because `gray-matter` returns `{ [key: string]: any }`.

**Why it happens:** `gray-matter` cannot know the frontmatter shape at compile time.

**How to avoid:** Cast each field explicitly in `getMDXPosts()` or validate with Zod. For Phase 54, explicit casts (`data.author as AuthorSlug`) are sufficient — Zod validation is overkill for this phase.

---

## Code Examples

### gray-matter Basic Usage

```typescript
// Source: gray-matter npm docs
import matter from "gray-matter";
import fs from "node:fs";

const raw = fs.readFileSync("content/blog/my-post.mdx", "utf-8");
const { data, content } = matter(raw);
// data = { title: "...", date: "2026-05-13", author: "roman-ustyugov", ... }
// content = the markdown body after frontmatter
```

### createMDX with remark plugins (TypeScript)

```typescript
// Source: https://nextjs.org/docs/app/guides/mdx
import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
```

### JSX_POSTS Dates (verified from source files)

All three legacy articles share `ARTICLE_PUBLISHED = '2026-04-09'`. [VERIFIED: grepping source files]

---

## Runtime State Inventory

Not applicable — greenfield phase, no rename/refactor/migration.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js (>=24) | `fs.readdirSync`, build | ✓ | (project engines >=24) | — |
| git | `lastModFor()` in sitemap (Phase 56, not Phase 54) | ✓ | installed | fs mtime fallback built-in |
| npm registry | Package install | ✓ | — | — |

No missing dependencies. All packages are available from npm. [VERIFIED: npm view commands]

---

## Validation Architecture

nyquist_validation is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 + @testing-library/react 16 |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run tests/blog.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-04 | `getAllPosts()` returns merged sorted array | unit | `npx vitest run tests/blog.test.ts` | ❌ Wave 0 |
| INFRA-05 | `BlogPost` type enforces all required fields incl. `author: AuthorSlug` | TypeScript compile | `npx tsc --noEmit` | N/A — compile-time |
| INFRA-01/02 | `next build` succeeds with MDX pipeline | build smoke | `npm run build` | N/A — build gate |
| INFRA-03 | Test MDX renders at a route | build smoke | `npm run build` | N/A — build gate |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (TypeScript check)
- **Per wave merge:** `npx vitest run tests/blog.test.ts && npx tsc --noEmit`
- **Phase gate:** `npm run build` (full build smoke) + all tests green

### Wave 0 Gaps

- [ ] `tests/blog.test.ts` — unit tests for `getAllPosts()`: merged result, sort order, `source` field discrimination, `JSX_POSTS` entries present
- [ ] No framework install needed — Vitest already configured

---

## Security Domain

This phase introduces no auth, sessions, API routes, user input, or cryptography. The MDX pipeline runs at build time only — no runtime user-controlled content. No ASVS categories apply.

The `content/blog/` directory contains static author-controlled MDX. No untrusted input enters the compilation pipeline. [VERIFIED: phase scope]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next-mdx-remote` | `@next/mdx` | Next.js 15.2 (2025) | `next-mdx-remote` broke RSC support; `@next/mdx` is now the standard for local MDX content |
| `next.config.js` (CommonJS) | `next.config.ts` (TypeScript) | Next.js 15+ | ESM plugins (remark-gfm v4) work without workaround in `.ts` config |
| `contentlayer` | `gray-matter` + `fs` | contentlayer archived 2024 | contentlayer was deprecated/archived; direct fs + gray-matter is now the lean standard |

**Deprecated/outdated:**
- `next-mdx-remote`: RSC broken on Next.js 15.2+; STATE.md confirms this decision [VERIFIED: STATE.md]
- `contentlayer` / `contentlayer2`: contentlayer archived by maintainers 2024 [ASSUMED — not verified in this session]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gray-matter` is faster/simpler than `remark-frontmatter` for the aggregator use case | Alternatives Considered | Low — both work; gray-matter is already the decided choice |
| A2 | contentlayer was archived 2024 | State of the Art | Low — irrelevant to implementation; @next/mdx decision is locked |
| A3 | The relative path depth from `app/blog/[slug]/page.tsx` to `content/blog/` is `../../../content/blog/` (3 levels up) | Pattern 4 | Medium — if directory nesting changes, relative path breaks; verify at implementation time |

---

## Open Questions

1. **titles/descriptions for JSX_POSTS**
   - What we know: `ARTICLE_PUBLISHED = '2026-04-09'` confirmed in all 3 files. Category/coverImage are decided (D-08 in CONTEXT.md).
   - What's unclear: Exact `title` and `description` strings for JSX_POSTS — they exist in each file's `metadata.title` / `metadata.description` fields but were not extracted here.
   - Recommendation: Planner task should grep `metadata.title` and `metadata.description` from each legacy article file at implementation time.

2. **Relative path depth verification**
   - What we know: `app/blog/[slug]/page.tsx` is 3 directories deep from repo root.
   - What's unclear: The exact relative path `../../../content/blog/${slug}.mdx` should be verified at implementation time (confirmed by directory structure, but easy to get wrong by 1 level).
   - Recommendation: Implementation task should verify path with a quick `ls` before writing the import.

---

## Sources

### Primary (HIGH confidence)
- Next.js 16.2.6 official docs — https://nextjs.org/docs/app/guides/mdx — createMDX, mdx-components.tsx, dynamic import pattern
- npm registry (2026-05-13): @next/mdx@16.2.6, @mdx-js/loader@3.1.1, @mdx-js/react@3.1.1, @types/mdx@2.0.13, gray-matter@4.0.3, remark-gfm@4.0.1
- Project source files: `next.config.ts`, `lib/authors.ts`, `tsconfig.json`, `package.json` — codebase structure confirmed
- `.planning/phases/54-mdx-infrastructure/54-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md` — INFRA-01 through INFRA-05

### Secondary (MEDIUM confidence)
- GitHub Discussion vercel/next.js #82837 — dynamic import path alias limitation confirmed with working relative path workaround
- `.planning/STATE.md` — confirms next-mdx-remote is stale/broken on Next.js 15.2+

### Tertiary (LOW confidence)
- contentlayer archived claim — not independently verified; low relevance

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry 2026-05-13
- Architecture: HIGH — patterns cited from official Next.js 16.2.6 docs
- Pitfalls: HIGH — dynamic import alias issue verified via GitHub Discussion; other pitfalls cited from official docs
- JSX_POSTS dates: HIGH — extracted directly from source files

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (30 days — stable library ecosystem)
