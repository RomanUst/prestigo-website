# Prestigo — rideprestigo.com

## What This Is

Prestigo is a premium chauffeur service based in Prague, Czech Republic. The site (rideprestigo.com) is a Next.js 14+ App Router marketing and booking platform that handles airport transfers, intercity routes, corporate accounts, and VIP events for international travellers and corporate clients across Central Europe. The public site is served in seven languages — English at the root plus Russian, Spanish, French, Arabic (RTL), Hindi and Chinese under `/ru/`, `/es/`, `/fr/`, `/ar/`, `/hi/`, `/zh/`. Customers can sign in with email or OAuth to access a personal account with trip history and pre-filled passenger details; guest checkout is always available without registration. Behind the site, a self-hosted Chatwoot inbox (email, website chat, Telegram) and EspoCRM (leads, B2B pipeline, booking history) on a separate VPS stay in sync with Supabase, which remains the source of truth.

## Core Value

Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction.

## Current State: v4.0 shipped — Helpdesk + CRM

v4.0 (shipped 2026-11-02) added a self-hosted helpdesk and CRM next to the site without making the site depend on them. A Hostinger VPS runs Chatwoot (`chat.rideprestigo.com`) and EspoCRM (`crm.rideprestigo.com`) in Docker behind Caddy TLS, with nightly encrypted restic backups to Backblaze B2 (restore drill proven on a throwaway host), UptimeRobot + Healthchecks alerts and a real full-outage test showing the site, booking and Stripe keep working with the VPS down. Chatwoot is one inbox for info@/bookings@ email, a consent-gated website widget (HMAC identity for signed-in customers, all 7 locales) and Telegram, with canned responses, labels, teams and automation as code (`infra/chatwoot/sync.mjs`). EspoCRM holds Accounts/Contacts, a B2B Opportunity pipeline, read-only booking history and the sales mailbox. Every lead (contact, corporate, multi-day, abandoned checkout, site booking) is stored in Supabase and reaches EspoCRM through a Supabase outbox + QStash; HMAC-verified webhooks bring chat conversations back as Contacts/Leads and history Notes with echo-loop protection; GDPR erasure covers all three systems; a read-only Chatwoot Dashboard App shows the customer's bookings; `/admin/stats` reports conversion, repeat customers and B2B revenue. Closed with overrides: WhatsApp (Phase 78, 10/17 plans) and Instagram/Facebook (Phase 79, not started) parked in Backlog 999.9 / 999.12 by owner — the site still shows the personal WhatsApp number.

<details>
<summary>Earlier milestones</summary>

v3.0 (shipped 2026-09-27) made the whole public site multilingual without touching English SEO: English stays at the root with every existing URL unchanged, and six locales (RU, ES, FR, AR RTL, HI, ZH) are served under subpaths. next-intl `app/[locale]/` routing is composed into the CSP/Supabase/CSRF middleware; UI chrome, booking wizard, account/auth, 30 route pages, 8 service pages, marketing/legal pages and blog are externalized and translated by a re-runnable AI pipeline (`scripts/i18n-translate.mjs`, glossary + DNT + fail-closed verifier). Arabic renders RTL with bidi-isolated prices; Noto Arabic/Devanagari/SC load per locale. hreflang/sitemap/metadata/JSON-LD are localized from one `getAlternates()`. Production E2E proven across all 7 locales.

v2.2 (2026-09-02) delivered dispatcher and driver tooling (future-first admin list, permanent driver trip link + trip sheet, trip-progress marking). v2.1 delivered admin booking lifecycle control. v2.0 delivered Blacklane-style booking with customer accounts.

</details>

## Current Milestone: v5.0 Payments, Quotes & Day Trips

**Goal:** Stop losing Stripe fees on cancellations, offer flexible payment (card hold, cash with card guarantee, quote deposits), speed up dispatch in the admin, and launch bookable day trips as a new product.

