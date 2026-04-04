# Requirements: Prestigo v1.4 — Return Transfer Booking

**Defined:** 2026-04-04
**Core Value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.

## v1.4 Requirements

### Wizard

- [x] **RTFR-01**: Client can select "Round Trip" as a 6th trip type in Step 1 of the booking wizard
- [ ] **RTFR-02**: When Round Trip is selected, Step 2 collects return date and time; return date/time must be after the outbound pickup date/time (validated with inline error)
- [ ] **RTFR-03**: When Round Trip is selected and the route falls into quoteMode (outside coverage zones), the Round Trip option is disabled and a message directs the client to request a quote instead
- [ ] **RTFR-04**: Step 3 displays outbound price and discounted return price separately (with return discount % shown), plus combined total; vehicle selection updates both prices live
- [ ] **RTFR-05**: Step 6 payment summary shows both legs with individual prices, discount % applied to return, and combined total; promo code (if applied) reduces the combined total

### Pricing

- [ ] **RTPR-01**: Return leg uses the same route distance as outbound (no second Google Routes API call); night/holiday coefficients are computed independently using the return date and time
- [ ] **RTPR-02**: Return leg price is reduced by the operator-configured `return_discount_pct` before display and before charging; displayed discount % matches the charged amount
- [ ] **RTPR-03**: Extras (child seat, meet & greet, extra luggage) apply to the outbound leg only — the return leg does not duplicate extras charges
- [ ] **RTPR-04**: Promo code discount is computed on the combined total (outbound + discounted return) and applied server-side at PaymentIntent creation

### Payment & Data

- [ ] **RTPM-01**: Client pays a single combined total (outbound + discounted return − promo) in one Stripe PaymentIntent; amount is computed server-side and validated before charge
- [x] **RTPM-02**: Stripe webhook atomically creates two linked Supabase booking records via a Postgres RPC; each record references the other via `linked_booking_id`; partial failure rolls back both inserts
- [x] **RTPM-03**: Each booking record stores its own leg amount (`outbound_amount_czk` / `return_amount_czk`) to enable accurate per-leg partial refunds

### Notifications

- [ ] **RTNF-01**: Client receives a single confirmation email listing both outbound and return trip details (route, date, time, vehicle, price per leg, total paid)
- [ ] **RTNF-02**: Confirmation page at `/book/confirmation` shows both outbound and return booking references
- [ ] **RTNF-03**: ICS calendar download includes two VEVENT blocks — one for the outbound leg, one for the return leg

### Admin

- [ ] **RTAD-01**: Operator can configure `return_discount_pct` (0–100%) in admin pricing settings; change takes effect immediately in the booking wizard
- [ ] **RTAD-02**: Return booking appears in admin bookings list as a distinct row with a "Return" badge linking to its paired outbound booking
- [ ] **RTAD-03**: Operator can manage status, notes, and cancellation for each leg independently in the admin bookings detail view
- [ ] **RTAD-04**: Cancelling one leg via admin triggers a Stripe partial refund for that leg's stored amount only; the paired leg is unaffected; cancel modal shows the per-leg refund amount

## v2 Requirements

### Future Enhancements

- **RTFR-V2-01**: "Book return later" — client books outbound now, adds return within 48 hours at same discounted rate (requires deferred payment / partial-booking state)
- **RTPM-V2-01**: Round-trip bookings appear as a linked pair in analytics with combined revenue
- **RTPR-V2-01**: Multi-stop round trips (e.g., airport → hotel → conference → hotel → airport)
- **RTAD-V2-01**: Bulk status update for both legs of a round trip simultaneously

## Out of Scope

| Feature | Reason |
|---------|--------|
| Open-return ("book return later") | Requires deferred payment state and reminder flows — significant scope creep for a rare use case; v2 |
| Re-calculation of return route via Google API | Symmetric distance is correct for Prague transfers; adds latency and API cost with no pricing benefit |
| Per-leg extras (extras charged on both legs) | Client expectation is one-time charge; child seats are already free (€0) in pricing config |
| Flat CZK return discount | Percentage discount covers all current needs; extend in v2 if needed |
| SMS notification on round-trip booking | Deferred (NOTIF-V2-01) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RTPM-02, RTPM-03 | Phase 23 | Pending |
| RTFR-01, RTFR-02 | Phase 24 | Pending |
| RTPR-01, RTPR-02, RTPR-03, RTFR-03, RTFR-04 | Phase 25 | Pending |
| RTPM-01, RTPR-04, RTFR-05 | Phase 26 | Pending |
| RTNF-01, RTNF-02, RTNF-03 | Phase 27 | Pending |
| RTAD-01, RTAD-02, RTAD-03, RTAD-04 | Phase 28 | Pending |

**Coverage:**
- v1.4 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after initial v1.4 milestone definition*
