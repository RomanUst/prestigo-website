# Stack Research

**Domain:** MDX Blog on Next.js 16 App Router
**Researched:** 2026-05-13
**Confidence:** HIGH (verified against official Next.js 16 docs and npm registry as of May 2026)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@next/mdx` | `^16.2.5` | MDX compilation pipeline | Official Next.js package, zero-friction RSC support, no serialization step, Turbopack compatible, actively maintained by Vercel |
| `@mdx-js/loader` | bundled with `@next/mdx` | Webpack/Turbopack MDX transform | Required peer for `@next/mdx` |
| `@mdx-js/react` | bundled with `@next/mdx` | React context for MDX components | Required peer for `@next/mdx` |
| `@types/mdx` | bundled with `@next/mdx` | TypeScript types for `.mdx` imports | Required for TS projects |
| `gray-matter` | `^4.0.3` | Frontmatter parsing for blog listing | Battle-tested (used by Gatsby, Astro, VitePress); parses YAML frontmatter from `.mdx` files on the server; the pairing with `@next/mdx` is the official Next.js docs recommendation |
| `remark-gfm` | `^4.0.1` | GitHub-Flavoured Markdown (tables, strikethrough, task lists) | ESM-only, compatible with MDX v3 remark pipeline; blog content uses GFM tables |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `rehype-pretty-code` | `^0.14.3` | Syntax highlighting for code blocks | Add if/when blog articles include code samples; powered by Shiki v4, renders server-side at build time with zero JS shipped to the client |
| `shiki` | `^4.0.2` | Shiki highlighter engine (peer dep of rehype-pretty-code) | Required when `rehype-pretty-code` is used |
| `@tailwindcss/typography` | (already likely available via Tailwind v4) | `prose` classes for MDX body text | Provides typographic rhythm for article body without writing per-element CSS; check if already installed before adding |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `mdx-components.tsx` (file convention) | Global component overrides for MDX | Required by App Router — must export `useMDXComponents()`; maps `h1`, `img`, `a`, etc. to Prestigo design-system components |
| `next.config.ts` additions | Enable `@next/mdx` and remark plugins | Must switch to `.mjs` or `.ts` for ESM-only remark/rehype plugins; project already uses `next.config.ts` so TypeScript config path works |

## Installation

```bash
# Core MDX pipeline (official Next.js approach)
npm install @next/mdx @mdx-js/loader @mdx-js/react @types/mdx

# Frontmatter parsing (for blog listing page — reads .mdx files on server)
npm install gray-matter

# GFM support (tables, strikethrough, checkboxes)
npm install remark-gfm

