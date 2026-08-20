# Requirements: Prestigo — v2.1 Admin Booking Management & Payment Recovery

**Defined:** 2026-08-19
**Core Value:** Every page — booking, content, or service — must convert a visitor into a confirmed booking or a qualified lead without friction.

## v1 Requirements

Requirements for milestone v2.1. Each maps to a roadmap phase.

### AEDIT — Admin Booking Editing + Client Notification

- [ ] **AEDIT-01**: Operator can edit a booking's pickup date and time from the admin booking detail view
- [ ] **AEDIT-02**: Operator can change a booking's vehicle class from the admin
- [ ] **AEDIT-03**: Operator can edit a booking's route (origin/destination addresses) from the admin
- [ ] **AEDIT-04**: Operator can edit passenger/contact details and flight number from the admin
- [ ] **AEDIT-05**: On saving an edit, the operator can choose (via a "notify client" toggle) to send the client a branded email confirming the change, showing old → new values
- [ ] **AEDIT-06**: Editing one leg of a round-trip booking updates only that leg; the linked leg is unaffected
- [ ] **AEDIT-07**: When a route or vehicle change affects the price, the operator can review and adjust the amount before saving

### ABND — Abandoned / Unpaid Booking Capture

- [x] **ABND-01**: A booking is persisted as soon as the client reaches the payment step, before payment completes
- [ ] **ABND-02**: A booking that reaches the payment step but is never paid carries an "unconfirmed / unpaid" status
- [ ] **ABND-03**: Unconfirmed/unpaid bookings appear in the admin bookings list, visually distinguished from confirmed bookings
- [ ] **ABND-04**: Operator can filter the admin list to show only unconfirmed/unpaid bookings
- [ ] **ABND-05**: Each captured booking stores the client's contact details (name, email, phone) so the operator can follow up
- [x] **ABND-06**: A captured unpaid booking is reconciled to "confirmed/paid" when its payment later completes (no duplicate record)

### ANEW — Admin-Created Bookings with Payment Link

- [ ] **ANEW-01**: Operator can create a new booking manually from the admin panel
- [ ] **ANEW-02**: On saving an admin-created booking, the operator can generate and attach a Stripe payment link
- [ ] **ANEW-03**: Operator can send the client an email containing the payment link
- [ ] **ANEW-04**: The booking's payment status updates to paid when the client pays via the link
- [ ] **ANEW-05**: An admin-created booking can be saved without a payment link (e.g. cash or invoice)

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Follow-up automation

- **FOLLOW-01**: Automatic reminder email to clients with an unpaid booking after N hours
- **FOLLOW-02**: Audit log of all admin edits per booking (who changed what, when)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Editing bookings by the client themselves (self-service) | v2.1 is operator-facing only; client edits are a separate concern |
| Payment methods beyond Stripe; saved cards | Stripe one-off / payment links only, consistent with existing constraint |
| Changing the guest-checkout or admin-auth session model | Must remain untouched per project constraints |
| Refunds / partial refunds through the admin | Payment recovery only; refunds handled manually via Stripe dashboard for now |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AEDIT-01 | Phase 63 | Pending |
| AEDIT-02 | Phase 63 | Pending |
| AEDIT-03 | Phase 63 | Pending |
| AEDIT-04 | Phase 63 | Pending |
| AEDIT-05 | Phase 63 | Pending |
| AEDIT-06 | Phase 63 | Pending |
| AEDIT-07 | Phase 63 | Pending |
| ABND-01 | Phase 62 | Complete |
| ABND-02 | Phase 62 | Pending |
| ABND-03 | Phase 62 | Pending |
| ABND-04 | Phase 62 | Pending |
| ABND-05 | Phase 62 | Pending |
| ABND-06 | Phase 62 | Complete |
| ANEW-01 | Phase 64 | Pending |
| ANEW-02 | Phase 64 | Pending |
| ANEW-03 | Phase 64 | Pending |
| ANEW-04 | Phase 64 | Pending |
| ANEW-05 | Phase 64 | Pending |
