# Prestigo — rideprestigo.com

## What This Is

Prestigo is a premium chauffeur service based in Prague, Czech Republic. The site (rideprestigo.com) is a Next.js 14+ App Router marketing and booking platform that handles airport transfers, intercity routes, corporate accounts, and VIP events for international travellers and corporate clients across Central Europe. The public site is served in seven languages — English at the root plus Russian, Spanish, French, Arabic (RTL), Hindi and Chinese under `/ru/`, `/es/`, `/fr/`, `/ar/`, `/hi/`, `/zh/`. Customers can sign in with email or OAuth to access a personal account with trip history and pre-filled passenger details; guest checkout is always available without registration.

## Core Value

Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction.

## Current State: v3.0 shipped — Site Internationalization (i18n)

v3.0 (shipped 2026-09-27) made the whole public site multilingual without touching English SEO: English stays at the root with every existing URL unchanged, and six locales (RU, ES, FR, AR RTL, HI, ZH) are served under subpaths. next-intl `app/[locale]/` routing is composed into the CSP/Supabase/CSRF middleware; UI chrome, booking wizard, account/auth, 30 route pages, 8 service pages, marketing/legal pages and blog are externalized and translated by a re-runnable AI pipeline (`scripts/i18n-translate.mjs`, glossary + DNT + fail-closed verifier). Arabic renders RTL with bidi-isolated prices; Noto Arabic/Devanagari/SC load per locale. hreflang/sitemap/metadata/JSON-LD are localized from one `getAlternates()`. Production E2E proven across all 7 locales (guest booking to localized Stripe incl. /ar, 0 English leaks). Audit: tech_debt, 20/20 requirements; RU/AR signed-in booking path accepted by owner as unverified.

v2.2 (2026-09-02) delivered dispatcher and driver tooling (future-first admin list, permanent driver trip link + trip sheet, trip-progress marking). v2.1 delivered admin booking lifecycle control. v2.0 delivered Blacklane-style booking with customer accounts.

## Current Milestone: v4.0 Helpdesk + CRM

**Goal:** Every customer conversation (WhatsApp, email, website chat, Telegram/Instagram/Facebook) lands in one self-hosted Chatwoot inbox, every inquiry and every customer who ever booked is retained in a self-hosted EspoCRM with a B2B pipeline and repeat-sales base — both on a new Hostinger VPS and linked two-way with production (Supabase stays the source of truth for bookings and customers).

**Target features:**
- Hostinger VPS (Docker) running Chatwoot + EspoCRM on own subdomains with TLS, backups and monitoring — the public site must never depend on VPS uptime
- Chatwoot omnichannel inbox: WhatsApp Cloud API (existing +420 number), service mail (info@/booking@) via IMAP/SMTP, consent-gated website widget, Telegram/Instagram/Facebook
- Persist every lead: contact form, corporate form, multi-day quotes (today email-only, never stored) into Supabase + CRM
- Site → CRM/Chatwoot sync via Supabase outbox + QStash (bookings, payments, status changes, signups, leads) — idempotent, retried
- Chatwoot → CRM: conversations create/update contacts & leads; conversation summary written to CRM contact history
- Chatwoot Dashboard App showing the customer's bookings from Supabase inside the conversation sidebar
- EspoCRM B2B pipeline (hotels, agencies, corporates) with sales mailbox (sales@/roman@) in EspoCRM only — no mailbox connected to both systems
- Statistics (conversations, response time, leads → bookings, repeat customers) and replacing manual `send-*.mjs` ops with Chatwoot canned responses/templates

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
- ✓ I18N-01..04: next-intl `app/[locale]/` routing, EN at root with unchanged URLs, middleware composed with CSP/Supabase/CSRF, dynamic `lang`/`dir`, typed 7-locale config — v3.0 (Phase 68)
- ✓ STR-01/02: UI chrome, booking flow, account/auth, forms and validation text in message catalogs — v3.0 (Phases 69–70)
- ✓ CNT-01..03: Route pages, service/marketing/legal pages and blog in a per-locale content model — v3.0 (Phase 71)
- ✓ TR-01/02: Re-runnable AI translation pipeline with glossary/DNT; complete RU/ES/FR/AR/HI/ZH translations — v3.0 (Phases 72–73)
- ✓ RTL-01, FONT-01: Arabic RTL via logical properties + bidi-isolated prices; Noto Arabic/Devanagari/SC per locale — v3.0 (Phase 73)
- ✓ VER-01: Cross-locale production E2E (render, switcher, guest booking incl. RTL, analytics `site_locale`, no CSP regression, 0 EN leaks); RU/AR signed-in path accepted as unverified — v3.0 (Phase 75)
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
- [ ] v4.0: self-hosted Chatwoot + EspoCRM on Hostinger VPS, one inbox for all channels, all leads persisted, two-way site↔helpdesk↔CRM sync, B2B pipeline, stats
- [ ] v3.0 i18n tech debt — localized client emails + confirmation page, /routes hub blurbs, byline dates, catalog residual, Uber-comparison FAQ rewrite, RU/AR signed-in E2E, share-meta polish, Meta/CAPI robustness, test/QA infra; parked in ROADMAP.md Backlog 999.1–999.8 until API credits are topped up

