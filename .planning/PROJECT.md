# Prestigo — rideprestigo.com

## What This Is

Prestigo is a premium chauffeur service based in Prague, Czech Republic. The site (rideprestigo.com) is a Next.js 16 marketing and booking platform that handles airport transfers, intercity routes, corporate accounts, and VIP events for English-speaking travellers and corporate clients across Central Europe.

## Core Value

Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction.

## Current Milestone: v1.0 — SEO Blog

**Goal:** Build a scalable MDX-powered blog at `/blog` to capture organic search traffic through useful editorial content, and migrate 3 existing articles from scattered `/guides` and `/compare` routes into this single canonical hub.

**Target features:**
- MDX content pipeline (`next-mdx-remote` + `gray-matter`) for future articles
- `/blog` listing page with card grid (coverImage, category, title, date)
- MDX article page with full SEO (OG, Schema.org Article, canonical)
- Migration of 3 existing JSX articles to `/blog/*` with 301 redirects
- Sitemap updated to reflect new `/blog/*` paths

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Marketing pages (home, services, fleet, routes, about, FAQ, contact) — brownfield baseline
- ✓ Airport transfer, intercity, VIP, corporate service pages — brownfield baseline
- ✓ 30 city-to-city route pages (Green + Yellow tier) — brownfield baseline
- ✓ Admin dashboard for bookings — brownfield baseline
- ✓ Booking flow with Stripe + GNet integration — brownfield baseline
- ✓ Schema.org structured data on editorial pages — brownfield baseline
- ✓ ArticleByline component + authors system (E-E-A-T) — brownfield baseline
- ✓ Per-page git-based lastModified for sitemap — brownfield baseline
- ✓ INFRA-01: `lib/blog.ts` aggregates MDX files + JSX_POSTS registry, returns sorted BlogPost[] — Validated in Phase 54: mdx-infrastructure
- ✓ INFRA-02: MDX rendering pipeline (`@next/mdx` + `gray-matter`) installed and working — Validated in Phase 54: mdx-infrastructure
- ✓ INFRA-03: MDX frontmatter schema: title, description, date, coverImage, category, author — Validated in Phase 54: mdx-infrastructure
- ✓ INFRA-04: `getAllPosts()` returns merged BlogPost[] sorted newest-first — Validated in Phase 54: mdx-infrastructure
- ✓ INFRA-05: `BlogPost` type with all required fields including `author: AuthorSlug` — Validated in Phase 54: mdx-infrastructure

### Active
- [ ] LIST-01: `/blog` shows card grid sorted newest-first
- [ ] LIST-02: Each card: coverImage, category, title, description, date
- [ ] LIST-03: `/blog` has SEO meta (title, description, canonical, OG)
- [ ] LIST-04: All blog posts auto-appear in sitemap.xml
- [ ] ART-01: MDX article page renders with Prestigo design system
- [ ] ART-02: Article page shows hero coverImage
- [ ] ART-03: Article page: OG meta, Schema.org Article, canonical `/blog/[slug]`
- [ ] ART-04: ArticleByline reused on MDX articles
- [ ] MIG-01: 3 existing articles accessible at `/blog/[slug]`
- [ ] MIG-02: Old `/guides/*` and `/compare/*` URLs return HTTP 301 to `/blog/*`
- [ ] MIG-03: Canonical URLs updated in all 3 migrated articles
- [ ] MIG-04: `/guides` and `/compare` index pages redirect 301 to `/blog`
- [ ] MIG-05: Sitemap: old paths removed, new `/blog/*` paths added

### Out of Scope

- Multi-language blog posts (Czech, Russian) — English only for this milestone; internationalisation deferred
- Headless CMS (Contentful, Sanity, etc.) — MDX-in-repo is sufficient; no external CMS dependencies
- Comments or community features — editorial blog only, no user-generated content
- Search within the blog — deferred; site search is a separate initiative
- Converting existing JSX articles to MDX — articles contain complex inline data/tables; JSX keeps full rendering control

## Context

**Tech stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript, deployed on Vercel. All pages are static (`force-static`) or server-rendered with no client state.

**Existing editorial pages:** Three long-form articles exist at `/guides/prague-airport-to-city-center`, `/compare/prague-airport-taxi-vs-chauffeur`, and `/compare/prague-vienna-transfer-vs-train`. They are complex JSX pages with inline data arrays (options, profiles, FAQs, tables). Converting them to MDX is out of scope.

**Hybrid model:** Static JSX article directories (`app/blog/slug/page.tsx`) take precedence over the dynamic MDX route (`app/blog/[slug]/page.tsx`) in Next.js — both coexist cleanly.

**Reusable utilities:** `components/ArticleByline.tsx`, `lib/authors.ts` (`personSchemaFor()`, `AUTHORS`), `lib/lastmod.ts` (`lastModFor()`), `lib/jsonld.ts`, `app/sitemap.ts` (entry() helper).

**Domain:** `https://rideprestigo.com` (note: some existing pages still have a typo `rideprestigo.com` — correct to `rideprestigo.com` in migrated files).

**Redirects:** `next.config.ts` already has a `redirects()` array — append to it, do not replace.

## Constraints

- **Tech stack**: Next.js App Router only — no Pages Router patterns
- **Styling**: Tailwind CSS v4 with existing design tokens (`bg-anthracite`, `border-anthracite-light`, `copper`, etc.) — no new CSS frameworks
- **SEO**: Every article page must have canonical URL, OG tags, Schema.org Article — non-negotiable for SEO strategy
- **Images**: Cover images in `public/blog/` — Next.js `<Image>` or `<img>` with correct dimensions; AVIF/WebP formats preferred

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MDX-in-repo (no headless CMS) | No external dependencies, free, deploy via git | — Pending |
| Hybrid JSX + MDX articles | Existing articles too complex to convert; static dirs take precedence over dynamic route | — Pending |
| Single `coverImage` field = card thumbnail + og:image | DRY, consistent OG cards across social platforms | — Pending |
| Continue phase numbering from 53 → starts at 54 | Consistent history, no archive needed | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-13 — Phase 54 complete: MDX infrastructure pipeline established (@next/mdx, lib/blog.ts aggregator, /blog/[slug] route)*
