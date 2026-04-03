# Roadmap: Prestigo Booking Form

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-03-30)
- ✅ **v1.1 Go Live** — Phases 7–9 (shipped 2026-04-01)
- ✅ **v1.2 Operator Dashboard** — Phases 10–17 (shipped 2026-04-02)
- 🚧 **v1.3 Pricing & Booking Management** — Phases 18–22 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–6) — SHIPPED 2026-03-30</summary>

- [x] Phase 1: Foundation & Trip Entry (6/6 plans) — completed 2026-03-25
- [x] Phase 2: Pricing & Vehicle Selection (5/5 plans) — completed 2026-03-26
- [x] Phase 3: Booking Details (4/4 plans) — completed 2026-03-27
- [x] Phase 4: Payment (4/4 plans) — completed 2026-03-30
- [x] Phase 5: Backend & Notifications (3/3 plans) — completed 2026-03-30
- [x] Phase 6: Homepage Widget & Polish (3/3 plans) — completed 2026-03-30

See full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Go Live (Phases 7–9) — SHIPPED 2026-04-01</summary>

- [x] Phase 7: Foundation — Supabase Schema + Env Vars + Deploy (2/2 plans) — completed 2026-03-31
- [x] Phase 8: Stripe + Health Check + Maps Keys (3/3 plans) — completed 2026-03-31
- [x] Phase 9: Resend Domain Verification + Email Sign-Off (2/2 plans) — completed 2026-04-01

See full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Operator Dashboard (Phases 10–17) — SHIPPED 2026-04-02</summary>

- [x] Phase 10: Auth Infrastructure (1/1 plans) — completed 2026-04-01
- [x] Phase 11: Database Schema (1/1 plans) — completed 2026-04-01
- [x] Phase 12: Core Booking Flow Update (2/2 plans) — completed 2026-04-02
- [x] Phase 13: Admin Auth + Login UI (2/2 plans) — completed 2026-04-02
- [x] Phase 14: Admin API Routes (2/2 plans) — completed 2026-04-02
- [x] Phase 15: UI Design Contract (1/1 plans) — completed 2026-04-02
- [x] Phase 16: Admin UI Pages (5/5 plans) — completed 2026-04-02
- [x] Phase 17: Pricing Globals Integration (2/2 plans) — completed 2026-04-02

See full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

---

### 🚧 v1.3 Pricing & Booking Management (In Progress)

**Milestone Goal:** Enhance pricing logic (zone direction fix, holiday dates, minimum fare), add a full promo code system (admin CRUD + client wizard entry + server-side atomic validation), extend booking management (manual creation, status workflow, cancellation with Stripe refund, operator notes), and make the admin panel usable on mobile.

- [x] **Phase 18: Schema Foundation + Zone Logic Fix** - DB migrations for v1.3 columns and tables; zone pricing logic corrected to OR-logic (completed 2026-04-03)
- [x] **Phase 19: Booking Status Workflow + Operator Notes** - Operator can move bookings through lifecycle states and annotate jobs (completed 2026-04-03)
- [ ] **Phase 20: Manual Booking + Cancellation with Refund** - Phone orders captured in admin; operator can cancel with optional Stripe refund
- [ ] **Phase 21: Pricing Enhancements — Holiday Dates + Minimum Fare** - Holiday coefficient auto-applied by date; minimum fare floor enforced per vehicle class
- [ ] **Phase 22: Mobile Admin + Promo Code System** - Admin panel works at 375px; full promo code system end-to-end

## Phase Details

### Phase 18: Schema Foundation + Zone Logic Fix
**Goal**: All v1.3 database prerequisites are in place and zone pricing returns a calculated price whenever pickup OR dropoff is within an active zone
**Depends on**: Phase 17 (v1.2 complete)
**Requirements**: ZONES-06
**Success Criteria** (what must be TRUE):
  1. A booking where only the pickup address is inside a coverage zone shows a calculated price (not a quote request)
  2. A booking where only the dropoff address is inside a coverage zone shows a calculated price (not a quote request)
  3. A booking where neither pickup nor dropoff is in any active zone correctly falls back to quote mode
  4. `bookings` table has `status`, `operator_notes`, and `booking_source` columns; `payment_intent_id` is nullable
  5. `promo_codes` table exists (empty); `pricing_config` JSONB includes `holiday_dates` key
**Plans:** 2/2 plans complete

Plans:
- [x] 18-01-PLAN.md — Zone logic fix: extract isInAnyZone helper to lib/zones.ts, TDD 4-case test matrix, fix OR-logic bug in route
- [x] 18-02-PLAN.md — SQL migration: bookings columns (status, operator_notes, booking_source), promo_codes table, holiday_dates on pricing_globals

### Phase 19: Booking Status Workflow + Operator Notes
**Goal**: Operator can move any booking through its full lifecycle and annotate it with internal notes
**Depends on**: Phase 18
**Requirements**: BOOKINGS-07, BOOKINGS-09
**Success Criteria** (what must be TRUE):
  1. Operator can change a booking's status from the admin bookings table; only valid next states are offered (pending shows confirmed/cancelled; confirmed shows completed/cancelled; completed and cancelled show no transition options)
  2. An invalid status transition (e.g., completed -> pending) is rejected by the server with a clear error
  3. Operator can type internal notes on any booking row and the note auto-saves without a separate save button
  4. Operator notes are visible in the expanded booking row on reload
**Plans:** 2/2 plans complete