### Out of Scope

- Payment methods beyond Stripe; saved cards — Stripe one-off only
- Facebook OAuth — Google + Apple priority
- Multi-user corporate accounts, role permissions — single profile per company in v2.0
- Replacing admin auth or changing admin session model
- CS / DE / JA / KO content — i18n infra supports them; content deferred to a later milestone
- Human translation / proofreading — AI-only translation chosen for v3.0
- Per-locale ccTLDs or subdomains — single-domain subpath strategy preserves EN ranking

## Context

**Tech stack:** Next.js 14+ App Router, React 19, TypeScript, Tailwind CSS v4, Supabase (PostgreSQL + Auth/GoTrue), Stripe, deployed on Vercel. Booking flow uses Zustand (sessionStorage), Google Maps JS SDK, and GNet integration. GA4 + Meta Pixel/CAPI analytics with server-side Measurement Protocol in Stripe webhook.

**Vehicle fleet:** Three Mercedes classes — E-Class (Business), S-Class (First Class), V-Class (Business Van). Vehicle images are AVIF format at `/public/vehicles/`.

**Auth stack:** Admin auth (password-only) and customer auth (email + OAuth) both use Supabase GoTrue — isolated via middleware checks on `user_metadata.role`. Customer profiles in `customer_profiles` table with RLS. Bookings carry nullable `user_id` FK; guest checkout always valid.

**Blog:** MDX articles in `content/blog/<locale>/` (11 posts × 7 locales) plus legacy JSX articles under `app/[locale]/blog/`. Hybrid model — static dirs take precedence over dynamic MDX route. `/guides/*` and `/compare/*` redirect 308 to `/blog/*`.

**i18n:** next-intl 4.x, `i18n/locales.ts` single source, catalogs `messages/<locale>.json`, content `content/{routes,pages,blog}/<locale>/`, translation via `scripts/i18n-translate.mjs` (GH workflow disabled while API credit is empty — translate in-session; never run `--dry-run` on the repo tree). v3.0 added ~133k lines across 841 files.

**Codebase size:** phases 54–75 shipped; latest migrations 055–061 (booking audit log, payment link, RLS hardening, dispatch horizon columns, driver_assignments `trip_token` + `trip_progress`/`trip_note`/`trip_progress_updated_at`).

**Driver portal:** `driver_assignments` carries both the legacy single-use accept/decline token (`token`/`token_used_at`/`token_expires_at`) and the permanent `trip_token` (migration 060). Trip sheet at `/driver/trip/[token]` (noindex); token-gated write route `/api/driver/trip/[token]/progress` updates only trip-progress/note columns, CSRF-protected and rate-limited, structurally isolated from `booking.status`/GNet.

## Constraints

