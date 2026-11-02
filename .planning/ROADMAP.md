# Roadmap: Prestigo

## Milestones

- ✅ **v1.0 SEO Blog** — Phases 54-56 (shipped 2026-05-15)
- ✅ **v2.0 Blacklane-style Booking + Customer Accounts** — Phases 57-61 (shipped 2026-06-18)
- ✅ **v2.1 Admin Booking Management & Payment Recovery** — Phases 62-64 (shipped 2026-08-26)
- ✅ **v2.2 Dispatch & Driver Trip Portal** — Phases 65-67 (shipped 2026-09-02)
- ✅ **v3.0 Site Internationalization (i18n)** — Phases 68-75 (shipped 2026-09-27)
- ✅ **v4.0 Helpdesk + CRM** — Phases 76-85 (shipped 2026-11-02; 78/79 parked in backlog)

## Phases

<details>
<summary>✅ v4.0 Helpdesk + CRM (Phases 76-85) — SHIPPED 2026-11-02 (78/79 parked)</summary>

- [x] Phase 76: VPS Infrastructure (9/9 plans) — completed 2026-09-28
- [x] Phase 77: Chatwoot Deployment + Core Channels (13/13 plans) — completed 2026-09-29
- [ ] Phase 78: WhatsApp Cloud API Channel (Dedicated Number) (10/17 plans) — PARKED in Backlog 999.9
- [ ] Phase 79: Instagram + Facebook Channels (not started) — PARKED in Backlog 999.12
- [x] Phase 80: EspoCRM Deployment + Core Entities (13/13 plans) — completed 2026-10-17
- [x] Phase 81: Lead Capture (Site Forms → Supabase + EspoCRM) (11/11 plans) — completed 2026-10-18
- [x] Phase 82: Site ↔ CRM/Chatwoot Sync Foundation (16/16 plans) — completed 2026-10-26
- [x] Phase 83: CRM/Chatwoot → Site Webhooks (16/16 plans) — completed 2026-10-26
- [x] Phase 84: Chatwoot Dashboard App (9/9 plans) — completed 2026-10-30
- [x] Phase 85: Statistics (6/6 plans) — completed 2026-11-01

**Closeout:** override — 40/46 requirements; WA-01..04 and SOC-01/02 parked by owner; no milestone audit.

See [milestones/v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md) for full phase details.

</details>
<details>
<summary>✅ v3.0 Site Internationalization (Phases 68-75) — SHIPPED 2026-09-27</summary>

- [x] Phase 68: i18n Foundation & Routing (2/2 plans) — completed 2026-09-03
- [x] Phase 69: String Externalization — UI Chrome (5/5 plans) — completed 2026-09-04
- [x] Phase 70: String Externalization — Booking & Account (8/8 plans) — completed 2026-09-05
- [x] Phase 71: Content Externalization — Marketing & SEO Pages (9/9 plans) — completed 2026-09-11
- [x] Phase 72: AI Translation Pipeline & Catalogs (5/5 plans) — completed 2026-09-17
- [x] Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) (14/14 plans) — completed 2026-09-20
- [x] Phase 74: SEO — hreflang, Metadata, Sitemap, Switcher (6/6 plans) — completed 2026-09-24
- [x] Phase 75: E2E Verification & Launch (36/36 plans) — completed 2026-09-27

