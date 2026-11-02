# Requirements: Prestigo — v5.0 Payments, Quotes & Day Trips

**Defined:** 2026-11-02
**Core Value:** Every page must convert a visitor into a confirmed booking or a qualified lead without friction.

## v1 Requirements

Requirements for this milestone. Each maps to a roadmap phase.

### Payment foundation (PAYF)

- [ ] **PAYF-01**: Every booking carries a payment mode (card / cash / quote / partner) and a payment state that is separate from the trip status; every money event is recorded in an append-only payment ledger visible in admin
- [ ] **PAYF-02**: All status changes (admin, kanban, driver, cancel, payment engine) go through one status service with compare-and-set, so a stale or double action is rejected instead of applied twice
- [ ] **PAYF-03**: The Stripe webhook routes each event by its purpose (booking setup, hold, capture, no-show, extra charge, quote deposit, quote remainder) without creating duplicate bookings or false alerts; a partial refund never cancels a completed trip
- [ ] **PAYF-04**: Owner can run a script that subscribes the live Stripe webhook to every new event type, and a working test-mode path (owner-run script or valid test key) exists before payments go live
- [ ] **PAYF-05**: The new payment flow is behind an admin feature flag so the owner can run a canary booking before enabling it for all clients

### Card on file and holds (HOLD)

- [ ] **HOLD-01**: Client books by saving a card (3DS completed at checkout) with no money taken, after ticking an unticked consent checkbox; consent text version, locale, time and IP are stored per booking
- [ ] **HOLD-02**: System automatically places a hold for the full amount a configurable time before pickup (default 72 h, set in admin)
- [ ] **HOLD-03**: If the booking is made inside the hold window, the hold is placed at checkout while the client is present
- [ ] **HOLD-04**: When the trip is completed, the held amount is captured; if the hold has expired, the system charges the saved card instead
- [ ] **HOLD-05**: If a hold or charge fails, the client automatically receives a payment link and the operator gets an alert that does not depend on the VPS
- [ ] **HOLD-06**: Cancelling a booking releases an uncaptured hold (no Stripe fee) or refunds a captured payment according to the cancellation policy
- [ ] **HOLD-07**: Admin shows each booking's payment state, hold expiry and the actions capture / release / retry / send payment link

### Cash and no-show (CASH)

- [ ] **CASH-01**: Client can choose "pay cash to driver"; the card is saved as a guarantee with no hold
- [ ] **CASH-02**: Driver can mark no-show only after the free waiting time has passed
- [ ] **CASH-03**: Operator confirms a no-show and charges 100% to the saved card with one action; the evidence (driver timestamps, contact attempt note) is stored
- [ ] **CASH-04**: Operator can mark a cash booking as settled in cash

### Cancellation policy (CANC)

- [ ] **CANC-01**: Free cancellation up to 1 h before pickup for trips up to 100 km, and up to 12 h before for trips over 100 km; later cancellations and no-shows cost 100%. Thresholds (km, hours, percent) are configurable in admin
- [ ] **CANC-02**: The cancellation policy and the card-saving consent are shown at checkout, in the confirmation email and in the terms, in all 7 locales (wording reviewed by counsel before launch)

### Extra charges (EXTRA)

- [ ] **EXTRA-01**: Operator can charge waiting time beyond the chosen wait (or other extras) to the saved card as a separate charge, with the amount computed from admin-configured rates

### Payment emails (MAIL)

- [ ] **MAIL-01**: Payment emails (card saved / hold placed / charged / payment failed with link / no-show charged / quote sent / deposit received) are sent in the client's booking language (7 locales)

### Driver flow (DRV)

- [ ] **DRV-01**: Driver trip page shows a single "next step" button; steps go strictly in order: en route → on site → passenger on board → completed
- [ ] **DRV-02**: Each driver step updates the booking status in admin immediately (reverses the v2.2 separate-field decision)
- [ ] **DRV-03**: The "completed" step asks for confirmation and triggers payment capture; the driver never enters an amount
- [ ] **DRV-04**: A skipped step is rejected by the server and a repeated tap is harmless
- [ ] **DRV-05**: For GNet bookings, driver steps are automatically pushed to GNet without duplicates, and no hold, capture or no-show charge is made

### Admin shell (ADM)

