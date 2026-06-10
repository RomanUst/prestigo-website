# Prestigo — rideprestigo.com

## What This Is

Prestigo is a premium chauffeur service based in Prague, Czech Republic. The site (rideprestigo.com) is a Next.js 16 marketing and booking platform that handles airport transfers, intercity routes, corporate accounts, and VIP events for English-speaking travellers and corporate clients across Central Europe.

## Core Value

Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction.

## Current Milestone: v2.0 — Blacklane-style Booking + Customer Accounts

**Goal:** Rebuild the booking experience to match Blacklane's polish (visual + behavioural), and introduce customer authentication and accounts (personal/corporate) — all while preserving every existing Google/Meta analytics signal and keeping guest checkout always available.

**Target features:**
- Customer authentication via Supabase Auth — email + Google + Apple OAuth (admin auth untouched)
- Sign in button in the header (auth-aware) + customer account dashboard ("My trips", profile)
- Personal vs corporate account types (corporate gets company/VAT/cost-centre fields + "book for a guest")
- Blacklane-style booking redesign — unified entry bar, time-slot dropdown, inline flight number, route map with pickup/drop-off times, vehicle cards with "What's included" + capacity tabs
- Optional auth in checkout ("Book for myself / as guest"), bookings linked to user_id, guest checkout always available
- Zero analytics regression — all GA4 + Meta Pixel/CAPI funnel events preserved through the rebuilt flow

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
- ✓ v1.0 SEO Blog — MDX pipeline, `/blog` listing + article pages, 3 articles migrated with 301s, sitemap (phases 54–56)

### Active

<!-- Milestone v2.0 — Blacklane-style Booking + Customer Accounts -->

**AUTH — Customer authentication**
- [ ] AUTH-01: Customer can sign in by email (magic-link/password) via Supabase Auth
- [ ] AUTH-02: Customer can sign in with Google OAuth
- [ ] AUTH-03: Customer can sign in with Apple OAuth
- [ ] AUTH-04: Customer can register and choose account type — personal or corporate
- [ ] AUTH-05: Customer session does not conflict with admin session; middleware gates customer routes, not admin
- [ ] AUTH-06: Customer profile stored in new table (migration 044) with `account_type` and FK to `auth.users`; RLS isolates each user's data

**NAV — Header**
- [ ] NAV-01: Header (desktop + mobile) has a Sign in button leading to login
- [ ] NAV-02: Logged-in customer sees account/sign-out in header instead of Sign in

**ACCT — Account dashboard**
- [ ] ACCT-01: "My trips" page — customer's booking history (bookings linked to `user_id`)
- [ ] ACCT-02: Profile editing (contacts, saved passenger details)
- [ ] ACCT-03: Corporate account has extra fields (company, IČO/VAT, cost centre) and a "book for a guest" option
- [ ] ACCT-04: New bookings by a logged-in customer are linked to `user_id` (anonymous bookings unaffected)

**BOOK — Booking flow redesign (Blacklane UI/UX)**
- [ ] BOOK-01: Unified route + date + time entry bar in Blacklane style
- [ ] BOOK-02: Pickup-time slot dropdown
- [ ] BOOK-03: Inline "flight number" field for airport transfers
- [ ] BOOK-04: Route map showing pickup/drop-off times next to vehicle selection
- [ ] BOOK-05: Vehicle class cards with "What's included" and capacity tabs (luggage/seating)
- [ ] BOOK-06: Booking-method step: "Book for myself (account) / Book as guest"; corporate also "Book for a guest"
- [ ] BOOK-07: Logged-in customer's contact details are pre-filled
- [ ] BOOK-08: Guest checkout available at every stage (sign-in optional)

**TRACK — Analytics preservation (cross-cutting)**
- [ ] TRACK-01: All existing GA4 events fire in the rebuilt flow with no loss
- [ ] TRACK-02: All Meta Pixel + CAPI events (incl. eventId dedup) preserved
- [ ] TRACK-03: Price snapshot (sessionStorage) and server-side GA4 in Stripe webhook still work
- [ ] TRACK-04: `login` and `sign_up` (GA4) events added on sign-in/registration
- [ ] TRACK-05: CSP nonce and Consent Mode v2 not broken by new scripts/routes

### Out of Scope

- Corporate teams / multi-user billing, invoicing, cost-centre reporting — only basic corporate fields in v2.0
- Payment methods beyond Stripe; saved cards
- Multilingual account UI — English only for now
- Social logins beyond Google/Apple (Facebook deferred)

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
| MDX-in-repo (no headless CMS) | No external dependencies, free, deploy via git | ✓ Shipped v1.0 |
| Hybrid JSX + MDX articles | Existing articles too complex to convert; static dirs take precedence over dynamic route | ✓ Shipped v1.0 |
| Single `coverImage` field = card thumbnail + og:image | DRY, consistent OG cards across social platforms | ✓ Shipped v1.0 |
| Continue phase numbering from 53 → starts at 54 | Consistent history, no archive needed | ✓ Shipped v1.0 |
| v2.0: customer auth on Supabase Auth (reuse admin GoTrue infra) | No new auth library; admin password pattern + OAuth (Google/Apple) on same stack | — Pending |
| v2.0: bookings stay anonymous-capable; add nullable `user_id` FK | Guest checkout must never break; logged-in is additive | — Pending |
| v2.0: major version bump (new auth/accounts subsystem) | Not an increment — adds a whole subsystem; phases continue from 56 → start 57 | — Pending |

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
*Last updated: 2026-06-10 — Milestone v2.0 started: Blacklane-style booking redesign + customer authentication & accounts (personal/corporate). Phases 57–61. v1.0 SEO Blog shipped.*
