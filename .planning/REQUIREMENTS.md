# Requirements: Prestigo v1.3 Pricing & Booking Management

**Defined:** 2026-04-03
**Core Value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.

---

## v1.3 Requirements

### Coverage Zones

- [x] **ZONES-06**: Trip shows a calculated price if pickup **or** dropoff is within an active zone; `quoteMode: true` only when neither point is in any active zone

### Pricing

- [ ] **PRICING-07**: Operator can configure a list of holiday dates in the admin pricing editor; trips with pickup on a configured date automatically apply `holiday_coefficient` at price calculation time
- [ ] **PRICING-08**: Operator can set a minimum fare per vehicle class in the admin pricing editor; calculated prices below this floor are raised to the minimum

### Promo Codes

- [ ] **PROMO-01**: Operator can create a promo code (code string, discount type %, discount value, expiry date, usage limit) in the admin panel
- [ ] **PROMO-02**: Operator can deactivate or delete existing promo codes
- [ ] **PROMO-03**: Client can enter a promo code in the booking wizard at checkout; a valid code updates the displayed total price inline
- [ ] **PROMO-04**: Promo code is validated server-side (atomically, with race-safe usage increment) before Stripe PaymentIntent creation; invalid, expired, or exhausted codes are rejected with a specific error message

### Booking Management

- [x] **BOOKINGS-06**: Operator can create a manual booking via an admin form (for phone orders) — trip type, date/time, pickup/dropoff addresses, vehicle class, passenger details, price; booking is saved with `booking_source: 'manual'` and no Stripe payment reference
- [x] **BOOKINGS-07**: Operator can change booking status from the admin bookings table (pending → confirmed → completed → cancelled); only valid state transitions are permitted
- [x] **BOOKINGS-08**: Operator can cancel a booking with an optional full Stripe refund; for Stripe-paid bookings a confirmation modal is shown before refund is issued; manual bookings show "Cancel" only (no refund option)
- [x] **BOOKINGS-09**: Operator can add or edit internal operator notes on any booking; notes are visible in the expanded booking row and auto-save

### Admin UX

- [ ] **UX-01**: Admin panel is responsive and usable on mobile devices (375px+); bookings table collapses to card layout below 768px; sidebar has hamburger toggle on mobile; all interactive targets are minimum 44px

---

## v2 Requirements

Deferred to future release.

### Booking Enhancements

- **BOOKINGS-V2-01**: CSV export of bookings for a date range (accountant handoff) — deferred from v1.2
- **BOOKINGS-V2-02**: Client self-service cancellation — requires client accounts (large scope change)
- **BOOKINGS-V2-03**: Bulk booking status updates

### Pricing Enhancements

- **PRICING-V2-01**: Pricing preview tool — operator tests "what would this trip cost?" with draft rates before saving
- **PRICING-V2-02**: Partial refund with custom amount (operators use Stripe Dashboard for exceptional cases in v1.3)

### Promo Codes

- **PROMO-V2-01**: Promo code usage analytics (how many times used, revenue impact)
- **PROMO-V2-02**: Auto-expiry background jobs and reminder notifications

### Notifications

- **NOTIF-V2-01**: SMS notifications on booking status changes (Twilio)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Partial Stripe refund from admin | Accounting ambiguity; Stripe Dashboard covers exceptional cases |
| Client self-service cancellation | Requires client accounts — out of scope for v1.3 |
| Multi-operator roles (dispatcher, driver) | Single admin role is sufficient for Prestigo's 1-person operation |
| Promo code analytics dashboard | v2 feature; basic CRUD is sufficient for v1.3 |
| Availability calendar / blocking | Requires wizard integration — significant scope expansion |
| Flat CZK discount codes (percentage only in v1.3) | Percentage covers all current operator needs; flat can be added as column extension in v2 |

---

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ZONES-06 | Phase 18 | Complete |
| PRICING-07 | Phase 21 | Pending |
| PRICING-08 | Phase 21 | Pending |
| PROMO-01 | Phase 22 | Pending |
| PROMO-02 | Phase 22 | Pending |
| PROMO-03 | Phase 22 | Pending |
| PROMO-04 | Phase 22 | Pending |
| BOOKINGS-06 | Phase 20 | Complete |
| BOOKINGS-07 | Phase 19 | Complete |
| BOOKINGS-08 | Phase 20 | Complete |
| BOOKINGS-09 | Phase 19 | Complete |
| UX-01 | Phase 22 | Pending |

**Coverage:**
- v1.3 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 — traceability complete, all 12 requirements mapped*