- [ ] **ADM-01**: Admin sidebar can be collapsed and expanded; the choice persists between visits
- [ ] **ADM-02**: Admin has a light theme toggle; the choice persists, with no flash on load and no effect on the public site
- [ ] **ADM-03**: All admin screens are readable in both themes (hard-coded colours replaced with theme tokens; a test blocks new hard-coded colours)

### Dispatch views (DISP)

- [ ] **DISP-01**: Operator sees bookings as a kanban board by status for a chosen date range
- [ ] **DISP-02**: Operator can move a card to another status by drag-and-drop or menu; only allowed transitions are accepted and moves with a money effect ask for confirmation
- [ ] **DISP-03**: Operator sees bookings in a calendar with day, week and month views (Prague time), coloured by status
- [ ] **DISP-04**: Clicking a booking in the kanban or calendar opens the same booking detail panel as the list
- [ ] **DISP-05**: Board and calendar refresh automatically so driver updates appear without reload

### Stops and airport (STOP)

- [ ] **STOP-01**: Client can add intermediate stops when booking a transfer
- [ ] **STOP-02**: Price is calculated by distance through all stops, recomputed on the server
- [ ] **STOP-03**: Client chooses a waiting time for each stop; the first 15 min are free and each further 15 min costs a fee set in admin
- [ ] **STOP-04**: Stops and their waiting times are saved with the booking and visible in admin, on the driver page and in emails
- [ ] **STOP-05**: For airport pickups the client sets a pickup time after landing (e.g. landing 14:00, pickup 14:30); 60 min free waiting counts from the pickup time; both times are stored and shown to the driver

### Quotes (QUOTE)

- [ ] **QUOTE-01**: Operator can build a quote of several trips or days (each line with route, date, time, vehicle, price) in admin
- [ ] **QUOTE-02**: Client opens the quote by a secret link (unguessable, expiring, not indexed) and sees an itemised summary
- [ ] **QUOTE-03**: Operator sets a deposit as a percent or fixed amount; client pays it via the quote page, which also saves the card
- [ ] **QUOTE-04**: Operator chooses how the remainder is collected per quote: saved card (hold/capture per trip), payment link, cash to driver, or invoice
- [ ] **QUOTE-05**: Client accepts the quote with a logged acceptance; on deposit payment each line becomes a booking linked to the quote
- [ ] **QUOTE-06**: Quote lifecycle (draft, sent, viewed, accepted, paid, expired) is visible in admin; editing a sent quote creates a new version and voids the old links
- [ ] **QUOTE-07**: Client can download the quote as a PDF, and the quote email includes the PDF

### Day trips (TRIP)

- [ ] **TRIP-01**: Visitor can browse a day-trip catalogue (5–6 tours at launch: e.g. Karlovy Vary, Český Krumlov, Kutná Hora, Dresden, Karlštejn, Bohemian Switzerland) in all 7 locales
- [ ] **TRIP-02**: Each tour page shows gallery, duration, itinerary, includes/excludes, pickup, FAQ and cancellation terms, with structured data and live prices only (no typed prices)
- [ ] **TRIP-03**: Tour price is per car by class (E / S / V), edited in admin
- [ ] **TRIP-04**: Client can book a tour online with date, time, vehicle and passengers, using the same payment modes as transfers
- [ ] **TRIP-05**: Operator can add, edit, publish and unpublish tours in admin
- [ ] **TRIP-06**: Visitor who finds nothing suitable can request a custom tour (destinations, date, people, wishes); the request becomes a lead in Supabase/EspoCRM/Chatwoot
- [ ] **TRIP-07**: Operator can answer a custom-tour request with a quote from admin

## Future Requirements

Deferred; tracked but not in this roadmap.

