# Roadmap: Prestigo

## Milestones

- ✅ **v1.0 SEO Blog** — Phases 54-56 (shipped 2026-05-15)
- ✅ **v2.0 Blacklane-style Booking + Customer Accounts** — Phases 57-61 (shipped 2026-06-18)
- ✅ **v2.1 Admin Booking Management & Payment Recovery** — Phases 62-64 (shipped 2026-08-26)
- ✅ **v2.2 Dispatch & Driver Trip Portal** — Phases 65-67 (shipped 2026-09-02)
- ✅ **v3.0 Site Internationalization (i18n)** — Phases 68-75 (shipped 2026-09-27)
- 🚧 **v4.0 Helpdesk + CRM** — Phases 76-85 (in progress, started 2026-09-27)

## Phases

### v4.0 Helpdesk + CRM (Phases 76-85) — IN PROGRESS

- [x] **Phase 76: VPS Infrastructure** - Hostinger VPS KVM 2 (Docker/Caddy) running Chatwoot + EspoCRM with TLS, backups, restore drill, and independent alerting; public site keeps working if VPS is down (completed 2026-09-28)
- [ ] **Phase 77: Chatwoot Deployment + Core Channels** - Chatwoot live with email (info@/bookings@), consent-gated CWV-safe website widget, Telegram, native reports, canned responses and automation
- [ ] **Phase 78: WhatsApp Cloud API Channel (Coexistence)** - WhatsApp Business Coexistence onboarding for the existing +420 number, pre-approved outbound templates, recovery runbook
- [ ] **Phase 79: Instagram + Facebook Channels** - Instagram DMs and Facebook Page messages join the same Chatwoot inbox
- [ ] **Phase 80: EspoCRM Deployment + Core Entities** - EspoCRM live with Accounts/Contacts, B2B Opportunity Kanban pipeline, read-only Booking history, sales mailbox, roles/ACL
- [ ] **Phase 81: Lead Capture (Site Forms → Supabase + EspoCRM)** - Contact, corporate and multi-day-quote forms (plus abandoned-checkout/calculator signals) persist to Supabase and appear as EspoCRM Leads, with no regression if storage fails
- [ ] **Phase 82: Site ↔ CRM/Chatwoot Sync Foundation** - Durable Supabase outbox + QStash reflects every booking/signup event into EspoCRM and Chatwoot, de-duplicates contacts, backfills history, exposes outbox health, and propagates GDPR erasure
- [ ] **Phase 83: CRM/Chatwoot → Site Webhooks** - HMAC-verified inbound webhooks turn new conversations into EspoCRM Contacts/Leads and resolved-conversation summaries into Contact history, structurally barred from booking/customer tables and echo loops
- [ ] **Phase 84: Chatwoot Dashboard App** - Read-only booking history in the Chatwoot conversation sidebar, origin-validated postMessage, no admin cookie, CVE-2025-12245-patched Chatwoot
- [ ] **Phase 85: Statistics** - `/admin/stats` shows inquiry→booking conversion, repeat-customer rate, and B2B revenue per Account

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

## Phase Details

### Phase 76: VPS Infrastructure

**Goal**: A dedicated, monitored, backed-up Hostinger VPS runs Chatwoot and EspoCRM independently of the public site, so the public site, booking wizard, Stripe payment and all emails never depend on VPS uptime.
**Depends on**: Nothing (first phase of v4.0)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. Owner reaches `chat.rideprestigo.com` and `crm.rideprestigo.com` over valid, auto-renewing HTTPS (Hostinger KVM 2 with documented upgrade trigger to KVM 4, Docker Compose, Caddy, EU region).
  2. A restore drill onto a clean host, from the nightly encrypted offsite backup (databases + attachment storage), succeeds and is documented.
  3. Owner receives an alert on a channel independent of the VPS within minutes when Chatwoot or EspoCRM is down, or a nightly backup did not run.
  4. The VPS applies unattended security OS updates; a documented runbook (backup → upgrade → smoke check) governs Chatwoot/EspoCRM version upgrades.
  5. With the VPS fully offline, the public site, booking wizard, Stripe payment and all emails keep working (real outage test + repo guard test). The "no lead or booking event is lost — delivered once the VPS is back" half is verified in Phases 81/82 where the outbox exists.

**Plans**: 9/9 plans complete

