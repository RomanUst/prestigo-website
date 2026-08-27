# Prestigo — rideprestigo.com

## What This Is

Prestigo is a premium chauffeur service based in Prague, Czech Republic. The site (rideprestigo.com) is a Next.js 14+ App Router marketing and booking platform that handles airport transfers, intercity routes, corporate accounts, and VIP events for English-speaking travellers and corporate clients across Central Europe. Customers can sign in with email or OAuth to access a personal account with trip history and pre-filled passenger details; guest checkout is always available without registration.

## Core Value

Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction.

## Current State: v2.1 Shipped — Next Milestone In Planning

v2.1 delivered full operator control of the booking lifecycle inside the admin panel: abandoned/unpaid checkout capture with a no-duplicate webhook reconcile and a revenue-recovery queue (Phase 62); admin booking editing across schedule/vehicle/route/passenger with server-authoritative price recompute, a per-field edit audit log, and optional branded change-notification email (Phase 63); and admin-originated bookings with an optional Stripe payment link + client email that reconciles the same booking row on payment (incl. round-trip both legs), or a no-link cash/invoice save (Phase 64). Milestone audit passed (19/19 requirements, integration sound). Live and deployed on production.

v2.0 (prior) delivered Blacklane-style booking UX with full customer authentication and account management, all GA4 + Meta Pixel/CAPI analytics signals preserved.

## Current Milestone: v2.2 Dispatch & Driver Trip Portal

**Goal:** Speed up dispatcher work (the admin bookings list focuses on future trips by default) and give each driver a permanent working link to the trip — a trip sheet they can show to police control, with live status marking that stays separate from the client-facing booking status.

**Target features:**
- Admin bookings list defaults to future trips only, with a persistent default-horizon setting plus in-session filters to reveal past/all
- Permanent per-assignment driver link (token valid until the order completes) opening a noindex trip sheet
- Driver trip-progress status marking (en route → arrived → on board → completed, plus no-show) written to a separate trip-progress field that does NOT touch `booking.status`
- Driver can leave a trip note/feedback

Carried forward (not necessarily in this milestone): CR-02 Stripe Payment Link deactivation hardening, automatic unpaid-reminder emails (FOLLOW-01), Google/Apple OAuth dashboard credential config (AUTH-02/03), corporate "book for a guest" step (BOOK-06), multilingual account UI, and clearing the pre-existing red test baseline.

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
- ✓ AUTH-01: Customer email sign-in (magic-link + password) via Supabase Auth — v2.0 (Phase 57)
- ✓ AUTH-04/05/06/07: Customer registration with account type, session isolation, customer_profiles RLS, sign-out — v2.0 (Phase 57)
- ✓ NAV-01/02: Auth-aware header — Sign in button (guests) / account dropdown (logged in) — v2.0 (Phase 58)
- ✓ ACCT-01/02/03: My trips page, profile editing, corporate fields (company/IČO/VAT) — v2.0 (Phase 58)
- ✓ ACCT-04: New bookings linked to user_id; anonymous/guest bookings unaffected — v2.0 (Phase 60)
- ✓ BOOK-01..05: Unified EntryBar, time-slot dropdown, flight number field, RouteMap, VehicleCard + VehicleSlideshow — v2.0 (Phase 59)
- ✓ BOOK-07: Logged-in customer's contact details pre-filled in passenger step — v2.0 (Phase 60)
- ✓ BOOK-08: Guest checkout available at every stage; sign-in optional — v2.0 (Phase 60)
- ✓ TRACK-01/02/03/05: GA4 + Meta Pixel/CAPI events preserved, price snapshot + server-side GA4, CSP/Consent Mode — v2.0 (Phases 59+61)
- ✓ TRACK-04: GA4 login/sign_up events fire (code-verified; live testing blocked by OTP) — v2.0 (Phase 60+61)
- ✓ ABND-01..06: Abandoned/unpaid checkout capture, admin unpaid queue + filter, no-duplicate webhook reconcile — v2.1 (Phase 62)
- ✓ AEDIT-01..07: Admin booking editing (schedule/vehicle/route/passenger), server-authoritative price-change review, optional branded change-notification email — v2.1 (Phase 63)
- ✓ FOLLOW-02: Per-field audit log of admin edits per booking — v2.1 (Phase 63)
- ✓ ANEW-01..05: Admin-created bookings, auto price, optional Stripe payment link + email, auto no-duplicate reconcile (incl. round-trip), no-link cash/invoice save — v2.1 (Phase 64)

### Active

<!-- v2.2 milestone requirements + infrastructure/tech-debt items carried forward -->