# Optional: syntax highlighting (add when code blocks are needed)
npm install rehype-pretty-code shiki
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@next/mdx` | `next-mdx-remote` | **Do not use.** Hashicorp archived the repository on April 9, 2026. It is read-only and no longer receiving fixes. Issue #488 (RSC mode broken on Next.js 15.2+) was never resolved before archival. |
| `@next/mdx` | `next-mdx-remote-client` | Use if MDX content must be fetched from an external source (CMS API, database, user-submitted). Not needed here because content lives in-repo. |
| `@next/mdx` | Contentlayer / Contentlayer2 | Contentlayer (original) is abandoned. Contentlayer2 is a community stop-gap fork with uncertain longevity. Neither is recommended for new projects. |
| `@next/mdx` | `mdx-bundler` | Useful when MDX files import their own dependencies. Not needed for editorial blog articles with no intra-MDX imports. |
| `gray-matter` | `remark-frontmatter` + `remark-mdx-frontmatter` | Valid remark-plugin approach, but adds two packages and requires remark config plumbing. `gray-matter` is simpler for the `lib/blog.ts` aggregation pattern already planned in the project. |
| `rehype-pretty-code` | `@shikijs/rehype` (direct Shiki rehype) | Both are Shiki-backed. `rehype-pretty-code` adds line/character highlighting, word highlighting, and VS Code theme support with less config. Prefer it unless bundle size is a concern. |
| `rehype-pretty-code` | `rehype-highlight` (highlight.js) | highlight.js requires shipping a theme CSS globally; highlight.js grammars are less accurate than Shiki's TextMate grammars. No reason to choose it on a new project. |
| `rehype-pretty-code` | `sugar-high` | Lightweight (1 kB) but very limited language support. Suitable for toy blogs, not a professional chauffeur brand site. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `next-mdx-remote` | Repository archived April 2026, RSC mode broken on Next.js 15.2+, no fixes coming | `@next/mdx` (in-repo content) or `next-mdx-remote-client` (remote content) |
| Contentlayer / Contentlayer2 | Original abandoned; fork is a stop-gap with uncertain maintenance | `@next/mdx` + `gray-matter` |
| `@next/mdx` `mdxRs: true` | Rust MDX compiler is still marked experimental in Next.js 16 docs; not recommended for production | Use default (JS) compiler |
| `react-syntax-highlighter` | Ships a large JS bundle to the client; server-side highlighting is strictly better for a static blog | `rehype-pretty-code` + `shiki` |
| Headless CMS (Sanity, Contentful) | Out of scope per PROJECT.md; MDX-in-repo is the validated approach for this milestone | MDX files in `content/blog/` |

## Stack Patterns by Variant

**`@next/mdx` with `gray-matter` pattern (chosen for this project):**
- MDX files live in `content/blog/*.mdx`
- `lib/blog.ts` uses `fs.readdirSync` + `gray-matter` to extract frontmatter for the listing page
- `app/blog/[slug]/page.tsx` uses `await import(\`@/content/blog/${slug}.mdx\`)` for rendering
- `generateStaticParams` reads `content/blog/` via `fs` to enumerate slugs
- `mdx-components.tsx` maps HTML elements to Prestigo design-system components
- `next.config.ts` wraps config with `createMDX({ options: { remarkPlugins: ['remark-gfm'] } })`

**If MDX content were fetched from a remote URL or CMS API:**
- Use `next-mdx-remote-client` instead of `@next/mdx`
- Not applicable to this project

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@next/mdx@^16.2.5` | `next@^16.2.3`, `react@19.2.3` | Matches project's Next.js version exactly — install matching version |
| `gray-matter@^4.0.3` | Node 18+, any Next.js | Last release April 2021, but stable; zero breaking changes expected |
| `remark-gfm@^4.0.1` | MDX v3 remark pipeline, Node 16+ | ESM-only — `next.config.ts` must use `import` not `require` |
| `rehype-pretty-code@^0.14.3` | `shiki@^4.0.2` | Peer requires `shiki ^1.0.0`; `shiki@4.x` satisfies this |
| `shiki@^4.0.2` | `rehype-pretty-code@^0.14.3` | Install together; shiki@4 is current stable as of May 2026 |

## Sources

- [Next.js 16 Official MDX Guide](https://nextjs.org/docs/app/guides/mdx) — verified 2026-05-13, version 16.2.6 docs; confirms `@next/mdx` install steps, frontmatter limitation, `remark-gfm` ESM requirement, Turbopack plugin string format
- [hashicorp/next-mdx-remote GitHub](https://github.com/hashicorp/next-mdx-remote/issues/488) — confirms archive date April 9, 2026 and unresolved RSC issue #488
- [ipikuka/next-mdx-remote-client GitHub](https://github.com/ipikuka/next-mdx-remote-client) — v2.1.10 released April 4, 2026; tested with next@16, react@19.1+
- [rehype-pretty-code official site](https://rehype-pretty.pages.dev/) — v0.14.3, requires shiki ^1.0.0
- [shiki npm](https://www.npmjs.com/package/shiki) — v4.0.2, last published ~2 months before May 2026
- [gray-matter npm](https://www.npmjs.com/package/gray-matter) — v4.0.3, stable industry standard
- [remark-gfm npm](https://www.npmjs.com/package/remark-gfm) — v4.0.1, ESM-only, compatible with MDX v3

---
*Stack research for: MDX Blog on Next.js 16 App Router (Prestigo)*
*Researched: 2026-05-13*
