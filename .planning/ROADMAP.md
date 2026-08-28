# Roadmap: Prestigo

## Milestones

- ✅ **v1.0 SEO Blog** — Phases 54-56 (shipped 2026-05-15)
- ✅ **v2.0 Blacklane-style Booking + Customer Accounts** — Phases 57-61 (shipped 2026-06-18)
- ✅ **v2.1 Admin Booking Management & Payment Recovery** — Phases 62-64 (shipped 2026-08-26)
- 🚧 **v2.2 Dispatch & Driver Trip Portal** — Phases 65-67 (in progress)

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

<details>
<summary>✅ v2.1 Admin Booking Management & Payment Recovery (Phases 62-64) — SHIPPED 2026-08-26</summary>

**Milestone Goal:** Give the operator full control of the booking lifecycle inside the admin panel — edit bookings with automatic client notification, capture abandoned/unpaid bookings for follow-up, and create bookings with an attachable payment link and client email.

- [x] **Phase 62: Abandoned & Unpaid Booking Capture** — Checkout attempts persisted before payment completes, surfaced as a followable unpaid queue in admin, reconciled without duplicates on payment success (4/4 plans, completed 2026-08-20)
- [x] **Phase 63: Admin Booking Editing + Change Notification** — Operator edits schedule/vehicle/route/passenger, server-authoritative price-change review, optional branded change-notification email, per-field edit audit log (5/5 plans, completed 2026-08-21)
- [x] **Phase 64: Admin-Created Bookings with Payment Link** — Admin-originated bookings with optional Stripe payment link + client email, auto no-duplicate reconcile (incl. round-trip both legs), or no-link cash/invoice save (4/4 plans, completed 2026-08-25)

**Audit:** passed — 19/19 requirements satisfied, cross-phase integration sound, all E2E flows complete. See [milestones/v2.1-MILESTONE-AUDIT.md](milestones/v2.1-MILESTONE-AUDIT.md).

See [milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md) for full phase details.

</details>

### 🚧 v2.2 Dispatch & Driver Trip Portal (Phases 65-67, in progress)

**Milestone Goal:** Speed up dispatcher work with a future-first admin bookings list (persistent default + in-session filters), and give each driver a permanent working link to their trip — a trip sheet they can show to police control, with live status marking and an optional note that stay separate from the client-facing booking status.

- [ ] **Phase 65: Dispatch — Future-First Bookings List** - Admin bookings list page defaults to future trips only, with a persistent default-horizon setting and in-session filters to reveal past/all; KPI counters stay accurate.
- [ ] **Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet** - Each driver assignment gets a permanent, unguessable link to a noindex trip sheet page, coexisting with the existing accept/decline flow.
- [ ] **Phase 67: Driver Trip Portal — Status Marking, Notes & Admin Visibility** - Driver marks live trip-progress and leaves a note from the trip sheet; admin sees progress live in the bookings admin, with no effect on `booking.status` or GNet.

## Phase Details

### Phase 65: Dispatch — Future-First Bookings List

**Goal**: Dispatcher opens the admin bookings list page and by default sees only relevant upcoming trips, with control over the time horizon that persists across visits but can be overridden per session.
**Depends on**: Nothing (first phase of v2.2; continues from Phase 64)
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04
**Success Criteria** (what must be TRUE):

  1. On opening the admin bookings list page with no filter applied, only bookings with pickup date/time at or after now are shown.
  2. Admin can choose and save a default horizon (Future only / Last N days / All) in admin Settings, and that choice is what the bookings list applies on every subsequent visit.
  3. Within a session, admin can switch the list to "Past" or "All" via an in-session filter control without changing the persisted default setting.
  4. KPI counters (today's bookings, week revenue) on the bookings page continue to show correct totals regardless of which list filter/horizon is currently active.

**Plans**: 4/4 plans executed

Plans:
**Wave 1**

- [x] 65-01-PLAN.md — Foundation: Prague-date helper + migrations 058/059 + live operator apply (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 65-02-PLAN.md — Tracer: end-to-end future-first list + full horizon resolution (Wave 2)
- [x] 65-03-PLAN.md — Settings persistence backend + Dispatch Default widget (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 65-04-PLAN.md — BookingsTable segmented control + page wiring + KPI decoupling guard (Wave 3)

**UI hint**: yes

### Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet

**Goal**: Each driver assigned to a booking gets one permanent, secure link to a trip sheet page — presentable to police control — that coexists with the existing accept/decline assignment flow.
**Depends on**: Nothing structurally (builds on existing `driver_assignments` infrastructure; can run independently of Phase 65)
**Requirements**: DTRIP-01, DTRIP-02, DTRIP-07, DTRIP-08
**Success Criteria** (what must be TRUE):

  1. When a booking is assigned to a driver, a permanent trip-link token is generated that stays valid until the booking reaches a terminal status — no immediate single-use expiry like the existing accept/decline token.
  2. Opening the driver's trip link shows a `noindex` trip sheet page with pickup/dropoff, date/time, passenger name, phone, flight info, special requests, and booking reference — sufficient to show to police control.
  3. The existing accept/decline assignment flow (email + response page) still works unchanged; the permanent trip link is additive and works independently of accept/decline.
  4. The trip link token is unguessable, exposes only the assigned booking's own data, and stops working once that booking reaches a terminal status or is reassigned to a different driver.

**Plans**: TBD
**UI hint**: yes

### Phase 67: Driver Trip Portal — Status Marking, Notes & Admin Visibility

**Goal**: From the trip sheet, the driver can mark real-time trip progress and leave an optional note, and the admin can view that progress live in the bookings admin — all without touching the client-facing `booking.status` or pushing to GNet.
**Depends on**: Phase 66 (requires the permanent trip-link token and trip sheet page)
**Requirements**: DTRIP-03, DTRIP-04, DTRIP-05, DTRIP-06
**Success Criteria** (what must be TRUE):

  1. From the trip sheet, the driver can mark trip-progress through en route → arrived → on board → completed, or mark the trip as a no-show.
  2. Marking trip-progress updates a dedicated trip-progress field only; `booking.status` is unchanged and no GNet status push occurs as a result.
  3. Admin can view the driver's current trip-progress live in the bookings admin list/detail, alongside the existing booking status.
  4. Driver can submit an optional free-text trip note/feedback from the trip sheet, and it becomes visible to admin.

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
| 65. Dispatch — Future-First Bookings List | v2.2 | 4/4 | In Progress|  |
| 66. Driver Trip Portal — Permanent Link & Trip Sheet | v2.2 | 0/? | Not started | - |
| 67. Driver Trip Portal — Status Marking, Notes & Admin Visibility | v2.2 | 0/? | Not started | - |
