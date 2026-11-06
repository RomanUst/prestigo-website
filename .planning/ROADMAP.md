# Roadmap: Prestigo

## Milestones

- ✅ **v1.0 SEO Blog** — Phases 54-56 (shipped 2026-05-15)
- ✅ **v2.0 Blacklane-style Booking + Customer Accounts** — Phases 57-61 (shipped 2026-06-18)
- ✅ **v2.1 Admin Booking Management & Payment Recovery** — Phases 62-64 (shipped 2026-08-26)
- ✅ **v2.2 Dispatch & Driver Trip Portal** — Phases 65-67 (shipped 2026-09-02)
- ✅ **v3.0 Site Internationalization (i18n)** — Phases 68-75 (shipped 2026-09-27)
- ✅ **v4.0 Helpdesk + CRM** — Phases 76-85 (shipped 2026-11-02; 78/79 parked in backlog)
- 🚧 **v5.0 Payments, Quotes & Day Trips** — Phases 86-93 (in progress)

## Phases

### 🚧 v5.0 Payments, Quotes & Day Trips (In Progress)

**Milestone Goal:** Stop losing Stripe fees on cancellations, offer flexible payment (card hold, cash with card guarantee, quote deposits), speed up dispatch in the admin, and launch bookable day trips as a new product.

**Phase Numbering:** Integer phases continue from v4.0 (last phase 85). Decimal phases (e.g. 88.1) are urgent insertions. Next DB migration is 084.

- [x] **Phase 86: Admin Shell** - Collapsible sidebar and persistent light theme; every admin screen on theme tokens (completed 2026-11-03)
- [x] **Phase 87: Status Service & Driver Step Flow** - One trusted status writer; driver moves a trip one strict step at a time and admin sees it immediately (completed 2026-11-03)
- [x] **Phase 88: Card on File & Scheduled Holds** - Save-card booking, automatic hold, capture on completion with fallback, failure recovery, admin payment panel, owner-controlled rollout
- [ ] **Phase 89: Cancellation Policy, Cash Guarantee & No-Show** - Policy-driven free cancellation, cash with card guarantee, operator-confirmed no-show charge, owner-accepted wording, public go-live
- [ ] **Phase 90: Dispatch Views** - Kanban by status and day/week/month calendar in Prague time with auto-refresh
- [ ] **Phase 91: Multi-Stop Transfers, Airport Pickup & Waiting Fees** - Stops priced server-side, per-stop waiting, airport pickup after landing, extra charge to the saved card
- [ ] **Phase 92: Quotes** - Multi-trip quotes with secret link, deposit, remainder method, versions and PDF
- [ ] **Phase 93: Day Trips & Custom Tours** - Bookable day-trip catalogue in 7 locales and custom-tour request answered with a quote
- [ ] **Phase 94: Driver Cabinet** - Driver login, ride list (upcoming/past), offers instead of email links, profile; ride detail = Phase 87 trip screen

**Milestone-wide guardrails (apply to every phase):**
- **Hold lead time is configurable, default 72 h — never "~5 days".** A hold placed with the customer absent is merchant-initiated and Visa expires it after 4 d 18 h; the saved card plus mandate is the real guarantee, the hold is a convenience (research/SUMMARY.md).
- **Partner (GNet) bookings skip every money path** — no hold, capture, no-show or extra charge.
- **All scheduling math uses pickup instants and Prague time**, tested across the DST changes of 2027-03-28 and 2027-10-31.
- **Payments reach the public only at the Phase 89 go-live, on the owner's decision (no counsel review, risk accepted 2026-11-06, D-16)**; until then the PAYF-05 feature flag admits only the owner's canary booking.
- **Security-relevant phases (commit with `security:` prefix per CLAUDE.md):** 87 (driver link now changes status), 88 and 89 (card mandate, off-session charges, webhook), 91 (server-side price recompute, extra charges), 92 (quote tokens, deposit).
- **New strings need real translations in all 7 locales; no typed prices in marketing or tour content** (live from the admin only).
- **Parallel owner work during 86-87:** Stripe test-mode path (owner-run scripts) and counsel review of the mandate / cancellation / no-show wording.

**Execution order:** 86 → 87 → 88 → 89 → 90 → 91 → 92 → 93. Phases 86 and 87 are independent and may overlap. Phase 91 may swap with 90 only if the booking detail panel is extracted first.

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

## Phase Details