See [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v1.0 SEO Blog (Phases 54-56) — SHIPPED 2026-05-15</summary>

**Milestone Goal:** Scalable MDX blog at `/blog` with full SEO wiring, unified listing, and migrated legacy articles accessible at canonical `/blog/*` paths.

- [x] **Phase 54: MDX Infrastructure** — @next/mdx pipeline, lib/blog.ts aggregator, content/blog/ (2/2 plans, completed 2026-05-14)
- [x] **Phase 55: Blog UI — Listing + Article Pages** — /blog card grid + /blog/[slug] MDX renderer, full SEO (3/3 plans, completed 2026-05-14)
- [x] **Phase 56: Article Migration + SEO Wiring** — git mv 3 JSX articles, 301 redirects, sitemap reconciliation (4/4 plans, completed 2026-05-15)

See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v2.0 Blacklane-style Booking + Customer Accounts (Phases 57-61) — SHIPPED 2026-06-18</summary>

**Milestone Goal:** Customers can sign in (email + Google + Apple), manage a personal or corporate account with a "My trips" dashboard, and complete a redesigned Blacklane-style booking flow — with optional in-checkout sign-in, bookings linked to `user_id`, guest checkout always available, and zero analytics regression.

- [x] **Phase 57: Customer Auth Foundation** — Supabase Auth (email + Google + Apple), customer_profiles, nullable user_id FK, session split (3/3 plans, completed 2026-06-11)
- [x] **Phase 58: Sign-in UI + Account Dashboard** — Auth-aware Nav, login/signup pages, My trips shell, profile editing, corporate fields (5/5 plans, completed 2026-06-12)
- [x] **Phase 59: Booking Flow Redesign (Blacklane)** — Unified EntryBar, time-slot picker, inline flight field, RouteMap, VehicleCard + VehicleSlideshow, analytics preserved (5/5 plans, completed 2026-06-17)
- [x] **Phase 60: Auth-in-Checkout + Guest Path** — user_id linking, passenger pre-fill, guest checkout always available (1/1 plan, completed 2026-06-17)
- [x] **Phase 61: Analytics Preservation & E2E Verify** — E2E verification of GA4/Meta/CAPI events across guest + account paths (1/1 plan, completed 2026-06-17)

**Known deferred items:** BOOK-06 (corporate "book for a guest" step) deferred to v2.1. AUTH-02/03 (Google/Apple OAuth) code-complete — awaiting Supabase Dashboard credential config.

See [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v2.1 Admin Booking Management & Payment Recovery (Phases 62-64) — SHIPPED 2026-08-26</summary>

**Milestone Goal:** Give the operator full control of the booking lifecycle inside the admin panel — edit bookings with automatic client notification, capture abandoned/unpaid bookings for follow-up, and create bookings with an attachable payment link and client email.

- [x] **Phase 62: Abandoned & Unpaid Booking Capture** — Checkout attempts persisted before payment completes, surfaced as a followable unpaid queue in admin, reconciled without duplicates on payment success (4/4 plans, completed 2026-08-20)
- [x] **Phase 63: Admin Booking Editing + Change Notification** — Operator edits schedule/vehicle/route/passenger, server-authoritative price-change review, optional branded change-notification email, per-field edit audit log (5/5 plans, completed 2026-08-21)
- [x] **Phase 64: Admin-Created Bookings with Payment Link** — Admin-originated bookings with optional Stripe payment link + client email, auto no-duplicate reconcile (incl. round-trip both legs), or no-link cash/invoice save (4/4 plans, completed 2026-08-25)

**Audit:** passed — 19/19 requirements satisfied, cross-phase integration sound, all E2E flows complete. See [milestones/v2.1-MILESTONE-AUDIT.md](milestones/v2.1-MILESTONE-AUDIT.md).

See [milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v2.2 Dispatch & Driver Trip Portal (Phases 65-67) — SHIPPED 2026-09-02</summary>

**Milestone Goal:** Speed up dispatcher work with a future-first admin bookings list (persistent default + in-session filters), and give each driver a permanent working link to their trip — a trip sheet they can show to police control, with live status marking and an optional note that stay separate from the client-facing booking status.

- [x] **Phase 65: Dispatch — Future-First Bookings List** — Future-first admin bookings list with a persistent default-horizon setting + in-session past/all filters; KPI counters stay accurate (4/4 plans, completed 2026-08-31)
- [x] **Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet** — Permanent, unguessable per-assignment link to a noindex trip sheet, coexisting with the existing accept/decline flow (2/2 plans, completed 2026-09-01)
- [x] **Phase 67: Driver Trip Portal — Status Marking, Notes & Admin Visibility** — Driver marks live trip-progress and leaves an optional note; admin sees it in the bookings admin, with no effect on `booking.status` or GNet (2/2 plans, completed 2026-09-02)

**Audit:** passed — 12/12 requirements satisfied, cross-phase integration INTEGRATED, all E2E flows wired. See [milestones/v2.2-MILESTONE-AUDIT.md](milestones/v2.2-MILESTONE-AUDIT.md).

See [milestones/v2.2-ROADMAP.md](milestones/v2.2-ROADMAP.md) for full phase details.

</details>

## Parked Phase Details (from v4.0, in Backlog)

Kept here so `/gsd-execute-phase 78` and `/gsd-discuss-phase 79` still resolve; the Phase 78 directory stays in `.planning/phases/`.

### Phase 78: WhatsApp Cloud API Channel (Dedicated Number)

**Status**: DEFERRED to Backlog 999.9 by owner decision 2026-10-18 — parked at 78-11 Task 2 (owner Meta onboarding). Site keeps the personal number. Resume with `/gsd-execute-phase 78` when the owner brings it back.

**Goal**: WhatsApp conversations with Prestigo run on a new dedicated business number connected to Chatwoot through the WhatsApp Cloud API, and the site stops publishing the owner's personal number +420 725 986 855 (which returns to personal use after a transition period). Replanned 2026-09-29: Coexistence on the personal number was dropped by owner decision.
**Depends on**: Phase 77
**Requirements**: WA-01, WA-02, WA-03, WA-04
**Success Criteria** (what must be TRUE):
  1. WhatsApp messages to the new dedicated business number arrive in Chatwoot and can be answered from Chatwoot.
  2. Every public contact surface of the site (WhatsApp and phone links, JSON-LD, email footers, llms.txt, 7-locale content) shows the new number; the personal number is no longer published, and its transition auto-reply points customers to the new number.
  3. Operator can message a customer outside the 24-hour window using pre-approved WhatsApp templates (booking change, payment help, review request, trip reminder).
  4. A documented runbook covers WhatsApp channel recovery, current per-message pricing, and the rule that inboxes are never deleted without a fresh backup.

**Plans**: 10/17 plans executed

Plans:
**Wave 1**
- [x] 78-01-PLAN.md — Single business-number constant (current value) + link surfaces (Footer, Hero, contact, privacy, booking, form) + repo guard A (WA-04 stage a)
- [x] 78-02-PLAN.md — Meta credential custody: env example, pre-commit name gate + token shape, isolation guard forbids WhatsApp API in site code (security)
- [x] 78-03-PLAN.md — Graph client + idempotent templates-as-code CLI (--validate/--dry-run/--status/--only/--allow-edit), never deletes
- [x] 78-04-PLAN.md — Chatwoot config-as-code: WhatsApp inbox, ch-whatsapp + window-closing rules (execution_delay), owner membership, inspect --whatsapp
- [x] 78-05-PLAN.md — WhatsApp runbook: recovery, never-delete-without-backup, dated EUR pricing, PIN/SIM custody, transition + off-site checklists (WA-03)
- [x] 78-06-PLAN.md — Owner decision: WhatsApp/Meta privacy disclosure now (7 locales + freeze) or defer to Phase 82

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 78-07-PLAN.md — JSON-LD, email footers, llms text read the constant; code-wide single source; live check script proven on prod (WA-04 stage a)
- [x] 78-08-PLAN.md — WA-02 templates as code: booking change, payment help, review request, trip reminder x 7 locales
- [x] 78-09-PLAN.md — WhatsApp channel ops CLI: signature probe, --harden (app_secret), --number/--register (owner PIN), recovery levers (security)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 78-10-PLAN.md — Remaining templates (driver details, re-open, invoice ready per D-10 owner decision, payment received) — 56 submissions valid
- [ ] 78-11-PLAN.md — EUR confirmation (one-way) + owner Meta onboarding: new SIM, "Prestigo Messaging" app Live, number + display name, own-PIN registration, token

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 78-12-PLAN.md — Chatwoot manual inbox + enforced webhook signatures + D-06 go-live matrix from a second phone
- [ ] 78-13-PLAN.md — Submit all 56 templates to the new WABA (slice first, idempotent rerun)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 78-14-PLAN.md — Owner go/no-go (one-way) -> flip the constant, scripted 7-locale content replace (context-bounded), snapshots, deploy + live check (WA-04 stage b)
- [ ] 78-15-PLAN.md — WA-02 acceptance: approved templates sent outside the 24 h window, quick-reply reopen, window-closing label test

**Wave 6** *(needs only 78-14; does not wait for Meta template approval in 78-15)*
- [ ] 78-16-PLAN.md — Guard B + manifest freeze, final away-message text + launch-day pricing re-check, owner confirms the away message is live on the former number

**Wave 7** *(blocked on 78-15 and 78-16)*
- [ ] 78-17-PLAN.md — Stored-text inventory (Supabase/Chatwoot), test-data cleanup, off-site checklist, verified end state (pricing backstop)

### Phase 79: Instagram + Facebook Channels

**Status**: DEFERRED to Backlog 999.12 by owner decision 2026-11-02 — not started (no discuss/plans). Parked together with Phase 78: no Meta messaging app, WhatsApp, Instagram or Facebook channel for now. Locked when resumed: app and business verification under chelautotrans s.r.o. (IČO 05650801), as in 78 D-04. Resume with `/gsd-discuss-phase 79` after 78 is back.

**Goal**: Instagram and Facebook Page conversations join the same Chatwoot inbox as every other channel. Sequenced after WhatsApp/email/widget are stable to reduce blast radius if Meta App Review stalls or a scope-mixing rejection occurs.
**Depends on**: Phase 78
**Requirements**: SOC-01, SOC-02
**Success Criteria** (what must be TRUE):
  1. Instagram direct messages to the Prestigo account arrive in Chatwoot and can be answered from Chatwoot.
  2. Facebook Page messages arrive in Chatwoot and can be answered from Chatwoot.

**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 54. MDX Infrastructure | v1.0 | 2/2 | Complete | 2026-05-14 |
| 55. Blog UI — Listing + Article Pages | v1.0 | 3/3 | Complete | 2026-05-14 |
| 56. Article Migration + SEO Wiring | v1.0 | 4/4 | Complete | 2026-05-15 |
| 57. Customer Auth Foundation | v2.0 | 3/3 | Complete | 2026-06-11 |
| 58. Sign-in UI + Account Dashboard | v2.0 | 5/5 | Complete | 2026-06-12 |
| 59. Booking Flow Redesign (Blacklane) | v2.0 | 5/5 | Complete | 2026-06-17 |
| 60. Auth-in-Checkout + Guest Path | v2.0 | 1/1 | Complete | 2026-06-17 |
| 61. Analytics Preservation & E2E Verify | v2.0 | 1/1 | Complete | 2026-06-17 |
| 62. Abandoned & Unpaid Booking Capture | v2.1 | 4/4 | Complete | 2026-08-20 |
| 63. Admin Booking Editing + Change Notification | v2.1 | 5/5 | Complete | 2026-08-21 |
| 64. Admin-Created Bookings with Payment Link | v2.1 | 4/4 | Complete | 2026-08-25 |
| 65. Dispatch — Future-First Bookings List | v2.2 | 4/4 | Complete | 2026-08-31 |
| 66. Driver Trip Portal — Permanent Link & Trip Sheet | v2.2 | 2/2 | Complete | 2026-09-01 |
| 67. Driver Trip Portal — Status Marking, Notes & Admin Visibility | v2.2 | 2/2 | Complete | 2026-09-02 |
| 68. i18n Foundation & Routing | v3.0 | 2/2 | Complete    | 2026-09-03 |
| 69. String Externalization — UI Chrome | v3.0 | 5/5 | Complete    | 2026-09-04 |
| 70. String Externalization — Booking & Account | v3.0 | 8/8 | Complete    | 2026-09-05 |
| 71. Content Externalization — Marketing & SEO Pages | v3.0 | 9/9 | Complete    | 2026-09-11 |
| 72. AI Translation Pipeline & Catalogs | v3.0 | 5/5 | Complete    | 2026-09-17 |
| 73. Non-Latin & RTL Infra (AR, HI, ZH) | v3.0 | 14/14 | Complete    | 2026-09-20 |
| 74. SEO — hreflang, Metadata, Sitemap, Switcher | v3.0 | 6/6 | Complete    | 2026-09-24 |
| 75. E2E Verification & Launch | v3.0 | 36/36 | Complete    | 2026-09-27 |
| 76. VPS Infrastructure | v4.0 | 9/9 | Complete    | 2026-09-28 |
| 77. Chatwoot Deployment + Core Channels | v4.0 | 13/13 | Complete    | 2026-09-29 |
| 78. WhatsApp Cloud API Channel (Dedicated Number) | v4.0 | 10/17 | Parked (999.9) | - |
| 79. Instagram + Facebook Channels | v4.0 | 0/0 | Parked (999.12) | - |
| 80. EspoCRM Deployment + Core Entities | v4.0 | 13/13 | Complete    | 2026-10-17 |
| 81. Lead Capture (Site Forms → Supabase + EspoCRM) | v4.0 | 11/11 | Complete    | 2026-10-18 |
| 82. Site ↔ CRM/Chatwoot Sync Foundation | v4.0 | 16/16 | Complete    | 2026-10-26 |
| 83. CRM/Chatwoot → Site Webhooks | v4.0 | 16/16 | Complete    | 2026-10-26 |
| 84. Chatwoot Dashboard App | v4.0 | 9/9 | Complete    | 2026-10-30 |
| 85. Statistics | v4.0 | 6/6 | Complete    | 2026-11-01 |

## Backlog

v3.0 tech debt, deferred by owner decision 2026-09-27 until Anthropic API credits are topped up. Source: milestones/v3.0-MILESTONE-AUDIT.md, milestones/v3.0-phases/75-*/deferred-items.md, .planning/WINDOWS.md.

- [ ] **999.1 Re-enable AI translation** — top up Anthropic API credit, re-enable the i18n Translate GH workflow; translate + publish the parked `_deferred-blog/prague-to-budapest-private-transfer.mdx` in 6 locales
- [ ] **999.2 Localized client emails + confirmation page** — thread booking locale into `lib/email*.ts` (16 templates) and localize `app/[locale]/book/confirmation/page.tsx` (WINDOWS #21, D-05)
- [ ] **999.3 Remaining translation content** — `/routes` hub per-route blurbs (WINDOWS #16); ArticleByline "By/Published/Updated" + locale-aware byline/blog-card dates; catalog residual (293 leaf findings on unscanned pages — triage via `scripts/qa/en_leak_catalog.py`); `/ru/fleet` 768px overflow
- [ ] **999.4 Content-rule fix** — remove the Uber comparison from `/services/airport-transfer` FAQ (EN + 6 locales) and review airport blog posts (no Uber, no prices)
- [ ] **999.5 RU/AR signed-in booking E2E** — owner creates test account + `scripts/qa/.e2e-account.json`, run `booking_e2e.py --locales "" --account ru,ar` (WINDOWS #25, VER-01 override)
- [ ] **999.6 SEO/share polish** — og:locale on openGraph overrides, mirror custom og:image to twitter:image, page-specific share titles; IN-01 MDX locale double-prefix guard; IN-02 per-field `t.has`; GSC hreflang report check
- [ ] **999.7 Meta/CAPI robustness** — WR-06 warn-once on malformed pixel ID/CAPI token; IN-03 encode CAPI token via `URL.searchParams`
- [ ] **999.8 Test/QA infra** — fix worktree `next-intl/server` relative-path import in 5 test files (WINDOWS #17–19); QA-script fixes (share_meta asymmetric check, en_leak icon-child skip, IN-04 route.abort); close stale WINDOWS #8; Nyquist `/gsd-validate-phase` for 68–75; Playwright E2E in CI once Vercel Preview works. IN-05 (raw 404 without `lang`) = Next.js framework behaviour, won't-fix
- [ ] **999.9 Phase 78 WhatsApp dedicated number (resume)** — 10/17 plans done; resume at 78-11 Task 2: new SIM, "Prestigo Messaging" app Live, number + display name, own PIN, token, EUR card, business verification; then 78-12..78-17 (go-live, submit 56 templates, site number switch, acceptance). Deferred by owner 2026-10-18
- [ ] **999.10 Chatwoot webhook reconcile job (D-21)** — periodic job that lists recently created and resolved Chatwoot conversations and re-enqueues hook.chat_intake / hook.chat_resolve rows for events Chatwoot's at-most-once account webhook lost; manual recovery is in infra/vps/runbooks/inbound-webhooks.md until then
- [ ] **999.11 Phase 83 review follow-ups** — open warnings from 83-REVIEW.md / 83-REVIEW-DISPOSITION.md: first WR-06 (erasure treats a Note-stream 403 as "no notes", uncounted) and WR-02 (concurrent intake/contact/sync can create a duplicate EspoCRM Contact outside the registry — erasure would miss it); then WR-01 (label between intake retries leaves an orphan Lead), WR-03 (lost conversion Note → Phase 85 counts), WR-04 (Chatwoot rotate loses events until redeploy), WR-05 (visitor Markdown in CRM fields), WR-07 (no cap on deadline reschedules), IN-01..05; plus the D-01 edge: a widget visitor whose email belongs to a site login account is classed as a stranger (identity not linked to user_id)
- [ ] **999.12 Phase 79 Instagram + Facebook channels (resume)** — SOC-01/02 not started; depends on 999.9 (the shared "Prestigo Messaging" Meta app, 78 D-01). Open questions for discuss: create the app inside 79 vs wait for 78, App Review / Advanced Access + business verification (chelautotrans s.r.o.), Instagram Login vs Page-linked Instagram channel, single reply surface + labels/routing. Deferred by owner 2026-11-02