Plans:
- [ ] 19-01-PLAN.md — PATCH API handler with FSM validation + StatusBadge booking variants + unit tests
- [ ] 19-02-PLAN.md — BookingsTable UI: status column, transition dropdown, operator notes textarea with auto-save

### Phase 20: Manual Booking + Cancellation with Refund
**Goal**: Phone orders are captured in the system and operator can cancel any booking with an optional full Stripe refund
**Depends on**: Phase 19
**Requirements**: BOOKINGS-06, BOOKINGS-08
**Success Criteria** (what must be TRUE):
  1. Operator can submit the manual booking form in admin and the booking appears in the bookings table with `booking_source: manual` and no payment reference
  2. Operator can cancel a Stripe-paid booking; a confirmation modal appears before the refund is issued
  3. After cancellation, the booking status updates to cancelled and the Stripe refund is visible in the Stripe Dashboard
  4. Attempting to cancel a manual booking shows a "Cancel" option only — no refund prompt appears
  5. Attempting to cancel an already-cancelled or completed booking is blocked by the server
**Plans:** 1/3 plans executed

Plans:
- [ ] 20-01-PLAN.md — Manual booking POST API + ManualBookingForm modal + booking reference extraction + MANUAL badge
- [ ] 20-02-PLAN.md — Cancel endpoint with Stripe refund + charge.refunded webhook + CancellationModal UI
- [ ] 20-03-PLAN.md — Human verification of manual booking and cancellation flows

### Phase 21: Pricing Enhancements — Holiday Dates + Minimum Fare
**Goal**: Holiday coefficient is automatically applied to trips on configured dates and no trip is priced below the per-vehicle-class minimum fare
**Depends on**: Phase 18
**Requirements**: PRICING-07, PRICING-08
**Success Criteria** (what must be TRUE):
  1. Operator can add and remove holiday dates in the admin pricing editor; changes are saved immediately
  2. A trip with pickup on a configured holiday date has the `holiday_coefficient` applied at price calculation time — the client sees the correct holiday-adjusted total
  3. Operator can set a minimum fare for each vehicle class in the admin pricing editor
  4. A short trip whose calculated distance price falls below the minimum fare for the selected vehicle class is displayed and charged at the minimum fare, not the calculated price
**Plans**: TBD

### Phase 22: Mobile Admin + Promo Code System
**Goal**: Admin panel is fully usable on a 375px mobile screen and the end-to-end promo code system is live (admin creates codes, clients apply them, server validates atomically before charge)
**Depends on**: Phase 21
**Requirements**: UX-01, PROMO-01, PROMO-02, PROMO-03, PROMO-04
**Success Criteria** (what must be TRUE):
  1. Admin panel sidebar collapses to a hamburger toggle on mobile; all interactive elements meet 44px touch targets; bookings table switches to card layout below 768px
  2. Operator can create a promo code with code string, discount percentage, expiry date, and usage limit in the admin panel
  3. Operator can deactivate or delete an existing promo code; deactivated codes are no longer accepted by the booking wizard
  4. Client can enter a promo code in the booking wizard at checkout; a valid code updates the displayed total inline without a page reload
  5. An expired, exhausted, or invalid promo code entered at checkout is rejected with a specific error message before payment is attempted; two simultaneous users cannot over-redeem a single-use code
**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Trip Entry | v1.0 | 6/6 | Complete | 2026-03-25 |
| 2. Pricing & Vehicle Selection | v1.0 | 5/5 | Complete | 2026-03-26 |
| 3. Booking Details | v1.0 | 4/4 | Complete | 2026-03-27 |
| 4. Payment | v1.0 | 4/4 | Complete | 2026-03-30 |
| 5. Backend & Notifications | v1.0 | 3/3 | Complete | 2026-03-30 |
| 6. Homepage Widget & Polish | v1.0 | 3/3 | Complete | 2026-03-30 |
| 7. Foundation — Supabase + Env + Deploy | v1.1 | 2/2 | Complete | 2026-03-31 |
| 8. Stripe + Health Check + Maps Keys | v1.1 | 3/3 | Complete | 2026-03-31 |
| 9. Resend Domain + Email Sign-Off | v1.1 | 2/2 | Complete | 2026-04-01 |
| 10. Auth Infrastructure | v1.2 | 1/1 | Complete | 2026-04-01 |
| 11. Database Schema | v1.2 | 1/1 | Complete | 2026-04-01 |
| 12. Core Booking Flow Update | v1.2 | 2/2 | Complete | 2026-04-02 |
| 13. Admin Auth + Login UI | v1.2 | 2/2 | Complete | 2026-04-02 |
| 14. Admin API Routes | v1.2 | 2/2 | Complete | 2026-04-02 |
| 15. UI Design Contract | v1.2 | 1/1 | Complete | 2026-04-02 |
| 16. Admin UI Pages | v1.2 | 5/5 | Complete | 2026-04-02 |
| 17. Pricing Globals Integration | v1.2 | 2/2 | Complete | 2026-04-02 |
| 18. Schema Foundation + Zone Logic Fix | v1.3 | 2/2 | Complete | 2026-04-03 |
| 19. Booking Status Workflow + Operator Notes | 2/2 | Complete   | 2026-04-03 | - |
| 20. Manual Booking + Cancellation with Refund | 1/3 | In Progress|  | - |
| 21. Pricing Enhancements — Holiday Dates + Minimum Fare | v1.3 | 0/TBD | Not started | - |
| 22. Mobile Admin + Promo Code System | v1.3 | 0/TBD | Not started | - |