- [ ] DISP-*: Admin bookings list defaults to future trips; persistent default-horizon setting + in-session past/all filters — v2.2
- [ ] DTRIP-*: Permanent driver trip link (token valid until order completes) with noindex trip sheet for police control — v2.2
- [ ] DTRIP-*: Driver trip-progress marking (en route/arrived/on board/completed/no-show) in a separate field, not `booking.status` — v2.2
- [ ] DTRIP-*: Driver trip note/feedback — v2.2
- [ ] FOLLOW-01: Automatic reminder email after N hours unpaid (deferred from v2.1)
- [ ] CR-02 follow-up: actual Stripe Payment Link deactivation (paymentLinks.update active:false) after price edit / manual confirm — v2.1 shipped a 409 guard + loud webhook alert only
- [ ] Nyquist validation not run for phases 62/63/64 (VALIDATION.md status: draft)
- [ ] Clear pre-existing red test baseline (12 files failing on main, not v2.1 regressions)
- [ ] AUTH-02: Google OAuth — code wired; Supabase Dashboard credential config still pending
- [ ] AUTH-03: Apple OAuth — code wired; Supabase Dashboard credential config still pending
- [ ] BOOK-06: Booking-method step — "Book for myself / Book as guest"; corporate also "Book for a guest" (deferred from v2.0)
- [ ] Corporate invoicing, monthly billing, cost-centre fields — basic corporate profile only in v2.0
- [ ] Email notifications — booking confirmation, reminder, driver assignment
- [ ] Multilingual account UI (Czech, Russian)

### Out of Scope

- Payment methods beyond Stripe; saved cards — Stripe one-off only
- Facebook OAuth — Google + Apple priority
- Multi-user corporate accounts, role permissions — single profile per company in v2.0
- Replacing admin auth or changing admin session model

## Context

**Tech stack:** Next.js 14+ App Router, React 19, TypeScript, Tailwind CSS v4, Supabase (PostgreSQL + Auth/GoTrue), Stripe, deployed on Vercel. Booking flow uses Zustand (sessionStorage), Google Maps JS SDK, and GNet integration. GA4 + Meta Pixel/CAPI analytics with server-side Measurement Protocol in Stripe webhook.

**Vehicle fleet:** Three Mercedes classes — E-Class (Business), S-Class (First Class), V-Class (Business Van). Vehicle images are AVIF format at `/public/vehicles/`.

**Auth stack:** Admin auth (password-only) and customer auth (email + OAuth) both use Supabase GoTrue — isolated via middleware checks on `user_metadata.role`. Customer profiles in `customer_profiles` table with RLS. Bookings carry nullable `user_id` FK; guest checkout always valid.

**Blog:** MDX articles in `content/blog/` plus 3 legacy JSX articles in `app/blog/[slug]/page.tsx`. Hybrid model — static dirs take precedence over dynamic MDX route. `/guides/*` and `/compare/*` redirect 308 to `/blog/*`.

**Codebase size:** ~22 plans across 8 phases; migrations 047–049 (customer_profiles, saved_passengers, bookings RLS).

## Constraints

- **Tech stack**: Next.js App Router only — no Pages Router patterns
- **Styling**: Tailwind CSS v4 with existing design tokens (`bg-anthracite`, `border-anthracite-light`, `copper`, etc.) — no new CSS frameworks
- **SEO**: Every article page must have canonical URL, OG tags, Schema.org Article — non-negotiable
- **Guest checkout**: Must always remain available; sign-in is never a hard gate
- **Admin auth**: Untouched — admin session isolation must be maintained across all changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MDX-in-repo (no headless CMS) | No external dependencies, free, deploy via git | ✓ Shipped v1.0 |
| Hybrid JSX + MDX articles | Existing articles too complex to convert; static dirs take precedence over dynamic route | ✓ Shipped v1.0 |
| Single `coverImage` = card thumbnail + og:image | DRY, consistent OG cards | ✓ Shipped v1.0 |
| Continue phase numbering from 53 → starts at 54 | Consistent history | ✓ Shipped v1.0 |
| Customer auth on Supabase Auth (reuse admin GoTrue infra) | No new auth library; same stack as admin | ✓ Shipped v2.0 |
| Bookings stay anonymous-capable; add nullable `user_id` FK | Guest checkout must never break | ✓ Shipped v2.0 |
| Major version bump v2.0 (new auth/accounts subsystem) | Adds a whole subsystem; phases continue from 56 → 57 | ✓ Shipped v2.0 |
| Phase 59 independent of Phase 57/58 | Booking redesign can run in parallel with auth UI | ✓ Shipped v2.0 |
| TEXT + CHECK for `account_type` (not Postgres ENUM) | Stays alterable; matches existing bookings pattern | ✓ Shipped v2.0 (Phase 57) |
| No DELETE RLS on customer_profiles — ON DELETE CASCADE only | Simpler; row removal via auth.users deletion | ✓ Shipped v2.0 (Phase 57) |
| safeReturnTo() open-redirect guard: relative-only, rejects absolute URLs | Security — prevents open redirect via OAuth returnTo | ✓ Shipped v2.0 (Phase 57) |
| NextResponse.redirect in auth callback uses explicit `{ status: 302 }` | Next.js default 307 breaks OAuth redirects | ✓ Shipped v2.0 (Phase 57) |
| EntryBar replaces Step1TripType + Step2DateTime (wizard 6→5 steps) | Blacklane-style consolidation; begin_checkout relocated to StickyBookingPanel | ✓ Shipped v2.0 (Phase 59) |
| user_id passed via Stripe metadata (never trusted from client) | Security — ownership resolved server-side only | ✓ Shipped v2.0 (Phase 60) |

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
*Last updated: 2026-08-27 — started milestone v2.2 Dispatch & Driver Trip Portal: future-first admin bookings list with persistent default + filters, permanent driver trip link with noindex trip sheet, separate driver trip-progress marking, driver trip note.*
