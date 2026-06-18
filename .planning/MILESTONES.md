# Milestones

## v2.0 Blacklane-style Booking + Customer Accounts (Shipped: 2026-06-18)

**Phases completed:** 8 phases, 22 plans, 24 tasks

**Key accomplishments:**

- @next/mdx pipeline installed with createMDX()-wrapped next.config.ts, minimal mdx-components.tsx, and first real MDX article in content/blog/.
- BlogPost type + getAllPosts() aggregator merging MDX frontmatter and JSX_POSTS registry, plus minimal MDX render route proving @next/mdx pipeline end-to-end.
- Three RED test stubs for BlogCard rendering, BlogPosting JSON-LD schema, and sitemap /blog entries — gating Plans 02 and 03 via TDD contract.
- /blog listing page with 3-column card grid, full SEO metadata, and accessible BlogCard component wired to getAllPosts() newest-first.
- MDX article page with BlogPosting JSON-LD, Prestigo prose styling, full SEO metadata, and sitemap registration — two RED test suites turned GREEN.
- Three legacy JSX articles moved from app/guides/ and app/compare/ to app/blog/ via atomic git mv (history preserved for lastModFor()), all 30 URL occurrences rewritten via const CANONICAL_PATH, and sitemap test inverted to RED as TDD prerequisite for Plan 03.
- Task 1 commit
- Removed 5 legacy `/compare/*` and `/guides/*` sitemap entries; added 3 explicit `/blog/<slug>` entries for migrated JSX articles so sitemap.xml matches the new canonical paths.
- Deleted app/guides/page.tsx and app/compare/page.tsx — eliminating contradictory canonical signals; verified JSX_POSTS registry complete for all 3 migrated articles (MIG-06 pre-completed in phase 54)
- customer_profiles table with RLS isolation + nullable bookings.user_id FK + Wave-0 failing test scaffold for AUTH-01..07 + ACCT-04.
- Customer auth surface: middleware gating + email/OAuth server actions + /auth/callback with profile upsert + /login UI per UI-SPEC + gated /account with sign-out — Wave-0 tests turned GREEN.
- Migrations 044 + 045 applied to the live Supabase database after an RLS pre-check; live schema verified, types regenerated, full automated gate green, and the manual OAuth/email round-trips approved by the user.
- bf0ee43
- Migrations 047 (customer_profiles profile + corporate fields) and 048 (saved_passengers with own-row RLS, partial unique is_default index, and updated_at trigger) applied to live Supabase DB; TypeScript types regenerated
- Client-side `onAuthStateChange` subscription in Nav renders guest "Sign in" button (desktop + mobile) and signed-in account dropdown (My trips / Profile / Sign out) without any server-side auth call — marketing pages remain statically rendered (D-09).
- Force-dynamic auth-gated /account overview (heading, email, two nav cards) and /account/trips empty-state shell ("No trips yet" + Book a transfer CTA) with zero DB query per D-01.
- Full profile-editing surface — server actions (updateProfile/addPassenger/updatePassenger/deletePassenger) with IDOR guard, ProfileForm client component (contact/corporate/passenger editor), and force-dynamic server component loading customer_profiles + saved_passengers via Promise.all.
- Wikimedia Commons photos committed as placeholder vehicle images (12 JPEGs in /public/vehicles/) with VEHICLE_CONFIG repointed from legacy e-class-photo.png paths to new exterior JPGs — unblocking VehicleCard and VehicleSlideshow components.
- tests/EntryBar.test.tsx
- Unified EntryBar (15-min AM/PM combobox, conditional flight field, hideMultiDay tabs) replaces Step1TripType + Step2DateTime; BookingWizard renumbered from 6 to 5 steps with begin_checkout relocated and all booking tests green.
- Animated Google Maps route with copper dot + time labels (BOOK-04) and sticky desktop booking panel with relocated begin_checkout/InitiateCheckout analytics (TRACK-02).
- Blacklane two-column vehicle step: VehicleSlideshow auto-play, VehicleCard 3/2 photo + What's included (D-16), Step3Vehicle with StickyBookingPanel right panel

---

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