- **DISP-F1**: Calendar by driver/vehicle (resource view with overlaps)
- **DISP-F2**: Supabase Realtime instead of polling
- **TRIP-F1**: Per-slot availability/inventory for tours
- **CANC-F1**: Self-service cancellation portal for clients
- **DRV-F1**: Live GPS tracking of driver

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hold placed ~5 days before pickup | Visa merchant-initiated holds last 4 d 18 h — would expire before the trip; replaced by configurable 72 h lead + fallback charge |
| Stripe extended / incremental authorization | IC+ pricing only, customer-initiated only on Visa, excludes limousines on Discover |
| Automatic no-show charge on driver tap | Chargeback and wrong-charge risk; operator confirms |
| Per-person tour pricing | Owner decision: price per car by class |
| Stripe Quotes / Invoicing products | Own quote page fits existing booking model; Payment Links cannot attach a Customer |
| Fake scarcity or fabricated reviews on tour pages | Trust and legal risk; real reviews only |
| Prices or Uber comparisons in marketing content | Project content rule |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PAYF-01 | Phase 88 | Pending |
| PAYF-02 | Phase 87 | Pending |
| PAYF-03 | Phase 88 | Pending |
| PAYF-04 | Phase 88 | Pending |
| PAYF-05 | Phase 88 | Pending |
| HOLD-01 | Phase 88 | Pending |
| HOLD-02 | Phase 88 | Pending |
| HOLD-03 | Phase 88 | Pending |
| HOLD-04 | Phase 88 | Pending |
| HOLD-05 | Phase 88 | Pending |
| HOLD-06 | Phase 89 | Pending |
| HOLD-07 | Phase 88 | Pending |
| CASH-01 | Phase 89 | Pending |
| CASH-02 | Phase 89 | Pending |
| CASH-03 | Phase 89 | Pending |
| CASH-04 | Phase 89 | Pending |
| CANC-01 | Phase 89 | Pending |
| CANC-02 | Phase 89 | Pending |
| EXTRA-01 | Phase 91 | Pending |
| MAIL-01 | Phase 88 | Pending |
| DRV-01 | Phase 87 | Pending |
| DRV-02 | Phase 87 | Pending |
| DRV-03 | Phase 87 | Pending |
| DRV-04 | Phase 87 | Pending |
| DRV-05 | Phase 87 | Pending |
| ADM-01 | Phase 86 | Pending |
| ADM-02 | Phase 86 | Pending |
| ADM-03 | Phase 86 | Pending |
| DISP-01 | Phase 90 | Pending |
| DISP-02 | Phase 90 | Pending |
| DISP-03 | Phase 90 | Pending |
| DISP-04 | Phase 90 | Pending |
| DISP-05 | Phase 90 | Pending |
| STOP-01 | Phase 91 | Pending |
| STOP-02 | Phase 91 | Pending |
| STOP-03 | Phase 91 | Pending |
| STOP-04 | Phase 91 | Pending |
| STOP-05 | Phase 91 | Pending |
| QUOTE-01 | Phase 92 | Pending |
| QUOTE-02 | Phase 92 | Pending |
| QUOTE-03 | Phase 92 | Pending |
| QUOTE-04 | Phase 92 | Pending |
| QUOTE-05 | Phase 92 | Pending |
| QUOTE-06 | Phase 92 | Pending |
| QUOTE-07 | Phase 92 | Pending |
| TRIP-01 | Phase 93 | Pending |
| TRIP-02 | Phase 93 | Pending |
| TRIP-03 | Phase 93 | Pending |
| TRIP-04 | Phase 93 | Pending |
| TRIP-05 | Phase 93 | Pending |
| TRIP-06 | Phase 93 | Pending |
| TRIP-07 | Phase 93 | Pending |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52 ✓
- Unmapped: 0

**Per phase:** 86 Admin Shell (3) · 87 Status Service & Driver Step Flow (6) · 88 Card on File & Scheduled Holds (11) · 89 Cancellation Policy, Cash Guarantee & No-Show (7) · 90 Dispatch Views (5) · 91 Multi-Stop, Airport Pickup & Waiting Fees (6) · 92 Quotes (7) · 93 Day Trips & Custom Tours (7)

**Mapping notes:**
- DRV-03 is owned by Phase 87 (confirmation, no amount entry, single completion event); the capture it triggers is verified in Phase 88 under HOLD-04.
- MAIL-01 is owned by Phase 88 (language-aware payment-email mechanism and the card-lifecycle templates); the no-show email (Phase 89) and quote emails (Phase 92) reuse it.
- EXTRA-01 sits with Phase 91 because the waiting rates and free-wait rules it bills against are defined there.
- Status stays "Pending" until a phase passes verification.

---
*Requirements defined: 2026-11-02*
*Last updated: 2026-11-02 after roadmap creation (traceability filled, 52/52 mapped)*
