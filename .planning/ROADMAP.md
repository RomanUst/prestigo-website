# Roadmap: Prestigo Booking Form

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-03-30)
- ✅ **v1.1 Go Live** — Phases 7–9 (shipped 2026-04-01)
- ✅ **v1.2 Operator Dashboard** — Phases 10–17 (shipped 2026-04-02)
- ✅ **v1.3 Pricing & Booking Management** — Phases 18–22 (shipped 2026-04-03)
- 🚧 **v1.4 Return Transfer Booking** — Phases 23–28 (in progress)

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

<details>
<summary>✅ v1.3 Pricing & Booking Management (Phases 18–22) — SHIPPED 2026-04-03</summary>

- [x] Phase 18: Schema Foundation + Zone Logic Fix (2/2 plans) — completed 2026-04-03
- [x] Phase 19: Booking Status Workflow + Operator Notes (2/2 plans) — completed 2026-04-03
- [x] Phase 20: Manual Booking + Cancellation with Refund (3/3 plans) — completed 2026-04-03
- [x] Phase 21: Pricing Enhancements — Holiday Dates + Minimum Fare (2/2 plans) — completed 2026-04-03
- [x] Phase 22: Mobile Admin + Promo Code System (4/4 plans) — completed 2026-04-03

See full details: `.planning/milestones/v1.3-ROADMAP.md`

</details>

### v1.4 Return Transfer Booking (In Progress)

**Milestone Goal:** Allow clients to book a round-trip transfer in a single session — outbound + return — with a discounted return leg, a single Stripe charge, and two linked booking records in the operator dashboard.

- [x] **Phase 23: Database Schema Foundation** - Land all DB changes required for round-trip before any other code is touched (completed 2026-04-04)
- [ ] **Phase 24: Types, Zustand Store & Step 1** - Extend TypeScript types and store for round-trip state; add Round Trip as 6th trip type in Step 1
- [ ] **Phase 25: Pricing Engine + Step 2 & Step 3** - Return date/time collection; return leg pricing; combined price display; quoteMode guard
- [ ] **Phase 26: Payment — Combined Stripe Charge** - Single PaymentIntent for combined total; promo on combined total; Step 6 summary
- [ ] **Phase 27: Webhook & Notifications** - Atomic two-row creation via RPC; two-leg confirmation email; two ICS events; confirmation page shows both references
- [ ] **Phase 28: Admin — Return Discount Config + Booking Management** - Return discount % in pricing settings; return rows in bookings list; per-leg partial refund

## Phase Details

### Phase 23: Database Schema Foundation
**Goal**: All database changes required for round-trip bookings are in place and verified on staging before any code outside the migration is written
**Depends on**: Phase 22
**Requirements**: RTPM-02, RTPM-03
**Success Criteria** (what must be TRUE):
  1. Migration runs without error; existing one-way booking rows are unaffected (all have `leg = 'outbound'` by default)
  2. The composite UNIQUE constraint `(payment_intent_id, leg)` allows two rows with the same `payment_intent_id` when legs differ, and blocks a third row with the same pair
  3. `linked_booking_id` column exists with a self-referential FK that sets NULL on delete (no cascade delete of paired booking)
  4. `outbound_amount_czk` and `return_amount_czk` columns exist on `bookings`; `return_discount_pct` column exists on `pricing_globals` with default 10
  5. Calling `create_round_trip_bookings(p_outbound, p_return)` atomically inserts two cross-linked rows; if either insert fails, neither row is committed
**Plans:** 1/1 plans complete
Plans:
- [x] 23-01-PLAN.md — Write and apply v1.4 schema migration (leg column, composite UNIQUE, linked_booking_id FK, per-leg amounts, return_discount_pct, atomic RPC)

### Phase 24: Types, Zustand Store & Step 1 Round Trip
**Goal**: TypeScript types and Zustand store correctly model round-trip state, and clients can select Round Trip as the 6th trip type in Step 1 with no pricing wired yet
**Depends on**: Phase 23
**Requirements**: RTFR-01
**Success Criteria** (what must be TRUE):
  1. Selecting "Round Trip" in Step 1 stores `tripType: 'round_trip'` in the Zustand store and advances navigation correctly
  2. Switching away from "Round Trip" back to another trip type clears `returnTime` from the store — no stale return state
  3. Page refresh mid-wizard on a round-trip session preserves `returnTime` (persisted via `partialize`) but does not persist price breakdowns
  4. `resetBooking` clears all new return-leg fields; no orphaned return state from a previous session carries into a new booking
**Plans**: TBD