**Target features:**
- Card-on-file booking: SetupIntent (3DS) at checkout, no charge; automatic full-amount hold ~5 days before the trip; capture after completion; cancellation costs 0 € in fees; failed hold → client payment link + operator alert
- Cash payment option: card saved only (no hold); no-show → off-session charge of 100%
- Admin quotes: bundle several days/trips into one quote with a shareable quote link and a deposit link (operator sets deposit as % or fixed amount); operator chooses how the remainder is collected (saved card, payment link, cash, invoice)
- Admin UX: kanban of bookings by status, day/week/month calendar, collapsible sidebar, light theme toggle
- Driver → admin status sync: driver trip-link status (en route → on site → passenger on board → completed) updates the booking status in admin; driver page shows only the single next step (strict order); "completed" triggers capture (reverses the v2.2 "trip-progress never mutates booking.status" decision)
- Multi-stop transfers: price by km through all stops + per-stop waiting (15 min free, then a configurable fee per extra 15 min); airport pickup offset (landing 14:00, pickup 14:30) with 60 min free waiting counted from the pickup time
- Day trips (GetYourGuide-style catalogue: Karlovy Vary, Český Krumlov, …): price per car by vehicle class from the admin, online booking; "request a custom tour" form → lead (Supabase/EspoCRM/Chatwoot) → operator answers with a quote link

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
- ✓ INFRA-01..05: Hostinger VPS with Chatwoot + EspoCRM over auto-renewing TLS, nightly encrypted offsite backups with a proven restore drill, VPS-independent alerting, unattended security updates + pinned-version upgrade runbook, site/booking/payments proven to survive a full VPS outage — v4.0 (Phase 76)
- ✓ INBOX-01..06, OPS-01/02: Chatwoot inbox for info@/bookings@ email, click-to-load site widget (7 locales, RTL, HMAC identity, no CSP/CWV regression), Telegram bot, per-channel reports, canned responses in 7 locales replacing `send-*.mjs`, channel/topic labels and assignment as code — v4.0 (Phase 77)
- ✓ CRM-01..05: EspoCRM Accounts/Contacts, B2B Opportunity Kanban with follow-ups, read-only CBooking history from Supabase, sales mailbox in EspoCRM only, operator roles/ACL runbook — v4.0 (Phase 80)
- ✓ LEAD-01..06: contact/corporate/multi-day forms, abandoned checkouts and every site booking stored in Supabase and mirrored as EspoCRM Leads via the outbox, with no regression if storage fails — v4.0 (Phase 81)
- ✓ HOOK-01..04: HMAC-verified Chatwoot/EspoCRM webhooks create Contacts/Leads from new conversations and history Notes from resolved ones, structurally barred from booking/customer tables, echo loops blocked by origin fingerprinting — v4.0 (Phase 83)
- ✓ PANEL-01/02: read-only Chatwoot Dashboard App with the customer's site bookings, origin-validated postMessage, no admin cookie — v4.0 (Phase 84)
- ✓ SYNC-01..05, GDPR-01/02: Site → EspoCRM/Chatwoot sync via Supabase outbox + QStash (bookings, payments, status changes, admin edits, signups), cross-system contact de-dup by email/E.164 with shared-number flag and admin split, one-time backfill, /admin/outbox health + retry, single erasure request across Supabase/Chatwoot/EspoCRM with audit, privacy policy in all locales — v4.0 (Phase 82, live 2026-10-20, UAT 4/4 + verification 5/5 on 2026-10-26)
- ✓ STAT-01..03: `/admin/stats` with tabs Overview / Conversion (inquiries → paid bookings by source and chat channel, plus all paid bookings of the period: after inquiry + direct = total) / Customers (repeat rate, repeat revenue share, top 10) / B2B (revenue and bookings per corporate Account); period in the URL; read-only service_role RPCs (migrations 081–083), no Chatwoot/EspoCRM calls at render — v4.0 (Phase 85, live 2026-11-01, UAT 2/2, verification 9/9, security 23/23)
- ✓ ADM-01..03, DISP-01..05: collapsible admin sidebar and persistent light theme (Phase 86); `/admin/bookings` with List / Board / Calendar tabs — kanban by status with drag-and-drop or card menu (allowed transitions only, money moves confirmed in a dialog), day/week/month calendar in Prague time coloured by status, one shared booking panel, 30 s auto-refresh through an admin-only dispatch route — v5.0 (Phase 90, live 2026-11-11, UAT 6/6 on production, verification 4/4, security 0 open)

### Active

<!-- v5.0 Payments, Quotes & Day Trips -->

