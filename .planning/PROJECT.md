# Prestigo — rideprestigo.com

## What This Is

Prestigo is a premium chauffeur service based in Prague, Czech Republic. The site (rideprestigo.com) is a Next.js 14+ App Router marketing and booking platform that handles airport transfers, intercity routes, corporate accounts, and VIP events for English-speaking travellers and corporate clients across Central Europe. Customers can sign in with email or OAuth to access a personal account with trip history and pre-filled passenger details; guest checkout is always available without registration.

## Core Value

Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction.

## Current State: v3.0 In Planning — Site Internationalization (i18n)

**Active milestone (v3.0):** Make the whole public site multilingual without sacrificing English SEO positions. English stays the default at the site root (existing URLs unchanged → zero ranking risk); six locales — **Russian, Spanish, French, Arabic (RTL), Hindi, Chinese (Simplified)** — are served under URL subpaths (`/ru/`, `/es/`, `/fr/`, `/ar/`, `/hi/`, `/zh/`) with full SEO wiring (hreflang, localized metadata, per-locale sitemap entries). Scope covers the entire public surface — UI chrome, booking flow, account, and the complete SEO content set (29–30 route pages, 8 service pages, blog, legal) — translated by an AI-only, re-runnable pipeline. Stack: `next-intl` + `app/[locale]/` with `localePrefix: 'as-needed'`. Phases 68–75. See REQUIREMENTS.md / ROADMAP.md.

---

v2.2 (shipped 2026-09-02) delivered dispatcher and driver tooling: a future-first admin bookings list with a persistent default-horizon setting (Future only / Last N days / All) plus in-session past/all filter overrides that never touch the saved default, with KPI counters kept accurate (Phase 65); a permanent, unguessable per-assignment driver trip link opening a `noindex` trip sheet presentable to police control, coexisting byte-for-byte with the existing accept/decline flow (Phase 66); and driver trip-progress marking (en route → arrived → on board → completed / no-show) plus an optional note, both written to dedicated `driver_assignments` columns that are structurally isolated from `booking.status` and GNet, surfaced live to admin (Phase 67). Milestone audit passed (12/12 requirements, cross-phase integration INTEGRATED). Live and deployed on production.

v2.1 (prior) delivered full operator control of the booking lifecycle inside the admin panel: abandoned/unpaid checkout capture, admin booking editing with change-notification email + audit log, and admin-created bookings with an optional Stripe payment link.

v2.0 (earlier) delivered Blacklane-style booking UX with full customer authentication and account management, all GA4 + Meta Pixel/CAPI analytics signals preserved.

## Next Milestone: v3.0 Site Internationalization (planning)

Active. See REQUIREMENTS.md (I18N-/STR-/CNT-/TR-/RTL-/FONT-/SEO-/UX-/VER- IDs) and ROADMAP.md (Phases 68–75). Next step: `/gsd-plan-phase 68`.

Carried forward, NOT scheduled into v3.0 (candidates for a later milestone): CR-02 Stripe Payment Link deactivation hardening, automatic unpaid-reminder emails (FOLLOW-01), Google/Apple OAuth dashboard credential config (AUTH-02/03), corporate "book for a guest" step (BOOK-06), clearing the pre-existing red test baseline, and the v2.2 tech-debt items (driver trip-progress live-refresh, Phase 65 row-order + horizon-clamp regression tests). Note: the old "multilingual account UI (Czech, Russian)" item is **superseded and expanded** by the v3.0 full-site i18n milestone.

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
- ✓ DISP-01..04: Future-first admin bookings list, persistent default-horizon setting (Future/Last N days/All), in-session past/all override, KPI counters accurate — v2.2 (Phase 65)
- ✓ DTRIP-01/02/07/08: Permanent unguessable per-assignment trip link, noindex police-presentable trip sheet, coexists with accept/decline, token invalid on terminal status/reassignment — v2.2 (Phase 66)
- ✓ DTRIP-03/04/05/06: Driver trip-progress marking (en route/arrived/on board/completed/no-show) + optional note in dedicated columns isolated from `booking.status`/GNet, surfaced to admin — v2.2 (Phase 67)
- ✓ SEO-01..04, UX-01/02: Multilingual SEO — centralized translation/index-aware `getAlternates()` (hreflang incl. `zh-Hans`, self-referencing canonical + og:url per locale), sitemap cluster, localized metadata, JSON-LD `inLanguage`, header LocaleSwitcher, language suggestion inside the consent modal; prod-verified 417 localized URLs, 0 hreflang problems — v3.0 (Phase 74)

### Active

<!-- infrastructure/tech-debt items carried forward + v2.2 tech debt -->