Detail sections for the active milestone v5.0 (Phases 86-93). Parser note: the `### Phase N:` headers below are read by downstream tools.

### Phase 86: Admin Shell

**Goal**: The operator works in an admin that adapts to screen and lighting — a collapsible sidebar and a light theme — and every later v5.0 admin screen is built on theme tokens instead of hard-coded colours.
**Depends on**: Nothing (first phase of v5.0)
**Requirements**: ADM-01, ADM-02, ADM-03
**Success Criteria** (what must be TRUE):
  1. Operator can collapse and expand the admin sidebar, and the choice is still applied after a reload and on the next visit.
  2. Operator can switch the admin between dark and light theme; the choice persists, the very first paint already uses it (no dark-to-light flash), and public pages in every locale look exactly as before whichever theme the admin uses.
  3. Every admin screen (bookings, drivers, stats, outbox, settings, login, plus modals and side panels) is readable in both themes — no unreadable text, invisible borders or leftover dark-only panels.
  4. Adding a new hard-coded colour value to admin code fails the test suite, so later phases cannot reintroduce theme debt.

**Plans**: 13/13 plans complete
Plans:
**Wave 1**
- [x] 86-01-PLAN.md — Wave 1: cookie-driven theme wrapper (tracer), full token sheet for both themes, colour guard with per-plan pending ledger, capital-label scanner

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 86-02-PLAN.md — Wave 2: collapsible sidebar rail, theme toggle, Ctrl/Cmd+\ shortcut, themed login
- [x] 86-03-PLAN.md — Wave 2: StatusBadge, Modal, field styles, KPI card, health banner, stats charts, zones map on tokens
- [x] 86-04-PLAN.md — Wave 2: BookingsTable on tokens + sentence-case labels
- [x] 86-05-PLAN.md — Wave 2: booking detail panels, manual booking and wizard on tokens
- [x] 86-06-PLAN.md — Wave 2: promo codes and drivers screens on tokens + sentence-case labels
- [x] 86-07-PLAN.md — Wave 2: erasure, accounts, outbox, pricing and settings screens on tokens
- [x] 86-11-PLAN.md — Wave 2: shared public booking steps get admin-themable var(--status-*, original) fallbacks (OQ1)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 86-08-PLAN.md — Wave 3: light-theme structural CSS (safety net, headings, flat tables, sticky modal actions) + colour guard closeout
- [x] 86-09-PLAN.md — Wave 3: sentence-case labels in outbox and booking-creation/dispatch screens
- [x] 86-10-PLAN.md — Wave 3: sentence-case labels in identities, erasure, accounts, pricing and settings screens
- [x] 86-12-PLAN.md — Wave 3: sentence-case labels in stats tabs, stats charts and the bookings KPI row

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 86-13-PLAN.md — Wave 4: first-paint and public-leakage proof, full quality gate, phase-wide caps scan, owner production UAT

**UI hint**: yes
**Planning notes**:
  - Standard patterns, no research needed. Theme and sidebar state live in cookies (`admin_theme`, `admin_sidebar`) on top of the existing `.theme-light` CSS variables; no `next-themes` (CSP nonce conflict).
  - About 234 hex literals are converted to tokens first, mechanically, so the payment/dispatch phases do not collide with it or add new hex debt.
  - Admin session model and admin auth stay untouched.

### Phase 87: Status Service & Driver Step Flow

**Goal**: Every booking status change goes through one trusted service, and the driver moves a trip forward one strict step at a time from the trip link while the admin sees each step immediately.
**Depends on**: Phase 86 (soft: new admin status UI uses theme tokens)
**Requirements**: PAYF-02, DRV-01, DRV-02, DRV-03, DRV-04, DRV-05
**Success Criteria** (what must be TRUE):
  1. On the trip link the driver sees a single "next step" button, and steps go strictly en route → on site → passenger on board → completed.
  2. Each driver step changes the booking status in admin immediately (a reload shows it, including the new "on board" status); a skipped step is rejected by the server and a repeated tap is harmless (nothing is applied or logged twice).
  3. Admin edits, cancellation and driver steps all go through one status service with compare-and-set: if the admin cancels while the driver taps at the same moment, exactly one action applies and the other is rejected with a clear message; every change is logged with who made it, and existing admin transitions behave exactly as before.
  4. For a GNet booking each driver step is pushed to GNet exactly once (no duplicates on retap or retry) and the booking is marked as a partner booking so no hold, capture or no-show charge can ever apply to it.
  5. The "completed" step asks the driver to confirm, fires exactly one completion event that the payment engine consumes in Phase 88 (capture itself is verified there under HOLD-04), and the driver never sees or enters an amount.