- [ ] Card-on-file + scheduled hold + capture-on-completion payment model
- [ ] Cash payment with saved card and 100% no-show charge
- [ ] Admin multi-trip quotes with quote link, deposit link and remainder method
- [ ] Driver step-by-step status synced to booking status
- [ ] Multi-stop transfers with waiting fees; airport pickup offset
- [ ] Day trips catalogue + booking + custom-tour request

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
- [ ] WA-01..04: WhatsApp Cloud API on a dedicated business number, 8 templates × 7 locales, runbook, site number switch — Phase 78 parked at 78-11 Task 2 (Backlog 999.9)
- [ ] SOC-01/02: Instagram DMs and Facebook Page messages in Chatwoot — Phase 79 not started (Backlog 999.12)
- [ ] v4.0 follow-ups: Chatwoot webhook reconcile job (999.10); Phase 83 review warnings (999.11); Phase 85 WR-02 (identity key mismatch) and WR-03 (CZK→EUR rate differs from Chatwoot panel) — next migration 084
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

**Codebase size:** phases 54–85 shipped (~100k lines in app/components/lib/infra/migrations); latest migrations 076–083 (webhook ingest, chat identity/leads, panel_bookings, stats RPCs); next migration 084. v4.0 added ~164k lines across 1,355 files (803 commits, 2026-09-27 → 2026-11-02).

**Helpdesk + CRM (v4.0):** VPS tree in `infra/vps/` (bootstrap, compose stacks, backup/restore, runbooks); Chatwoot and EspoCRM config as code in `infra/chatwoot/` and `infra/espocrm/` (idempotent sync scripts, owner-run, never called by the site at runtime). Outbox + QStash dispatcher in the site; `/admin/outbox` health; webhooks at `/api/webhooks/chatwoot` and `/api/webhooks/espocrm`; Dashboard App served from the site. Owner secrets live in `~/.config/prestigo/` and Vercel/VPS env only.

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
| v4.0: Chatwoot as helpdesk (self-hosted) | Only OSS tool that unifies WhatsApp Cloud API, IMAP email, website widget and Telegram/IG/FB in one inbox; reports, assignment, Dashboard Apps, API/webhooks | ✓ Good — email, widget, Telegram live; Meta channels parked |
| v4.0: EspoCRM as CRM (over Twenty / custom admin CRM) | Mature, light (PHP+MySQL), stable REST API + webhooks, custom entities without code, strong free roles/ACL; paid Advanced Pack unnecessary because automations live in our code | ✓ Good — shipped v4.0 |
| v4.0: integration logic in repo (Next.js + Supabase outbox + QStash), no n8n | Tested, versioned, idempotent, retried; nothing lost if VPS is down | ✓ Good — outage test passed; QStash had to be configured at go-live |
| v4.0: Supabase remains source of truth for bookings/customers | CRM and Chatwoot are downstream views; no booking writes originate from them | ✓ Good — enforced by import-closure guard tests |
| v4.0: separate mailboxes — service mail in Chatwoot, sales mail in EspoCRM; never one mailbox in both | Avoids duplicate messages, double replies and broken reply-time stats; Chatwoot conversation summaries still reach CRM history via sync | ✓ Good |
| v4.0: Chatwoot/EspoCRM configuration as code with idempotent owner-run sync scripts | Reviewable, reproducible after restore; second run is a no-op | ✓ Good |
| v4.0: close without Meta channels (WhatsApp 78, IG/FB 79 parked by owner) | Owner deferred Meta onboarding (new SIM, Meta app, verification); business verification will use chelautotrans s.r.o. | — Pending (Backlog 999.9 / 999.12) |
| v4.0 (Phase 85): stats computed in Supabase SQL (STABLE SECURITY DEFINER RPCs), chat channel stored at intake and backfilled once | Stats page never depends on the VPS; one source of truth for revenue numbers | ✓ Good (Phase 85) |
| v4.0 (Phase 85): fix WR-01 so funnel + direct reconcile to period total; leave WR-02/WR-03 open | Revenue columns must add up for the owner; WR-02 has 0 live rows, WR-03 affects 2 rows | ✓ Good (migration 083) |
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
*Last updated: 2026-11-11 after Phase 90 (Dispatch Views).*