Plans:
**Wave 1**
- [x] 76-01-PLAN.md — D-19(b) VPS isolation guard test + versioned secret gate + owner buys KVM 2 VPS

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 76-02-PLAN.md — Host bootstrap and hardening (deploy user, key-only SSH, ufw, fail2ban, unattended-upgrades, swap, Docker)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 76-03-PLAN.md — Owner-approved chat/crm A records + Resend SMTP and B2 EU credentials on the VPS

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 76-04-PLAN.md — Chatwoot + EspoCRM pinned Compose stacks behind Caddy with auto-renewing HTTPS

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 76-05-PLAN.md — Nightly restic backups to B2 EU, upgrade runbook, owner custody of secrets + 2FA

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 76-06-PLAN.md — External monitoring (UptimeRobot + Healthchecks.io, Telegram + email) and on-VPS checks

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 76-07-PLAN.md — Real VPS outage test (site/booking/contact keep working) + alert delivery proof

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 76-08-PLAN.md — Restore-drill canary, integrity verifier, restore tooling + production rehearsal

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 76-09-PLAN.md — Restore drill on a temporary Hetzner host, owner login sign-off, teardown

### Phase 77: Chatwoot Deployment + Core Channels

**Goal**: Chatwoot is live and unifies email, website-widget and Telegram conversations into one inbox, with canned responses and automation replacing the manual `send-*.mjs` ops scripts.
**Depends on**: Phase 76
**Requirements**: INBOX-01, INBOX-02, INBOX-03, INBOX-04, INBOX-05, INBOX-06, OPS-01, OPS-02
**Success Criteria** (what must be TRUE):
  1. Emails to info@/bookings@ arrive as Chatwoot conversations and operator replies are sent from that same address; these mailboxes are connected to Chatwoot only.
  2. Visitor on any of the 7 locales (RTL-correct in Arabic) sees a lightweight chat button that loads no third-party script or cookie until clicked; clicking opens the Chatwoot widget and starts a conversation, with zero CSP violations and no measurable LCP/INP regression on home, route and /book pages.
  3. A signed-in customer's widget conversation is already identified via HMAC validation and attaches to their existing Chatwoot contact.
  4. Messages to the Prestigo Telegram bot arrive as Chatwoot conversations and can be answered from Chatwoot.
  5. Owner sees conversation volume, first-response time and resolution time per channel in Chatwoot reports.
  6. Operator sends every message previously sent by root `send-*.mjs` scripts (time change, vehicle change, payment help, post-trip review, login help) as a Chatwoot canned response/macro, multilingual where relevant; new conversations are auto-assigned and labeled by channel/topic.

**Plans**: 9/13 plans executed

Plans:
**Wave 1**
- [x] 77-01-PLAN.md — Server-side HMAC identity + widget config route (INBOX-03), one isolation-guard allowlist entry
- [x] 77-02-PLAN.md — Customer-facing emails reply to bookings@ (D-11), internal sends unchanged
- [x] 77-03-PLAN.md — Chatwoot config-as-code: 35 canned responses, labels, teams, attributes, inbox + automation JSON, template price guard
- [x] 77-04-PLAN.md — Playwright chat probe (consent, CSP click, overlap) + pre-change CWV baseline
- [x] 77-05-PLAN.md — ChatLauncher copy in 7 locales + pre-launch privacy disclosure (chat, Hostinger, Backblaze, Telegram)
- [x] 77-06-PLAN.md — New Telegram bot with localized profile, connected to Chatwoot (owner steps)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 77-07-PLAN.md — Idempotent Chatwoot sync: templates, labels, teams, automation, Website inbox (owner token)
- [x] 77-08-PLAN.md — Exact-origin widget CSP + scoped guard rule + chat cookies cleared on sign-out
- [x] 77-10-PLAN.md — Brand chat launcher + click-to-load identified widget with visit context (7 locales, RTL)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 77-09-PLAN.md — Read-only inspect tooling (status/activity/reports/identity) + Vercel env hand-off + custody docs

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 77-11-PLAN.md — info@/bookings@ email inboxes, Chatwoot-only, webmail emergency runbook (owner decision + steps)
- [ ] 77-12-PLAN.md — Owner-approved production launch + consent/CSP/CWV gates on production

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 77-13-PLAN.md — Live verification on every channel: automation, canned responses, identity, continuity, native reports

**UI hint**: yes

### Phase 78: WhatsApp Cloud API Channel (Coexistence)

**Goal**: WhatsApp messages to the existing +420 number flow through Chatwoot without breaking the live number, its app access, or its history. Meta Business verification has external lead time and can be started early, in parallel with Phase 76/77 build work, even though the Chatwoot-side channel connection itself depends on Phase 77.
**Depends on**: Phase 77
**Requirements**: WA-01, WA-02, WA-03
**Success Criteria** (what must be TRUE):
  1. WhatsApp messages to +420 725 986 855 arrive in Chatwoot and can be answered from Chatwoot.
  2. The WhatsApp Business app on the phone keeps working with the same number and full message history (Coexistence onboarding, Meta Business verified) — no hard-cutover migration.
  3. Operator can message a customer outside the 24-hour window using pre-approved WhatsApp templates (booking change, payment help, review request, trip reminder).
  4. A documented runbook covers WhatsApp channel recovery, current per-message pricing, and the rule that inboxes are never deleted without a fresh backup.

