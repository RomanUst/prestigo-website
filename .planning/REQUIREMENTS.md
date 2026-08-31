# Requirements: Prestigo — v2.2 Dispatch & Driver Trip Portal

**Defined:** 2026-08-27
**Core Value:** Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction. (v2.2 extends operational tooling: faster dispatch + a driver-facing trip portal.)

## v1 Requirements (this milestone)

Requirements for milestone v2.2. Each maps to a roadmap phase (numbering continues from Phase 64 → starts at Phase 65).

### Dispatch — Admin Bookings List

- [x] **DISP-01**: Admin bookings list defaults to showing only future trips (pickup ≥ now) on load.
- [x] **DISP-02**: Admin can set a persistent default horizon in admin settings (Future only / Last N days / All) that applies on every visit.
- [x] **DISP-03**: In-session UI filters override the saved default (reveal past/all) without changing the persisted setting.
- [x] **DISP-04**: KPI counters (today's bookings, week revenue) remain accurate regardless of the active default/filter.

### Driver Trip Portal

- [x] **DTRIP-01**: On assignment, a permanent per-assignment driver link is generated with a token valid until the order reaches a terminal status (no immediate expiry).
- [x] **DTRIP-02**: The driver link opens a `noindex` trip sheet with full trip details (pickup/dropoff, date/time, passenger, phone, flight, special requests, booking reference) — presentable to police control.
- [ ] **DTRIP-03**: Driver can mark trip-progress statuses from the link: en route → arrived → on board → completed, plus no-show.
- [ ] **DTRIP-04**: Trip-progress is stored in a separate field and does NOT modify `booking.status` (and is not pushed to GNet by default).
- [ ] **DTRIP-05**: Admin sees the driver's live trip-progress in the bookings admin.
- [ ] **DTRIP-06**: Driver can leave an optional trip note/feedback from the link.
- [x] **DTRIP-07**: The existing accept/decline assignment flow remains available; the permanent trip link coexists with it.
- [x] **DTRIP-08**: The trip link token is unguessable and only exposes the assigned booking's data; it becomes invalid on terminal status or reassignment.

## Future Requirements

Deferred; tracked but not in this milestone's roadmap.

### Driver Portal

- **DTRIP-FUT-01**: Driver GPS / real-time location on the trip sheet
- **DTRIP-FUT-02**: Push / SMS notifications to the driver on assignment and updates
- **DTRIP-FUT-03**: Optional push of driver trip-progress into GNet status

### Carried Forward (from v2.1 / v2.0)

- **FOLLOW-01**: Automatic reminder email after N hours unpaid
- **CR-02**: Actual Stripe Payment Link deactivation after price edit / manual confirm
- **AUTH-02 / AUTH-03**: Google / Apple OAuth dashboard credential config
- **BOOK-06**: Booking-method step ("Book for myself / guest"; corporate "Book for a guest")

## Out of Scope

Explicitly excluded for v2.2. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| GPS / real-time driver geolocation | Substantial new subsystem; not needed for status marking or the trip sheet |
| Push / SMS to driver | Email link is sufficient for v2.2; notifications are a separate concern |
| Auto-push trip-progress to GNet | Trip-progress is deliberately separate from `booking.status`; keeps GNet coupling risk out |
| Changing admin or guest auth model | Untouched — session isolation must be preserved |
| Replacing accept/decline flow | Coexists; permanent trip link is additive (DTRIP-07) |

## Traceability

Which phases cover which requirements. Filled during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISP-01 | Phase 65 | Complete |
| DISP-02 | Phase 65 | Complete |
| DISP-03 | Phase 65 | Complete |
| DISP-04 | Phase 65 | Complete |
| DTRIP-01 | Phase 66 | Complete |
| DTRIP-02 | Phase 66 | Complete |
| DTRIP-03 | Phase 67 | Pending |
| DTRIP-04 | Phase 67 | Pending |
| DTRIP-05 | Phase 67 | Pending |
| DTRIP-06 | Phase 67 | Pending |
| DTRIP-07 | Phase 66 | Complete |
| DTRIP-08 | Phase 66 | Complete |

**Coverage:**

- v2.2 requirements: 12 total
- Mapped to phases: 12 (Phase 65: 4, Phase 66: 4, Phase 67: 4)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-27*
*Last updated: 2026-08-27 after v2.2 ROADMAP.md creation (Phases 65-67)*