- **Tech stack**: Next.js App Router only — no Pages Router patterns
- **Styling**: Tailwind CSS v4 with existing design tokens (`bg-anthracite`, `border-anthracite-light`, `copper`, etc.) — no new CSS frameworks
- **SEO**: Every article page must have canonical URL, OG tags, Schema.org Article — non-negotiable
- **Guest checkout**: Must always remain available; sign-in is never a hard gate
- **Admin auth**: Untouched — admin session isolation must be maintained across all changes
- **v4.0 VPS independence**: public site, booking and payments must keep working when the Hostinger VPS (Chatwoot/EspoCRM) is down — sync is async via outbox
- **v4.0 CSP/consent**: chat widget needs `middleware.ts` CSP additions (script/connect incl. wss/frame/img) + `scripts/qa/baselines/csp_baseline.json`, and consent gating like `components/CookieBanner.tsx` consumers
- **Secrets**: VPS/Chatwoot/EspoCRM/WhatsApp tokens only in env (Vercel + VPS), never committed

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
| v3.0: `next-intl` + `app/[locale]/` with `localePrefix: 'as-needed'` | EN stays at root with unchanged URLs → zero SEO-ranking risk; de-facto App Router i18n standard | ✓ Good — shipped v3.0 |
| v3.0: EN default at root, other locales in subpaths (not `/en` prefix, not ccTLD) | Preserve existing ranked English URLs; single domain; avoids a site-wide 301 | ✓ Good — EN URLs unchanged |
| v3.0 locale set: RU, ES, FR, AR, HI, ZH (owner choice; no CS/DE this milestone) | World-language reach + premium Prague segments; CS/DE/JA/KO deferred, infra ready | ✓ Shipped v3.0 |
| v3.0: locale-middleware composed INTO existing middleware (not replacing it) | CSP nonce + Supabase session + CSRF must survive byte-for-byte | ✓ Good — CSP/CSRF intact (Phase 75 E2E) |
| v3.0: AI-only translation via a re-runnable pipeline with glossary + do-not-translate | Owner chose AI-only; prices/brand/vehicle-class/proper-nouns must never be translated | ⚠️ Revisit — works, but blocked when API credit runs out |
| v3.0: long-form content → per-locale content files, UI strings → message catalogs | Abstract prose does not belong in JSON catalogs; keeps SEO bodies maintainable | ✓ Good |
| v3.0: first-visit language suggestion lives inside the cookie consent modal, not a separate banner | One prompt instead of two; consent text readable in visitor's language; standalone banner never rendered in prod (next-intl sets NEXT_LOCALE on every response) and clashed with /book price bar | ✓ Good (Phase 74 UAT) |
| v3.0: middleware matcher skips static-file extensions only outside api/admin/driver/auth/account | txt/xml had to be excluded (robots/sitemap/llms 404'd since Phase 68) but a blanket suffix exclusion let crafted admin API paths skip CSRF | ✓ Good (Phase 74, 8821d8b8) |
| v3.0: close with accepted override for RU/AR signed-in booking path (no test account) | Guest path proven on 7/7 locales; signed-in variant shares the same locale logic | — Pending (Backlog 999.5) |
| v4.0: Chatwoot as helpdesk (self-hosted) | Only OSS tool that unifies WhatsApp Cloud API, IMAP email, website widget and Telegram/IG/FB in one inbox; reports, assignment, Dashboard Apps, API/webhooks | — Pending |
| v4.0: EspoCRM as CRM (over Twenty / custom admin CRM) | Mature, light (PHP+MySQL), stable REST API + webhooks, custom entities without code, strong free roles/ACL; paid Advanced Pack unnecessary because automations live in our code | — Pending |
| v4.0: integration logic in repo (Next.js + Supabase outbox + QStash), no n8n | Tested, versioned, idempotent, retried; nothing lost if VPS is down | — Pending |
| v4.0: Supabase remains source of truth for bookings/customers | CRM and Chatwoot are downstream views; no booking writes originate from them | — Pending |
| v4.0: separate mailboxes — service mail in Chatwoot, sales mail in EspoCRM; never one mailbox in both | Avoids duplicate messages, double replies and broken reply-time stats; Chatwoot conversation summaries still reach CRM history via sync | — Pending |
| v3.0: accept tech debt at close, defer to backlog until API credits return | Translation-dependent fixes need the AI pipeline | — Pending |

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
*Last updated: 2026-09-27 after starting milestone v4.0 (Helpdesk + CRM).*
