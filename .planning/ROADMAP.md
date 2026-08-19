# Roadmap: Prestigo

## Milestones

- ✅ **v1.0 SEO Blog** — Phases 54-56 (shipped 2026-05-15)
- ✅ **v2.0 Blacklane-style Booking + Customer Accounts** — Phases 57-61 (shipped 2026-06-18)
- 🚧 **v2.1 Admin Booking Management & Payment Recovery** — Phases 62-64 (in progress)

## Phases

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

### 🚧 v2.1 Admin Booking Management & Payment Recovery (Phases 62-64, in progress)

**Milestone Goal:** Give the operator full control of the booking lifecycle inside the admin panel — edit bookings with automatic client notification, capture abandoned/unpaid bookings for follow-up, and create bookings with an attachable payment link and client email.

- [ ] **Phase 62: Abandoned & Unpaid Booking Capture** - Checkout attempts are persisted before payment completes, surfaced as a followable "unconfirmed/unpaid" queue in admin, and reconciled without duplicates when payment succeeds.
- [ ] **Phase 63: Admin Booking Editing + Change Notification** - Operator can edit any booking's schedule, vehicle, route, and passenger details, review price changes, and optionally notify the client of the change by branded email.
- [ ] **Phase 64: Admin-Created Bookings with Payment Link** - Operator can originate a booking from admin, optionally attach and email a Stripe payment link, and have payment reconcile automatically — or save without payment for cash/invoice.

## Phase Details

### Phase 62: Abandoned & Unpaid Booking Capture
**Goal**: Every checkout attempt is captured for revenue recovery — a booking exists the moment a client reaches the payment step, is clearly flagged and followable in admin while unpaid, and reconciles cleanly to a single "confirmed/paid" record if the client does pay.
**Depends on**: Nothing (first phase of v2.1; continues from Phase 61)
**Requirements**: ABND-01, ABND-02, ABND-03, ABND-04, ABND-05, ABND-06
**Success Criteria** (what must be TRUE):
  1. When a client reaches the payment step in checkout — even if they close the tab before paying — a booking row already exists with their trip details and contact info (name, email, phone), for both one-way and round-trip attempts.
  2. That booking carries an "unconfirmed / unpaid" status and is visually distinguished from confirmed bookings in the admin bookings list.
  3. Operator can filter the admin bookings list to show only unconfirmed/unpaid bookings, to work a follow-up queue.
  4. If the client completes payment later (same checkout attempt), the existing booking updates in place to "confirmed/paid" — the admin list never shows two rows for one attempt.
**Plans**: TBD
**UI hint**: yes

### Phase 63: Admin Booking Editing + Change Notification
**Goal**: Operator can correct or update any booking directly from the admin panel — schedule, vehicle, route, or passenger details — with price changes reviewed before saving and the client optionally notified of exactly what changed.
**Depends on**: Phase 62 (shares the admin bookings list/detail surface and status vocabulary introduced there; edit UI must work across booking statuses, including the new unconfirmed/unpaid state)
**Requirements**: AEDIT-01, AEDIT-02, AEDIT-03, AEDIT-04, AEDIT-05, AEDIT-06, AEDIT-07
**Success Criteria** (what must be TRUE):
  1. From a booking's admin detail view, operator can edit pickup date/time, vehicle class, route (origin/destination), and passenger/contact details including flight number, then save the change.
  2. When an edit changes the price (vehicle or route change), operator sees the recalculated amount and can adjust it before confirming the save — price is never silently changed.
  3. At save time, a "notify client" toggle lets the operator choose whether the client receives a branded email showing old → new values of what changed; leaving it off saves without emailing.
  4. Editing one leg of a round-trip booking updates only that leg's record — the linked leg keeps its original date, route, and vehicle.
**Plans**: TBD
**UI hint**: yes

### Phase 64: Admin-Created Bookings with Payment Link
**Goal**: Operator can originate a booking on behalf of a client from the admin panel — with or without collecting payment at that moment — and get paid without the client ever visiting the public booking flow.
**Depends on**: Phase 62 (payment-link reconciliation reuses the "update existing booking to paid, no duplicate" webhook pattern built for abandoned-booking recovery)
**Requirements**: ANEW-01, ANEW-02, ANEW-03, ANEW-04, ANEW-05
**Success Criteria** (what must be TRUE):
  1. Operator can create a new booking from the admin panel by entering trip, vehicle, and client details, with the price calculated automatically from current rates.
  2. On saving, operator can choose to generate a Stripe payment link for that booking and email it to the client in the same action.
  3. When the client pays through that link, the booking's status updates to paid automatically, reconciled against the same booking record — no duplicate is created.
  4. Operator can instead save an admin-created booking with no payment link at all (e.g. cash or invoice payment), and it's created successfully without requiring any Stripe interaction.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 54. MDX Infrastructure | v1.0 | 2/2 | Complete | 2026-05-14 |
| 55. Blog UI — Listing + Article Pages | v1.0 | 3/3 | Complete | 2026-05-14 |
| 56. Article Migration + SEO Wiring | v1.0 | 4/4 | Complete | 2026-05-15 |
| 57. Customer Auth Foundation | v2.0 | 3/3 | Complete | 2026-06-11 |
| 58. Sign-in UI + Account Dashboard | v2.0 | 5/5 | Complete | 2026-06-12 |
| 59. Booking Flow Redesign (Blacklane) | v2.0 | 5/5 | Complete | 2026-06-17 |
| 60. Auth-in-Checkout + Guest Path | v2.0 | 1/1 | Complete | 2026-06-17 |
| 61. Analytics Preservation & E2E Verify | v2.0 | 1/1 | Complete | 2026-06-17 |
| 62. Abandoned & Unpaid Booking Capture | v2.1 | 0/? | Not started | - |
| 63. Admin Booking Editing + Change Notification | v2.1 | 0/? | Not started | - |
| 64. Admin-Created Bookings with Payment Link | v2.1 | 0/? | Not started | - |
