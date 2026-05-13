# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-13)

**Core value:** Every page must convert a visitor into a confirmed booking or qualified lead without friction.
**Current focus:** Milestone v1.0 — SEO Blog

## Current Position

Phase: Not started (defining roadmap)
Plan: —
Status: Defining requirements and roadmap
Last activity: 2026-05-13 — Milestone v1.0 (SEO Blog) started

## Accumulated Context

### From brownfield baseline (pre-GSD)
- Phases 47, 51, 52, 53 completed before GSD planning was introduced
- Phase 47: DB migration — vehicle map
- Phase 51: Admin UI badge
- Phase 52: Extended booking statuses
- Phase 53: Driver assignment UI
- All these features are live and considered Validated requirements

### Architecture notes
- Next.js App Router, all pages `force-static` or server-rendered
- No global state management — Zustand only for booking store
- `lib/authors.ts` + `components/ArticleByline.tsx` already in place for E-E-A-T
- `lib/lastmod.ts` + `lastModFor()` for per-file git timestamps in sitemap
- `next.config.ts` has existing `redirects()` array — append only

### MDX decision
- Chose `next-mdx-remote` over `@next/mdx` for flexibility (server rendering, dynamic imports)
- Existing 3 articles stay as JSX (too complex to convert) — hybrid model