### Phase 25: Pricing Engine + Step 2 & Step 3
**Goal**: Clients can enter a return date and time in Step 2 and see outbound price, discounted return price, and combined total per vehicle class in Step 3; quoteMode prevents round-trip selection outside coverage zones
**Depends on**: Phase 24
**Requirements**: RTFR-02, RTFR-03, RTFR-04, RTPR-01, RTPR-02, RTPR-03
**Success Criteria** (what must be TRUE):
  1. When Round Trip is selected, Step 2 shows return date and return time pickers; entering a return datetime earlier than the outbound datetime shows an inline validation error and blocks progression
  2. Step 3 displays a combined price card per vehicle class: outbound price, discounted return price with the discount % badge, and combined total; switching vehicle class updates all three figures live
  3. The return leg price uses the same distance as outbound (no second Google API call) and computes night/holiday coefficients from the return date and time independently
  4. Extras (child seat, meet & greet, extra luggage) appear in the outbound price only; the return price does not include extras charges
  5. When Round Trip is selected and the route is in quoteMode, the Round Trip option in Step 1 is disabled and a message directs the client to request a quote
**Plans**: TBD

### Phase 26: Payment — Combined Stripe Charge
**Goal**: A single Stripe PaymentIntent is created for the combined outbound + discounted return total; any promo code reduces the combined total; Step 6 shows the full two-leg payment summary before the client pays
**Depends on**: Phase 25
**Requirements**: RTPM-01, RTPR-04, RTFR-05
**Success Criteria** (what must be TRUE):
  1. The Stripe PaymentIntent amount equals outbound price + discounted return price (minus promo, if applied) — computed server-side, never trusting client-sent amounts
  2. Step 6 payment summary shows outbound leg price, return leg price with discount %, combined subtotal, promo reduction (if applied), and final charge amount
  3. A valid promo code reduces the combined total (outbound + discounted return) once — not per leg; the displayed discount matches the charged amount
  4. All return-leg metadata fields (return date, return time, return amount, return booking reference) are embedded in the PaymentIntent metadata within Stripe's 50-key / 500-char limits
**Plans**: TBD

### Phase 27: Webhook & Notifications
**Goal**: When a round-trip payment succeeds, the webhook atomically creates two linked Supabase booking records, the client receives one confirmation email covering both legs with two ICS calendar events, and the confirmation page displays both booking references
**Depends on**: Phase 26
**Requirements**: RTNF-01, RTNF-02, RTNF-03
**Success Criteria** (what must be TRUE):
  1. After payment, two booking rows exist in Supabase — each with `linked_booking_id` pointing to the other; if either insert fails, neither row is committed (RPC rollback)
  2. The client confirmation email lists both outbound and return legs with route, date, time, vehicle, per-leg price, and total paid; the email is sent once (not twice)
  3. The ICS file attached to the confirmation email contains two VEVENT blocks — one for the outbound leg and one for the return leg
  4. The `/book/confirmation` page displays both the outbound booking reference and the return booking reference
  5. A Stripe partial refund (from the charge.refunded event with `amount_refunded < amount`) cancels only the matching leg's booking row, not both rows
**Plans**: TBD

### Phase 28: Admin — Return Discount Config + Booking Management
**Goal**: The operator can configure the return discount percentage in admin pricing settings, see return-leg bookings as distinct rows linked to their outbound pair, and cancel individual legs with accurate per-leg partial refunds
**Depends on**: Phase 27
**Requirements**: RTAD-01, RTAD-02, RTAD-03, RTAD-04
**Success Criteria** (what must be TRUE):
  1. The admin pricing settings page has a `Return Discount %` field (0-100); saving a new value immediately changes the discount applied in the booking wizard for subsequent bookings
  2. Return-leg booking rows appear in the admin bookings list with a "Return" badge; the expandable row shows the paired outbound booking reference as a link
  3. The operator can independently change status and add notes to the outbound leg and the return leg without affecting the paired leg
  4. Cancelling a single leg from the admin cancel modal triggers a Stripe partial refund for that leg's stored amount only; the cancel modal shows the per-leg refund amount and a warning that the paired leg is unaffected
**Plans**: TBD

---

## Progress

**Execution Order:** Phases execute in numeric order: 23 -> 24 -> 25 -> 26 -> 27 -> 28

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
| 19. Booking Status Workflow + Operator Notes | v1.3 | 2/2 | Complete | 2026-04-03 |
| 20. Manual Booking + Cancellation with Refund | v1.3 | 3/3 | Complete | 2026-04-03 |
| 21. Pricing Enhancements — Holiday Dates + Minimum Fare | v1.3 | 2/2 | Complete | 2026-04-03 |
| 22. Mobile Admin + Promo Code System | v1.3 | 4/4 | Complete | 2026-04-03 |
| 23. Database Schema Foundation | 1/1 | Complete    | 2026-04-04 | - |
| 24. Types, Zustand Store & Step 1 Round Trip | v1.4 | 0/? | Not started | - |
| 25. Pricing Engine + Step 2 & Step 3 | v1.4 | 0/? | Not started | - |
| 26. Payment — Combined Stripe Charge | v1.4 | 0/? | Not started | - |
| 27. Webhook & Notifications | v1.4 | 0/? | Not started | - |
| 28. Admin — Return Discount Config + Booking Management | v1.4 | 0/? | Not started | - |
