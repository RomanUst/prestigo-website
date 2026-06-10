# Milestones

## ✅ v1.0 — SEO Blog (shipped 2026-05-15)

Scalable MDX-powered blog at `/blog` to capture organic search traffic, with 3 legacy articles migrated into one canonical hub.

- Phase 54: MDX Infrastructure (`@next/mdx` pipeline, `lib/blog.ts` aggregator, `content/blog/`)
- Phase 55: Blog UI — `/blog` listing card grid + `/blog/[slug]` MDX article renderer with full SEO
- Phase 56: Article migration + SEO wiring — 3 JSX articles `git mv`'d to `/blog/*`, 5 permanent 301s, sitemap reconciled

## 🚧 v2.0 — Blacklane-style Booking + Customer Accounts (in progress, started 2026-06-10)

Rebuild the booking experience Blacklane-style (visual + behavioural), add customer authentication (email + Google + Apple) and accounts (personal/corporate), preserve all analytics, keep guest checkout always available.

- Phase 57: Customer Auth Foundation
- Phase 58: Sign-in UI + Account Dashboard
- Phase 59: Booking Flow Redesign (Blacklane)
- Phase 60: Auth-in-Checkout + Guest Path
- Phase 61: Analytics Preservation & E2E Verify