- [ ] DTRIP-05 follow-up: admin trip-progress is fetched mount-only (no polling/realtime) — "live" is on-load; candidate for polling/Supabase-realtime (pairs with DTRIP-FUT work) — v2.2 tech debt
- [ ] Phase 65 tech debt: live DB row-ordering deferred to UAT (unit tests mock RPC args); horizon upper-bound clamp (≤3650) lacks a dedicated extreme-value regression test — v2.2
- [ ] DTRIP-FUT-01/02/03: driver GPS/geolocation, push/SMS notifications, optional push of trip-progress into GNet (explicitly out of v2.2 scope)
- [ ] FOLLOW-01: Automatic reminder email after N hours unpaid (deferred from v2.1)
- [ ] CR-02 follow-up: actual Stripe Payment Link deactivation (paymentLinks.update active:false) after price edit / manual confirm — v2.1 shipped a 409 guard + loud webhook alert only
- [ ] Nyquist validation not run for phases 62/63/64 (VALIDATION.md status: draft)
- [ ] Clear pre-existing red test baseline (12 files failing on main, not v2.1 regressions)
- [ ] AUTH-02: Google OAuth — code wired; Supabase Dashboard credential config still pending
- [ ] AUTH-03: Apple OAuth — code wired; Supabase Dashboard credential config still pending
- [ ] BOOK-06: Booking-method step — "Book for myself / Book as guest"; corporate also "Book for a guest" (deferred from v2.0)
- [ ] Corporate invoicing, monthly billing, cost-centre fields — basic corporate profile only in v2.0
- [ ] Email notifications — booking confirmation, reminder, driver assignment
- [ ] **v3.0 (active): Full-site internationalization** — next-intl + `app/[locale]/`, EN at root, 6 locales (RU/ES/FR/AR/HI/ZH) under subpaths, AI-translated UI + booking + account + all SEO content, hreflang/sitemap/RTL. Tracked in REQUIREMENTS.md (Phases 68–75). Supersedes the earlier "multilingual account UI (Czech, Russian)" item and expands it to the whole public site.

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

**Codebase size:** 14 milestones/phases shipped (54–67); latest migrations 055–061 (booking audit log, payment link, RLS hardening, dispatch horizon columns, driver_assignments `trip_token` + `trip_progress`/`trip_note`/`trip_progress_updated_at`).

**Driver portal:** `driver_assignments` carries both the legacy single-use accept/decline token (`token`/`token_used_at`/`token_expires_at`) and the permanent `trip_token` (migration 060). Trip sheet at `/driver/trip/[token]` (noindex); token-gated write route `/api/driver/trip/[token]/progress` updates only trip-progress/note columns, CSRF-protected and rate-limited, structurally isolated from `booking.status`/GNet.

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
| Dispatch horizon dual-state: persisted default (props) + ephemeral in-session override | DISP-03 — session filter never writes back to the saved default | ✓ Shipped v2.2 (Phase 65) |
| Separate `trip_token` column (migration 060), permanent until terminal status | DTRIP-01/08 — distinct from the single-use accept/decline token; the two flows share no mutable state | ✓ Shipped v2.2 (Phase 66) |
| `isTripLinkValid()` single predicate shared by trip-sheet render and write route | DTRIP-08 — no drift between what renders and what a write accepts; validity re-checked live (TOCTOU-closed) | ✓ Shipped v2.2 (Phase 66/67) |
| DTRIP-04 isolation-by-omission: write route imports no GNet/status module, touches only `driver_assignments` | Trip-progress must never mutate `booking.status` or push to GNet; grep gates enforce it structurally | ✓ Shipped v2.2 (Phase 67) |
| Driver note rendered as React JSX text (no `dangerouslySetInnerHTML`) | XSS — untrusted driver free text auto-escaped in the admin DOM | ✓ Shipped v2.2 (Phase 67) |
| v3.0: `next-intl` + `app/[locale]/` with `localePrefix: 'as-needed'` | EN stays at root with unchanged URLs → zero SEO-ranking risk; de-facto App Router i18n standard | — Pending (Phase 68) |
| v3.0: EN default at root, other locales in subpaths (not `/en` prefix, not ccTLD) | Preserve existing ranked English URLs; single domain; avoids a site-wide 301 | — Pending (Phase 68) |
| v3.0 locale set: RU, ES, FR, AR, HI, ZH (owner choice; no CS/DE this milestone) | World-language reach + premium Prague segments; CS/DE/JA/KO deferred, infra ready | — Pending |
| v3.0: locale-middleware composed INTO existing middleware (not replacing it) | CSP nonce + Supabase session + CSRF must survive byte-for-byte | — Pending (Phase 68) |
| v3.0: AI-only translation via a re-runnable pipeline with glossary + do-not-translate | Owner chose AI-only; prices/brand/vehicle-class/proper-nouns must never be translated | — Pending (Phase 72) |
| v3.0: long-form content → per-locale content files, UI strings → message catalogs | Abstract prose does not belong in JSON catalogs; keeps SEO bodies maintainable | — Pending (Phase 71) |
| v3.0: first-visit language suggestion lives inside the cookie consent modal, not a separate banner | One prompt instead of two; consent text readable in visitor's language; standalone banner never rendered in prod (next-intl sets NEXT_LOCALE on every response) and clashed with /book price bar | ✓ Good (Phase 74 UAT) |
| v3.0: middleware matcher skips static-file extensions only outside api/admin/driver/auth/account | txt/xml had to be excluded (robots/sitemap/llms 404'd since Phase 68) but a blanket suffix exclusion let crafted admin API paths skip CSRF | ✓ Good (Phase 74, 8821d8b8) |

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
*Last updated: 2026-09-24 after Phase 74. Milestone v3.0 Site Internationalization (i18n): Phases 68–74 shipped. Phase 74 delivered multilingual SEO (hreflang/canonical/sitemap/metadata/JSON-LD), header LocaleSwitcher and consent-modal language suggestion; UAT + security verified (18/18 threats closed). Also fixed during Phase 74: robots.txt/sitemap.xml/llms.txt were 404 in prod since Phase 68 (middleware matcher), and the WINDOWS #7 static-page EN leak. i18n Translate GitHub workflow disabled (Anthropic API credit empty; translations done in-session). Next: Phase 75 (E2E verification & launch).*
