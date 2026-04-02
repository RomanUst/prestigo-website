# Requirements: Prestigo v1.2 Operator Dashboard

**Defined:** 2026-04-01
**Core Value:** The operator can control pricing, define coverage zones, and view all bookings — without touching code or doing a deploy.

---

## v1.2 Requirements

### Authentication

- [x] **AUTH-01**: Unauthenticated requests to `/admin/*` are redirected to `/admin/login`
- [ ] **AUTH-02**: Operator can sign in with email + password at `/admin/login`
- [ ] **AUTH-03**: Authenticated session persists across browser refresh (HTTP-only Supabase cookie)
- [ ] **AUTH-04**: Operator can sign out and be redirected to `/admin/login`

### Pricing

- [ ] **PRICING-01**: Operator can edit base rates per vehicle class (Business, First Class, Business Van): `rate_per_km`, `hourly_rate`, `daily_rate`
- [ ] **PRICING-02**: Operator can edit extras surcharges (child seat, meet & greet, extra luggage)
- [ ] **PRICING-03**: Operator can edit the airport fee (flat surcharge for airport pickup/dropoff)
- [ ] **PRICING-04**: Operator can edit the night coefficient and holiday coefficient (multipliers applied at price calculation time)
- [x] **PRICING-05**: Booking wizard's `/api/calculate-price` reads rates from `pricing_config` Supabase table (not hardcoded `lib/pricing.ts` constants)
- [x] **PRICING-06**: Pricing changes are live immediately — next booking wizard load reflects the updated rates

### Coverage Zones

- [ ] **ZONES-01**: Operator can draw a polygon on an interactive Google Maps canvas
- [ ] **ZONES-02**: Operator can assign a name to a drawn zone and save it (stored as GeoJSON in `coverage_zones` table)
- [ ] **ZONES-03**: Operator can toggle a zone active or inactive without deleting it
- [x] **ZONES-04**: When booking wizard calls `/api/calculate-price`, if pickup or destination falls outside all active zones, the response returns `quoteMode: true` (existing "Request a quote" flow activates)
- [ ] **ZONES-05**: When no zones are defined, no booking is blocked (graceful default — zone check is skipped)

### Bookings

- [ ] **BOOKINGS-01**: Operator sees a paginated table of all bookings (most recent first)
- [ ] **BOOKINGS-02**: Table can be filtered by pickup date range
- [ ] **BOOKINGS-03**: Table can be filtered by trip type (one-way, airport pickup, airport dropoff, hourly, daily)
- [ ] **BOOKINGS-04**: Table has search by client name or booking reference
- [ ] **BOOKINGS-05**: Clicking a row expands full booking detail (extras, special requests, flight number, coordinates, payment intent ID)

### Statistics

- [ ] **STATS-01**: Dashboard shows total revenue (CZK) for the current month and previous month
- [ ] **STATS-02**: Dashboard shows booking count for today, this week, this month
- [ ] **STATS-03**: Revenue breakdown by vehicle class (pie or bar chart)
- [ ] **STATS-04**: Revenue breakdown by trip type
- [ ] **STATS-05**: 12-month revenue bar chart (monthly totals)

---

## v2 Requirements

Deferred to future release. Acknowledged but not in current roadmap.

### Enhanced Pricing

- **PRICING-V2-01**: Pricing preview tool — operator tests "what would this trip cost?" with draft rates before saving
- **PRICING-V2-02**: Zone-to-zone fixed price override for high-frequency corridors (e.g. Airport → Prague Centre flat price)

### Booking Management

- **BOOKINGS-V2-01**: Booking status workflow (Confirmed / In Progress / Completed) — operator marks rides as done
- **BOOKINGS-V2-02**: CSV export of bookings for a date range (accountant handoff)

### Analytics

- **STATS-V2-01**: Quote request tracking — how many bookings fell back to `quoteMode`, conversion funnel

---

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Layered / stacked pricing rule engine | Rule precedence bugs are the #1 reported problem in chauffeur booking platforms. Flat named multipliers (night, holiday) are safer and sufficient. |
| Real-time driver tracking / dispatch board | Prestigo is a 1-person operator with no driver app or GPS. Zero value at this scale. |
| Multi-user roles (dispatcher, driver, finance) | Single admin role with email+password is sufficient. Roles add complexity with no benefit today. |
| Automated invoice PDF generation | Requires PDF renderer + storage + email — high complexity. CSV export (v2) is sufficient for accountant. |
| Dynamic surge pricing (auto-adjust by demand) | Brand risk for a premium pre-booked service. Manual multiplier coefficients cover seasonal peaks. |
| Availability calendar with wizard blocking | Requires wizard integration — significant scope expansion. Manual cancellation/refund flow for now. |
| Public signup / multiple admin accounts | Single operator dashboard. No public auth registration route. |

---

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 10 | Complete |
| AUTH-02 | Phase 13 | Pending |
| AUTH-03 | Phase 13 | Pending |
| AUTH-04 | Phase 13 | Pending |
| PRICING-01 | Phase 16 | Pending |
| PRICING-02 | Phase 16 | Pending |
| PRICING-03 | Phase 16 | Pending |
| PRICING-04 | Phase 16 | Pending |
| PRICING-05 | Phase 12 | Complete |
| PRICING-06 | Phase 14 | Complete |
| ZONES-01 | Phase 16 | Pending |
| ZONES-02 | Phase 16 | Pending |
| ZONES-03 | Phase 16 | Pending |
| ZONES-04 | Phase 12 | Complete |
| ZONES-05 | Phase 12 | Pending |
| BOOKINGS-01 | Phase 16 | Pending |
| BOOKINGS-02 | Phase 16 | Pending |
| BOOKINGS-03 | Phase 16 | Pending |
| BOOKINGS-04 | Phase 16 | Pending |
| BOOKINGS-05 | Phase 16 | Pending |
| STATS-01 | Phase 16 | Pending |
| STATS-02 | Phase 16 | Pending |
| STATS-03 | Phase 16 | Pending |
| STATS-04 | Phase 16 | Pending |
| STATS-05 | Phase 16 | Pending |

**Coverage:**
- v1.2 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 — initial definition for v1.2*