**Plans**: TBD

### Phase 79: Instagram + Facebook Channels

**Goal**: Instagram and Facebook Page conversations join the same Chatwoot inbox as every other channel. Sequenced after WhatsApp/email/widget are stable to reduce blast radius if Meta App Review stalls or a scope-mixing rejection occurs.
**Depends on**: Phase 78
**Requirements**: SOC-01, SOC-02
**Success Criteria** (what must be TRUE):
  1. Instagram direct messages to the Prestigo account arrive in Chatwoot and can be answered from Chatwoot.
  2. Facebook Page messages arrive in Chatwoot and can be answered from Chatwoot.

**Plans**: TBD

### Phase 80: EspoCRM Deployment + Core Entities

**Goal**: EspoCRM is live with the Account/Contact data model, B2B Opportunity pipeline, read-only booking history and sales mailbox the B2B workflow needs. Independent of the Chatwoot channel work (Phases 77-79) — can run in parallel once Phase 76 infra exists.
**Depends on**: Phase 76
**Requirements**: CRM-01, CRM-02, CRM-03, CRM-04, CRM-05
**Success Criteria** (what must be TRUE):
  1. Owner manages Accounts (hotels, agencies, corporates) and Contacts in EspoCRM, with each Contact linked to its Account.
  2. Owner moves B2B Opportunities through a Kanban pipeline with Prestigo-specific stages and sets follow-up tasks/reminders.
  3. Each Contact/Account shows its full booking history via a read-only Booking entity synced from Supabase (date, route, vehicle, status, amount, link to admin booking).
  4. Sales mail (sales@ or roman@) is connected to EspoCRM only; sent and received emails attach to the matching Account/Contact/Opportunity.
  5. Roles/ACL for 2-3 future operators exist in both Chatwoot (agent/admin, team assignment) and EspoCRM (role-based ACL), documented in a runbook.

**Plans**: TBD

### Phase 81: Lead Capture (Site Forms → Supabase + EspoCRM)

**Goal**: Every lead signal the site currently loses is persisted in Supabase and reaches EspoCRM as a Lead, with zero regression to today's email-only behavior if storage fails. This phase introduces the durable outbox core (`integration_outbox` + QStash dispatcher + thin EspoCRM client + basic email/phone normalization) with leads as its first event type, so no lead is lost while the VPS is down; Phase 82 extends the same outbox.
**Depends on**: Phase 76, Phase 80
**Requirements**: LEAD-01, LEAD-02, LEAD-03, LEAD-04, LEAD-05, LEAD-06
**Success Criteria** (what must be TRUE):
  1. Every contact-form submission is stored in Supabase (`inquiries`) in addition to the existing email, and appears as a Lead in EspoCRM.
  2. Every corporate-form submission is stored and appears as a Lead with its company in EspoCRM.
  3. Every multi-day quote request is stored and appears as a Lead with its itinerary details in EspoCRM.
  4. Abandoned/unpaid checkouts and calculator email captures are also captured as Leads, with consent-appropriate retention.
  5. If inquiry storage fails, the customer's submission still succeeds and the existing email path still fires — no regression of today's behaviour.
  6. Every site booking (paid or not) also appears as a Lead in EspoCRM with source "Website booking", and its status follows the booking (paid → Converted, cancelled/abandoned → Dead).
  7. With the VPS offline, submitted leads queue in the outbox and reach EspoCRM once it is back, exactly once (idempotent retries).

**Plans**: TBD
**UI hint**: yes

### Phase 82: Site ↔ CRM/Chatwoot Sync Foundation

**Goal**: Extending the Phase 81 outbox, every booking and customer event on the site reaches EspoCRM and Chatwoot reliably, contacts stay de-duplicated across all three systems, a one-time backfill closes the historical gap, an admin page exposes outbox health, and a single erasure request reaches every system.
**Depends on**: Phase 77, Phase 80, Phase 81
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, GDPR-01, GDPR-02
**Success Criteria** (what must be TRUE):
  1. Every booking create, payment, status change and admin edit — and every customer account signup — is reflected in EspoCRM (Contact + Booking) and on the Chatwoot contact within minutes, delivered via a durable Supabase outbox + QStash with retries and no duplicates on retry.
  2. Contacts are de-duplicated across site, Chatwoot and EspoCRM by normalized email OR E.164 phone; shared phones (hotel/office desks) are flagged and excluded from auto-merge, and an admin can split a wrong merge.
  3. A one-time backfill imports every past customer and booking from Supabase into EspoCRM and Chatwoot, so no customer who ever booked is missing.
  4. Admin sees outbox health (pending/failed events, last error) on a dedicated admin page and can retry a failed event.
  5. A single erasure request removes/anonymises the person in Supabase, Chatwoot and EspoCRM through the outbox with an audit record, and the privacy policy (all locales) names Chatwoot/EspoCRM processing, the VPS host/region, channels, retention periods and the chat widget.