**Plans**: 20/20 plans complete (6 gap-closure plans added 2026-11-03 from 87-UAT)
Plans:
**Wave 1**
- [x] 87-01-PLAN.md — Wave 1: behaviour-preserving extraction of advanceBookingStatus() + single GNet push helper; cancel route characterized; PATCH/cancel/assign routed through the service (tracer)
- [x] 87-02-PLAN.md — Wave 1: lib/booking-status.ts vocabulary, transitions, trip-token view state; migration 084 (on_board/no_show, booking_status_log + trigger, CAS RPC, no-show RPC + settings, redefined lead/gcal/panel/stats); [BLOCKING] live apply + smoke

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 87-03-PLAN.md — Wave 2: compare-and-set via advance_booking_status, 409 status_conflict, cancel/assign lost-race responses, single completion event (partner-aware), direct status-writer gate
- [x] 87-04-PLAN.md — Wave 2: CRM/lead/Chatwoot/panel/calendar status fan-out, pickupInstantMs to prague-date, SQL-vs-TS parity on latest definitions
- [x] 87-06-PLAN.md — Wave 2: no-show operator alert as a Chatwoot private note via the outbox dispatcher

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 87-07-PLAN.md — Wave 3: idempotent GNet push (conditional claim), D-22 null mapping and no farm-in echo pinned
- [x] 87-08-PLAN.md — Wave 3: driver route rebuilt on the status service (strict next step, replay 200, 409), start gate, DTRIP-04 gates rewritten
- [x] 87-05-PLAN.md — Wave 3: admin On Board / No-Show labels and hues, no_show terminal, expected_status + inline conflict message (depends on 87-03's 409 contract)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 87-09-PLAN.md — Wave 4: driver no-show request (server threshold, email + outbox alert), admin confirm/dismiss route, settings thresholds, shared airport helper
- [x] 87-10-PLAN.md — Wave 4: light driver trip screen — one-step control (keyboard path), confirm dialog, completed/ended/help views

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 87-11-PLAN.md — Wave 5: driver map + distance, passenger card, navigation, details + note, no-show block, refresh timers
- [x] 87-12-PLAN.md — Wave 5: admin no-show banner/chip/confirm modal and no-show waiting-time settings
- [x] 87-14-PLAN.md — Wave 5: slide-to-advance gesture contract (drag past 85%, hold, tap hint, assistive activation, offline lock, reduced motion), split from 87-10

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 87-13-PLAN.md — Wave 6: full quality gate, [BLOCKING] EspoCRM fields sync before merge, owner production UAT on a real phone

**Gap closure (87-UAT gaps 1-3, 2026-11-03)**
**Wave 1**
- [x] 87-15-PLAN.md — Gap 1: driver gets an email with the order details and the trip-step link after Accept
- [x] 87-16-PLAN.md — Gap 2: Google Maps / Waze chooser on the pickup and drop-off Navigate buttons
- [x] 87-17-PLAN.md — Gap 3 prerequisite: driver help contract; the CRM bridge never turns driver chats into Leads

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 87-18-PLAN.md — Gap 3: token-gated driver help chat identity endpoint + Chatwoot conversation attributes
- [x] 87-19-PLAN.md — Gap 3: Help opens an identified Chatwoot chat on the tokenless /driver/trip/help page (path-scoped CSP), call kept as fallback

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 87-20-PLAN.md — Gate, owner decision on the Chatwoot inbox for driver chats, Chatwoot setup, merge, real-phone re-check

**UI hint**: yes
**Security-relevant**: yes — commit with `security:` prefix. The permanent driver link now changes `booking.status` and later moves money; the token-gated write route stays CSRF-protected and rate-limited, and the v2.2 DTRIP-04 isolation grep-gates are rewritten for the new rule rather than deleted.
**Owner decisions before planning**: (1) `on_board` is a real `bookings.status` (recommended) vs progress-only mapped to `on_location`; (2) `no_show` is terminal and how it maps in leads (`converted` vs `dead`), stats (count revenue only when charged) and Chatwoot; (3) which statuses are pushed to GNet for `on_board` / `no_show`. **Decided 2026-11-02:** driver steps are auto-pushed to GNet (deduped); GNet bookings skip every money path — only the exact GNet status mapping stays open.
**Research before planning**: GNet semantics for `on_board` and `no_show` (LOW confidence).
**Planning notes**: Behaviour-preserving extraction of `advanceBookingStatus()` from `app/api/admin/bookings/route.ts` comes first, with parity tests; adds `on_board` / `no_show` statuses and a `booking_status_log` table (expected migration 084).

### Phase 88: Card on File & Scheduled Holds

**Goal**: A client can book by saving a card with nothing charged, and the full amount is then held, captured or recovered automatically — with every money event visible to the operator and the whole flow behind an owner-controlled flag.
**Depends on**: Phase 87 (one status writer and the trip-completion event that triggers capture)
**Requirements**: PAYF-01, PAYF-03, PAYF-04, PAYF-05, HOLD-01, HOLD-02, HOLD-03, HOLD-04, HOLD-05, HOLD-07, MAIL-01
**Success Criteria** (what must be TRUE):
  1. A client can book a transfer by saving a card — 3DS completed at checkout, nothing charged — after ticking an unticked consent checkbox (all 7 locales); exactly one booking is created, and the consent text version, locale, time and IP are stored with it.
  2. The full-amount hold is placed automatically a configurable time before pickup (default 72 h, set in admin) and, for a booking made inside that window, at checkout while the client is present; timing is computed from the pickup instant so it is correct across daylight-saving changes (2027-03-28, 2027-10-31) and moves when the operator edits the pickup time; a missed scheduler run is caught up on the next one; partner (GNet) bookings are never held.
  3. When the driver completes the trip the held amount is captured; if the hold has expired or no longer exists the saved card is charged instead, never twice; and if any hold or charge fails the client automatically gets a payment link and the operator gets an alert that does not depend on the VPS.
  4. The operator sees each card booking's payment state, hold expiry and an append-only ledger of every money event in admin, can capture, release, retry or send a payment link, and the client's payment emails (card saved, hold placed, charged, payment failed with link) arrive in the booking language in all 7 locales.
  5. Rollout is safe: the Stripe webhook routes each event by purpose with no duplicate bookings or false alerts and a partial refund never cancels a completed trip; the owner can run a script that subscribes the live webhook to the new events; a working test-mode path exists; and the owner's own canary booking passes end to end behind an admin feature flag before anyone else can use the flow.

**Plans**: 17/17 plans executed
Plans:
**Wave 1**
- [x] 88-01-PLAN.md — Payment data model: migration 085 (payment_mode / payment_state, append-only ledger, consent record, card-flow settings, CAS + claim RPCs), lib/payments/state.ts single writer, [BLOCKING] owner schema confirmation + live apply (tracer)
- [x] 88-02-PLAN.md — Behaviour-preserving extraction of the checkout price / validation path into lib/checkout/compute.ts
- [x] 88-03-PLAN.md — Language-aware payment email renderer (4 templates), checkout card-on-file copy and consent text builder (EN)
- [x] 88-04-PLAN.md — Owner scripts: webhook-events subscription, QStash payment-tick schedule, Stripe test-mode smoke, owner runbook

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 88-05-PLAN.md — Real translations (ru, es, fr, ar, hi, zh) of the card-flow checkout and payment email copy + 7-locale parity
- [x] 88-06-PLAN.md — Owner canary flag + eligibility endpoint (/api/card-checkout/init), DST-safe hold timing, CSRF / rate limits, CardFlowSettings
- [x] 88-07-PLAN.md — Admin payment panel (badge, facts, actions, append-only history), list badge, card cancel variant, refund-failed and trip-edit feedback

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 88-08-PLAN.md — Card checkout intent (setup mode): one unpaid card booking, per-booking Stripe Customer, consent record, SetupIntent; fake Stripe helper

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 88-09-PLAN.md — Webhook routing by purpose; setup-succeeded and hold-at-checkout confirmation once; localized card_saved email
- [x] 88-10-PLAN.md — Checkout step: init gate + save-card step with exact hold date, unticked consent, confirmSetup

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 88-11-PLAN.md — Payment tick (QStash 15 min + Vercel daily backstop), scheduled off-session hold, reconcile, release primitives, hold webhook events
- [x] 88-12-PLAN.md — Hold at checkout inside the hold window (manual-capture PaymentIntent, held-now UI variant)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 88-13-PLAN.md — Capture on completion with fallback and difference charges, never twice; completion sweep; charged email

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 88-14-PLAN.md — Failure recovery: payment link, payment_failed email, Resend operator alert, one auto-retry, 24 h alerts, link paid -> captured

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 88-15-PLAN.md — Admin payment API (ledger view; capture / retry / release / waive / send link)
- [x] 88-16-PLAN.md — Cancel CAS-first (WR-01, D-20) + card hold release on cancel + trip-edit hook for price / pickup changes

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 88-17-PLAN.md — End-to-end lifecycle test + gates + verify pre-pr; [BLOCKING] merge, owner scripts, Dashboard checks; [BLOCKING] owner canary A / B / C

**UI hint**: yes
**Security-relevant**: yes — commit with `security:` prefix (card mandate, off-session charges, webhook routing, scheduler endpoint auth, capture trigger).
**Decided 2026-11-02:** configurable 72 h hold lead (never 120 h). **Owner checkpoints**: confirm the ~6-day cutoff for an on-session hold at checkout, and that multi-day quotes never use one long hold; run the webhook-subscription script; create/verify the QStash schedule (free-plan quota unverified, daily Vercel cron stays the backstop); run the canary booking; confirm Stripe pricing plan and MCC in the Dashboard.
**Research before planning**: `confirmSetup` inside the existing PaymentElement; Stripe Customer handling for guest checkouts; decline and 3DS recovery with SCA test cards; blended vs IC+ pricing and MCC; QStash schedule quota; legal wording draft.
**Planning notes**:
  - MAIL-01 is owned here (card-lifecycle templates and the language-aware payment-email mechanism); the no-show email lands in Phase 89 and the quote emails in Phase 92 through the same mechanism.
  - The feature flag stays closed to all clients until Phase 89 completes. Until then, cancelling a canary card booking uses the operator's release action; the automatic policy-driven cancel path is Phase 89.
  - Expected migration 085 (`payment_state`, `payment_mode`, hold fields, ledger, consent record, settings). Only `lib/payments/state.ts` writes `payment_state`; `payment_intent_id` is set only at capture.

### Phase 89: Cancellation Policy, Cash Guarantee & No-Show

**Goal**: Clients get clear, fair terms — cancelling in time costs nothing, cash bookings are guaranteed by a saved card, a no-show is charged only after the operator confirms — and card payments are opened to all clients once the owner has accepted the wording (no counsel review, D-16).
**Depends on**: Phase 88
**Requirements**: HOLD-06, CANC-01, CANC-02, CASH-01, CASH-02, CASH-03, CASH-04
**Success Criteria** (what must be TRUE):
  1. Cancelling a card booking in time releases an uncaptured hold (no Stripe fee) or refunds a captured payment, and a late cancellation costs 100%, according to the policy: free up to 1 h before pickup for trips up to 100 km and up to 12 h before for longer trips, with the km, hours and percent thresholds editable in admin.
  2. The cancellation policy and the card-saving consent are shown at checkout, in the confirmation email and in the terms, in all 7 locales, and the owner's decision of 2026-11-06 to launch without counsel review (D-16) is recorded before card payments are enabled for all clients.
  3. A client can choose "pay cash to driver"; the card is saved as a guarantee and no hold is ever placed on it.
  4. The driver can mark a no-show only after the free waiting time has passed (enforced by the server); the operator then confirms and charges any amount up to 100% to the saved card with one action, with the evidence (driver timestamps, contact-attempt note) stored; nothing is ever charged automatically on the driver's tap.
  5. The operator can mark a cash booking as settled in cash, a settled or cancelled booking can no longer be charged, and GNet bookings are never offered the cash guarantee or a no-show charge.

**Plans**: 21/28 plans executed (the wave in each PLAN.md sets the order; numbers 24-28 are later splits and run before 89-22 and 89-23)
Plans:
**Wave 1**
- [x] 89-01-PLAN.md — Migration 087, payment vocabulary, D-16 document amendments
- [x] 89-02-PLAN.md — Private link guard: analytics, chat, headers, CSRF, rate limits
- [x] 89-03-PLAN.md — Policy engine and admin policy settings

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 89-04-PLAN.md — Manage token, policy box and manage button in 7 locales
- [x] 89-05-PLAN.md — Migration 088 and Stripe Customer erasure
- [x] 89-07-PLAN.md — Stored terms per booking and the public-policy gate

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 89-25-PLAN.md — Client email kinds in 7 locales and operator alert kinds

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 89-06-PLAN.md — Fee engine in the single collector
- [x] 89-10-PLAN.md — Cash checkout server and final consent wording

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 89-08-PLAN.md — Cancellation orchestrator, money matrix and admin cancel route
- [x] 89-09-PLAN.md — No-show gate and evidence (WR-02, WR-04)
- [x] 89-11-PLAN.md — Checkout UI: choice, cash explainer, policy note
- [x] 89-13-PLAN.md — Fee reminder and interrupted charge recovery in the tick
- [x] 89-26-PLAN.md — Fee webhook routing, recovery closes the case, disputes on cash

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 89-12-PLAN.md — Operator fee and cash decisions on the server
- [x] 89-15-PLAN.md — Manage page read side and My trips link
- [x] 89-27-PLAN.md — Notices after a cancel: client, driver, operator

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 89-14-PLAN.md — Driver cash step
- [x] 89-16-PLAN.md — Admin cancel dialog and fee badge
- [x] 89-17-PLAN.md — Admin fee and cash panels
- [x] 89-28-PLAN.md — Manage page actions: cancel and change request

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 89-18-PLAN.md — Policy in the legacy emails and localized confirmation page

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 89-19-PLAN.md — Lifecycle tests, full gate, dark production merge

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 89-20-PLAN.md — Terms and FAQ wording in 7 locales (unmerged until go-live)
- [ ] 89-21-PLAN.md — Public pages and llms wording in 7 locales (unmerged until go-live)
- [ ] 89-24-PLAN.md — Blog line, settings value and All clients tile (unmerged until go-live)

**Wave 11** *(blocked on Wave 10 completion)*
- [ ] 89-22-PLAN.md — Go-live checklist and owner live tests

**Wave 12** *(blocked on Wave 11 completion)*
- [ ] 89-23-PLAN.md — Go-live decision, wording merge, flag flip, owner live test

**Cross-cutting constraints:**
- No text in this plan reaches main before plan 89-23

**UI hint**: yes
**Security-relevant**: yes — commit with `security:` prefix (operator-initiated off-session charges, policy-driven refunds and releases, consent records).
**Legal checkpoint**: replaced by the owner's decision of 2026-11-06 (no counsel review, risk accepted by the owner), see D-16 in 89-CONTEXT.md.
**Owner decisions before planning**: no-show wait thresholds (benchmark: 30 min in the city, 60 min at the airport, counted from the pickup time) . **Decided 2026-11-02:** no-show is operator-charged, never automatic; cancellation policy = free until 1 h before pickup for trips ≤100 km, until 12 h before for trips >100 km, otherwise 100% (thresholds admin-configurable, wording reviewed by counsel). The wait thresholds are admin settings reused by Phase 91.
**Owner decisions 2026-11-06 (see 89-CONTEXT.md)**: no counsel review, the owner accepts the risk and this replaces the legal checkpoint and the sign-off in criterion 2; client self-cancel from a manage-booking page linked in the confirmation email is added to this phase (changes go to the operator as a request); go-live to everyone at once.
**Planning notes**: Public go-live (owner flips the flag) happens at the end of this phase, after the owner's own test. Next migration is 087.

### Phase 90: Dispatch Views

**Goal**: The operator sees and moves the day's bookings visually — a kanban board by status and a calendar in Prague time — and watches driver progress appear without reloading.
**Depends on**: Phase 87 (final status set and status service), Phases 88-89 (payment badges and money-effect confirmations), Phase 86 (theme tokens)
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, DISP-05
**Success Criteria** (what must be TRUE):
  1. The operator sees bookings as a kanban board by status for a chosen date range, and clicking any card (or calendar entry) opens the same booking detail panel as the list.
  2. The operator can move a card to another status by drag-and-drop or the card menu; only allowed transitions are accepted, a move with a money effect (for example completing → capture, cancelling → release or fee) asks for confirmation that states the effect, and a stale move is rejected with the card returning to its column.
  3. The operator sees bookings in a calendar with day, week and month views in Prague time, coloured by status; a booking around midnight lands on the correct Prague day regardless of the browser's timezone, including the DST-change weeks.
  4. When a driver taps a step, the board and calendar update on their own without a reload.

**Plans**: TBD
**UI hint**: yes
**Planning notes**:
  - Standard patterns, no research needed. Extract `BookingDetailPanel` from the 2,886-line `BookingsTable` first so the list, kanban and calendar share one panel (Phase 91's extra-charge action also lives there).
  - Kanban offers only `UI_TRANSITIONS` and routes every move through the Phase 87 status service. Menus are the baseline; drag-and-drop is optional. Auto-refresh is polling with `router.refresh()` (Supabase Realtime is DISP-F2, deferred).

### Phase 91: Multi-Stop Transfers, Airport Pickup & Waiting Fees

**Goal**: Clients book transfers with intermediate stops and waiting time at a server-computed price, airport pickups are timed after landing, and the operator can bill waiting beyond what was booked.
**Depends on**: Phase 89 (saved-card off-session charging), Phase 90 (booking detail panel for the operator charge action)
**Requirements**: STOP-01, STOP-02, STOP-03, STOP-04, STOP-05, EXTRA-01
**Success Criteria** (what must be TRUE):
  1. A client can add intermediate stops when booking a transfer; the price is calculated by distance through all stops and recomputed on the server, so a distance or price tampered with in the browser is ignored.
  2. The client chooses a waiting time for each stop; the first 15 minutes are free, each further 15 minutes costs the fee set in admin, and the price summary shows it.
  3. For an airport pickup the client sets a pickup time after landing (landing 14:00, pickup 14:30); the 60 minutes of free waiting count from the pickup time, and both times are stored and shown to the driver (Prague time, DST-safe).
  4. Stops, waiting times and the landing/pickup times are saved with the booking and visible in admin, on the driver trip page and in the confirmation email.
  5. The operator can charge waiting beyond the chosen wait (or other extras) to the saved card as a separate charge, with the amount computed from admin-configured rates and recorded in the payment ledger; it is never offered for GNet bookings.

**Plans**: TBD
**UI hint**: yes
**Security-relevant**: yes — commit with `security:` prefix. Closes the current gap where `distanceKm` is trusted from the client, and adds an operator-initiated off-session charge.
**Research before planning**: Google Routes `computeRoutes` behaviour with many intermediates (cap the stop count, keep the Essentials SKU), airport detection, and the waiting-fee policy.
**Planning notes**: Expected migration 087 (`booking_stops`, waiting rates in pricing globals, separate `landing_at` and `pickup_at`). Free-wait thresholds reuse the Phase 89 admin settings. Extra charges are operator-approved, never automatic.

### Phase 92: Quotes

**Goal**: The operator builds a multi-trip quote, the client opens it by a secret link, accepts it and pays a deposit, and the accepted quote becomes linked bookings collected the way the operator chose.
**Depends on**: Phase 88 and Phase 89 (payment engine, saved card, payment modes), Phase 91 (stop and waiting semantics for quote lines)
**Requirements**: QUOTE-01, QUOTE-02, QUOTE-03, QUOTE-04, QUOTE-05, QUOTE-06, QUOTE-07
**Success Criteria** (what must be TRUE):
  1. The operator can build a quote of several trips or days (each line with route, date, time, vehicle and price) in admin and sees its lifecycle — draft, sent, viewed, accepted, paid, expired; editing a sent quote creates a new version and voids the old links.
  2. The client opens the quote by a secret link (unguessable, expiring, not indexed) and sees an itemised summary; a voided or expired link shows a clear message and no price data.
  3. The operator sets the deposit as a percent or a fixed amount; the client accepts the quote (acceptance logged with time, IP and quote version) and pays the deposit on the quote page, which also saves the card.
  4. When the deposit is paid each line becomes a booking linked to the quote, and the remainder is collected by the method the operator chose for that quote: saved card (hold/capture per trip), payment link, cash to the driver, or invoice.
  5. The client can download the quote as a PDF, and the quote email includes it in the client's language.

**Plans**: TBD
**UI hint**: yes
**Security-relevant**: yes — commit with `security:` prefix. Quote tokens are hashed 256-bit secrets with immutable versions, a side-effect-free GET, and no-referrer / no-store / noindex headers; the deposit is a client-facing payment.
**Owner decisions before planning**: confirm multi-day quotes use per-day holds or a deposit plus remainder, never one long hold.
**Research before planning**: the invoice remainder method (minimal: a record plus an email), VAT documents for deposits (counsel), Payment Link vs Checkout Session restriction parameters, and the quote-PDF approach (no PDF library in the repo; decide render path without breaking the zero-new-runtime-dependency stance).
**Planning notes**: Quote bookings carry `payment_mode='quote'`, so the hold engine ignores them until the operator's remainder method applies. Expected migration 088.

### Phase 93: Day Trips & Custom Tours

**Goal**: Visitors browse and book day trips from a catalogue in all 7 locales, and anyone who finds nothing suitable can request a custom tour that the operator answers with a quote.
**Depends on**: Phase 88 and Phase 89 (payment modes), Phase 92 (custom-tour answer is a quote)
**Requirements**: TRIP-01, TRIP-02, TRIP-03, TRIP-04, TRIP-05, TRIP-06, TRIP-07
**Success Criteria** (what must be TRUE):
  1. A visitor can browse a day-trip catalogue (5-6 tours at launch, e.g. Karlovy Vary, Český Krumlov, Kutná Hora, Dresden, Karlštejn, Bohemian Switzerland) in all 7 locales; a locale is published only when it is complete, with no English leaking into it.
  2. Each tour page shows gallery, duration, itinerary, includes/excludes, pickup, FAQ and cancellation terms with structured data, and every price on it is live from the admin — no typed prices.
  3. The operator can add, edit, publish and unpublish tours and set the per-car price by class (E / S / V) in admin, and the change appears on the site without a redeploy.
  4. A client can book a tour online with date, time, vehicle and passengers, using the same payment modes as transfers (card on file with hold, cash with card guarantee).
  5. A visitor who finds nothing suitable can send a custom-tour request (destinations, date, people, wishes) that becomes a lead in Supabase, EspoCRM and Chatwoot without depending on the VPS, and the operator can answer it with a quote from admin.

**Plans**: TBD
**UI hint**: yes
**Research before planning**: JSON-LD type (TouristTrip vs Product/Offer), package-travel classification of day trips (counsel), GSC keyword map so tour pages do not cannibalise `/routes/*`.
**Planning notes**:
  - Largest 7-locale batch of the milestone; AI credits are empty, so translate in-session. Marketing content rules apply: no typed prices (ISR-revalidated live fares, no stale JSON-LD prices), no Uber/ride-hailing comparisons, no fake scarcity or fabricated reviews.
  - The catalogue and online booking (TRIP-01..05) can ship before the custom-tour loop (TRIP-06/07). Expected migrations 089-090; check every place the `trip_type` enum is used.

### Phase 94: Driver Cabinet

**Goal**: A driver signs in to a personal cabinet that lists all of their rides and new ride offers, instead of receiving one separate link per assignment.
**Depends on**: Phase 87 (light-theme trip screen and status service); scheduled after Phase 93 by owner decision 2026-11-03
**Requirements**: TBD (to be defined at discuss/plan time)
**Scope (owner, 2026-11-03)**:
  - Driver login/accounts.
  - Ride list with Upcoming / Past tabs, grouped by day (time, pickup → dropoff, passenger first name, vehicle plate or "Pending", class).
  - Offers tab that replaces the accept/decline links sent by email (`/driver/response`).
  - "You" profile: rating, documents, help, sign out.
  - Ride detail reuses the Phase 87 trip screen (map, bottom sheet, slide-to-advance step control).

**Owner reference**: Blacklane driver app screenshots shared 2026-11-03 (layout only — Prestigo branding, light theme, no copied names or assets).
**Plans**: TBD
**UI hint**: yes
**Security-relevant**: yes — new driver authentication and per-driver data access (commit with `security:` prefix).

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

**Execution Order (v5.0):** 86 → 87 → 88 → 89 → 90 → 91 → 92 → 93

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
| 86. Admin Shell | v5.0 | 13/13 | In Progress|  |
| 87. Status Service & Driver Step Flow | v5.0 | 20/20 | In Progress|  |
| 88. Card on File & Scheduled Holds | v5.0 | 17/17 | Complete | 2026-11-06 |
| 89. Cancellation Policy, Cash Guarantee & No-Show | v5.0 | 21/28 | In Progress|  |
| 90. Dispatch Views | v5.0 | 0/0 | Not started | - |
| 91. Multi-Stop Transfers, Airport Pickup & Waiting Fees | v5.0 | 0/0 | Not started | - |
| 92. Quotes | v5.0 | 0/0 | Not started | - |
| 93. Day Trips & Custom Tours | v5.0 | 0/0 | Not started | - |

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
