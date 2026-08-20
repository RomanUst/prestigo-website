# Phase 54: MDX Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 54-mdx-infrastructure
**Areas discussed:** MDX Library

---

## MDX Library

| Option | Description | Selected |
|--------|-------------|----------|
| @next/mdx + createMDX() | Compile-time integration, content/blog/*.mdx, app/blog/[slug]/page.tsx renders via compileMDX, mdx-components.tsx at repo root | ✓ |
| next-mdx-remote | Runtime MDX processing, MDXRemote component, same directory layout but no compile-time integration | |

**User's choice:** @next/mdx + createMDX()

**Notes:** PROJECT.md mentioned `next-mdx-remote` but this was identified as stale. ROADMAP.md INFRA-02 and Phase 54 success criteria explicitly require `@next/mdx` + `createMDX()`. User confirmed the ROADMAP is authoritative.

---

## Claude's Discretion

- JSX_POSTS registry: category labels and coverImage paths — Claude to derive from existing OG metadata in legacy article files
- mdx-components.tsx: minimal pass-through implementation for Phase 54 (full Prestigo styling in Phase 55)
- Test MDX file: real article stub with valid frontmatter, publishable quality
- BlogPost type location: co-located in lib/blog.ts

## Deferred Ideas

None.