**Plans**: TBD
**UI hint**: yes
**Security note**: yes — identity resolution, outbox event integrity and GDPR erasure propagation are security/privacy-relevant; commit with `security:` prefix per CLAUDE.md where the work touches identity matching or erasure.

### Phase 83: CRM/Chatwoot → Site Webhooks

**Goal**: Chatwoot and EspoCRM can safely push conversation-derived Contacts/Leads and resolution summaries into the CRM data model, with inbound webhooks verified and structurally barred from ever writing to `bookings`/`customer_profiles`, and no site→CRM→webhook→site echo loop can occur.
**Depends on**: Phase 82
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04
**Success Criteria** (what must be TRUE):
  1. A new Chatwoot conversation from an unknown person creates/updates a Contact and Lead in EspoCRM, tagged with the originating channel as lead source.
  2. When a conversation is resolved, its summary/transcript link is written to the Contact's history in EspoCRM.
  3. Inbound webhooks (Chatwoot, EspoCRM) are verified — HMAC signature over the raw body, timestamp replay window, delivery dedup — and structurally cannot write to `bookings` / `customer_profiles`.
  4. A site → CRM → webhook → site round trip cannot re-trigger itself, proven by origin tagging/fingerprinting on outbound writes.

**Plans**: TBD
**Security note**: yes — inbound webhook verification and echo-loop prevention; commit with `security:` prefix per CLAUDE.md.

### Phase 84: Chatwoot Dashboard App

**Goal**: An operator handling a Chatwoot conversation can see that customer's booking history without leaving Chatwoot or exposing admin credentials. Sequenced last among the integration phases — after Chatwoot/EspoCRM sync is stable and the deployed Chatwoot version is confirmed patched for CVE-2025-12245.
**Depends on**: Phase 77, Phase 83
**Requirements**: PANEL-01, PANEL-02
**Success Criteria** (what must be TRUE):
  1. Inside a Chatwoot conversation, the operator sees the customer's bookings from the site (upcoming + past, status, payment, link into /admin) in the sidebar.
  2. The panel is read-only, only renders when embedded in Prestigo's Chatwoot (frame-ancestors + origin-validated postMessage), never uses the admin session cookie, and runs on a Chatwoot version confirmed patched for CVE-2025-12245.

**Plans**: TBD
**UI hint**: yes
**Security note**: yes — iframe/postMessage origin validation and CVE-2025-12245 exposure; commit with `security:` prefix per CLAUDE.md.

### Phase 85: Statistics

**Goal**: The owner can see, on an admin stats dashboard, how conversations and CRM data turn into revenue.
**Depends on**: Phase 80, Phase 81, Phase 82
**Requirements**: STAT-01, STAT-02, STAT-03
**Success Criteria** (what must be TRUE):
  1. `/admin/stats` shows inquiries → bookings conversion by source/channel for a chosen period.
  2. `/admin/stats` shows repeat-customer rate and a list of top repeat customers.
  3. `/admin/stats` shows B2B revenue and bookings per Account (hotel/agency/corporate).

**Plans**: TBD
**UI hint**: yes

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
| 77. Chatwoot Deployment + Core Channels | v4.0 | 9/13 | In Progress|  |
| 78. WhatsApp Cloud API Channel (Coexistence) | v4.0 | 0/0 | Not started | - |
| 79. Instagram + Facebook Channels | v4.0 | 0/0 | Not started | - |
| 80. EspoCRM Deployment + Core Entities | v4.0 | 0/0 | Not started | - |
| 81. Lead Capture (Site Forms → Supabase + EspoCRM) | v4.0 | 0/0 | Not started | - |
| 82. Site ↔ CRM/Chatwoot Sync Foundation | v4.0 | 0/0 | Not started | - |
| 83. CRM/Chatwoot → Site Webhooks | v4.0 | 0/0 | Not started | - |
| 84. Chatwoot Dashboard App | v4.0 | 0/0 | Not started | - |
| 85. Statistics | v4.0 | 0/0 | Not started | - |

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
