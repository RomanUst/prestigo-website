---
phase: 54-mdx-infrastructure
plan: "01"
subsystem: blog-infrastructure
tags: [mdx, next-config, content-pipeline]
dependency_graph:
  requires: []
  provides: [mdx-pipeline, mdx-components, content-blog-dir]
  affects: [next.config.ts, package.json]
tech_stack:
  added:
    - "@next/mdx@16.2.6"
    - "@mdx-js/loader@3.1.1"
    - "@mdx-js/react@3.1.1"
    - "@types/mdx@2.0.13"
    - "gray-matter@4.0.3"
    - "remark-gfm@4.0.1"
  patterns:
    - createMDX() config wrapper
    - useMDXComponents named export
    - MDX frontmatter with gray-matter schema
key_files:
  created:
    - mdx-components.tsx
    - content/blog/premium-airport-transfer-prague-shortcut.mdx
  modified:
    - next.config.ts
    - package.json
    - package-lock.json
decisions:
  - "Use @next/mdx (not next-mdx-remote) — locked decision from STATE.md; next-mdx-remote RSC broken on Next.js 15.2+"
  - "mdx-components.tsx at repo root with named export — required by @next/mdx App Router"
  - "Minimal pass-through in Phase 54; Phase 55 adds Prestigo design system styling"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-13T19:13:06Z"
  tasks_completed: 3
  files_changed: 5
---

# Phase 54 Plan 01: MDX Infrastructure Pipeline Summary

**One-liner:** @next/mdx pipeline installed with createMDX()-wrapped next.config.ts, minimal mdx-components.tsx, and first real MDX article in content/blog/.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install MDX toolchain packages | 0875ad7 | package.json, package-lock.json |
| 2 | Create mdx-components.tsx at repo root | 9e66c8f | mdx-components.tsx |
| 3 | Wrap next.config.ts with createMDX() and create MDX article | 735bc85 | next.config.ts, content/blog/premium-airport-transfer-prague-shortcut.mdx |

## Packages Installed

| Package | Version | Location |
|---------|---------|----------|
| @next/mdx | ^16.2.6 | dependencies |
| @mdx-js/loader | ^3.1.1 | dependencies |
| @mdx-js/react | ^3.1.1 | dependencies |
| @types/mdx | ^2.0.13 | dependencies |
| gray-matter | ^4.0.3 | dependencies |
| remark-gfm | ^4.0.1 | dependencies |

All six packages in `dependencies` (not devDependencies) — required at build time by next.config.ts and lib/blog.ts (plan 02).

## Existing next.config.ts Behaviour Preserved

All 27 existing redirect rules survived the createMDX wrap. Verified:
- www → apex redirect (1 rule)
- /airport-transfer → /services/airport-transfer (1 rule)
- 20 removed red routes → /routes (20 rules via array spread)
- /cs and /cs/:path* → / (2 rules)
- Czech locale redirects (2 rules)
- images.formats: ['image/avif', 'image/webp'] — preserved
- images.remotePatterns: images.unsplash.com — preserved
- Security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS) — preserved
- CSP nonce comment — preserved

## MDX Article Created

**Path:** `content/blog/premium-airport-transfer-prague-shortcut.mdx`

**Frontmatter values:**
- `title`: "Premium Airport Transfer: Prague's Hidden Shortcut"
- `description`: "Most travellers waste 40 minutes queueing for a taxi at Václav Havel Airport. Here is the faster, calmer option for arrivals who value time more than the saved koruna."
- `date`: "2026-05-13"
- `coverImage`: "/hero-airport-transfer.webp"
- `category`: "Airport Transfer"
- `author`: roman-ustyugov

All 7 required frontmatter fields present. `author` value matches the only valid `AuthorSlug` in `lib/authors.ts`.

## Verification Results

- `npx tsc --noEmit` exits 0 — TypeScript strict compile clean
- `grep -l "createMDX" next.config.ts` returns `next.config.ts`
- `mdx-components.tsx` exists at repo root with named `useMDXComponents` export
- `content/blog/premium-airport-transfer-prague-shortcut.mdx` exists

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the MDX article is a real publishable stub, not placeholder content.

## Threat Flags

None — this plan operates entirely at build time. No new network endpoints, auth paths, file access patterns at runtime, or schema changes at trust boundaries introduced.

## Self-Check: PASSED

- mdx-components.tsx exists: FOUND
- content/blog/premium-airport-transfer-prague-shortcut.mdx exists: FOUND
- next.config.ts contains createMDX: FOUND
- Commit 0875ad7 exists: FOUND
- Commit 9e66c8f exists: FOUND
- Commit 735bc85 exists: FOUND
